import "server-only";
import { PublicKey } from "@solana/web3.js";
import { cached, getStored, store } from "./cache";
import { dexStats, solPrice } from "./dexscreener";
import { connection } from "./solana";
import { accounts, listRoots, registerRoot, tokenAmount, walk } from "./vault-chains";
import { associatedTokenAddress } from "@/lib/vault";
import { POOL_TOKENS } from "@/lib/vault/pool";

/**
 * Post-quantum pools: positions are vault chains (see lib/vault/pool.ts). This
 * resolves each registered chain to its live vault and balances, and reads the
 * yield paid so far from the rewards wallet's transactions on-chain.
 */

export const REWARDS_WALLET = process.env.POOL_REWARDS_WALLET || null;
export const EPOCH_HOURS = Number(process.env.POOL_EPOCH_HOURS ?? 24);
const PQC_MINT = POOL_TOKENS.find((t) => t.symbol === "PQC")!.mint!;

export type Position = {
  root: string;
  vault: string; // live (unspent) vault
  chain: string[]; // every vault the position has lived in, root first
  balances: Record<string, number>; // symbol → UI amount
  usd: number;
  yieldSol: number;
};

/** Registers a pool position by its first vault's pk hash. */
export function registerPosition(pkHashHex: string): Promise<string> {
  return registerRoot("pqc_pool_positions", pkHashHex);
}

type YieldIndex = { newest: string | null; paid: Record<string, number>; events: { at: number; sol: number }[] };
const YIELD_KEY = "pools:yield:v1";

/** Incrementally indexes the rewards wallet's SOL transfers (lamports per destination). */
async function yieldIndex(): Promise<YieldIndex> {
  const index = (await getStored<YieldIndex>(YIELD_KEY).catch(() => undefined)) ?? { newest: null, paid: {}, events: [] };
  if (!REWARDS_WALLET) return index;
  const sigs: { signature: string; err: unknown }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page++) {
    const batch = await connection.getSignaturesForAddress(new PublicKey(REWARDS_WALLET), { before, until: index.newest ?? undefined, limit: 1000 });
    sigs.push(...batch);
    if (batch.length < 1000) break;
    before = batch.at(-1)!.signature;
  }
  if (!sigs.length) return index;
  const ok = sigs.filter((s) => !s.err);
  for (let i = 0; i < ok.length; i += 8) {
    const txs = await Promise.all(
      ok.slice(i, i + 8).map((s) =>
        connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null),
      ),
    );
    for (const tx of txs) {
      if (!tx?.blockTime) continue;
      let total = 0;
      for (const ix of tx.transaction.message.instructions) {
        if (!("parsed" in ix) || ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
        const { source, destination, lamports } = ix.parsed.info as { source: string; destination: string; lamports: number };
        if (source !== REWARDS_WALLET) continue;
        index.paid[destination] = (index.paid[destination] ?? 0) + lamports;
        total += lamports;
      }
      if (total) index.events.push({ at: tx.blockTime, sol: total / 1e9 });
    }
  }
  index.newest = sigs[0].signature;
  store(YIELD_KEY, index, 365 * 86_400_000);
  return index;
}

export type PoolsSummary = {
  live: boolean;
  rewardsWallet: string | null;
  epochHours: number;
  tvlUsd: number;
  tokens: { symbol: string; amount: number; usd: number }[];
  depositors: number;
  yieldSol: number;
  yield7dSol: number;
  aprPct: number | null;
  lastYieldAt: number | null;
  solPrice: number | null;
  positions: Position[];
};

export function poolsSummary(): Promise<PoolsSummary> {
  return cached("pools:summary:v1", 30_000, async () => {
    const [rootList, sol, stats, yi] = await Promise.all([
      listRoots("pqc_pool_positions"),
      solPrice().catch(() => null),
      dexStats([PQC_MINT]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>),
      yieldIndex(),
    ]);
    const price: Record<string, number> = { SOL: sol ?? 0, USDC: 1, PQC: stats[PQC_MINT]?.price ?? 0 };
    const { chains, lamports } = await walk(rootList);

    // Token balances of each live vault (ATAs of the supported mints).
    const tokens = POOL_TOKENS.filter((t) => t.mint);
    const ata = (vault: string, t: (typeof tokens)[number]) =>
      associatedTokenAddress(new PublicKey(vault), new PublicKey(t.mint!), new PublicKey(t.tokenProgram!)).toBase58();
    const live = rootList.map((r) => chains.get(r)!.at(-1)!);
    const atas = await accounts(live.flatMap((v) => tokens.map((t) => ata(v, t))));

    const positions: Position[] = rootList.map((root) => {
      const chain = chains.get(root)!;
      const vault = chain.at(-1)!;
      const balances: Record<string, number> = { SOL: (lamports.get(root) ?? 0) / 1e9 };
      for (const t of tokens) balances[t.symbol] = tokenAmount(atas.get(ata(vault, t))?.data) / 10 ** t.decimals;
      const usd = Object.entries(balances).reduce((s, [sym, amt]) => s + amt * (price[sym] ?? 0), 0);
      const yieldSol = chain.reduce((s, a) => s + (yi.paid[a] ?? 0), 0) / 1e9;
      return { root, vault, chain, balances, usd, yieldSol };
    });

    const totals = POOL_TOKENS.map((t) => {
      const amount = positions.reduce((s, p) => s + (p.balances[t.symbol] ?? 0), 0);
      return { symbol: t.symbol, amount, usd: amount * (price[t.symbol] ?? 0) };
    });
    const tvlUsd = totals.reduce((s, t) => s + t.usd, 0);
    const weekAgo = Date.now() / 1000 - 7 * 86_400;
    const yield7dSol = yi.events.filter((e) => e.at >= weekAgo).reduce((s, e) => s + e.sol, 0);
    const aprPct = tvlUsd > 0 && sol && yield7dSol > 0 ? ((yield7dSol * sol * 52) / tvlUsd) * 100 : null;

    return {
      live: Boolean(REWARDS_WALLET),
      rewardsWallet: REWARDS_WALLET,
      epochHours: EPOCH_HOURS,
      tvlUsd,
      tokens: totals,
      depositors: positions.filter((p) => p.usd >= 1).length,
      yieldSol: yi.events.reduce((s, e) => s + e.sol, 0),
      yield7dSol,
      aprPct,
      lastYieldAt: yi.events.length ? Math.max(...yi.events.map((e) => e.at)) : null,
      solPrice: sol,
      positions,
    };
  });
}
