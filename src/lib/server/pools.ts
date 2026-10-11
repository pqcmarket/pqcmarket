import "server-only";
import { PublicKey } from "@solana/web3.js";
import { cached, getStored, store } from "./cache";
import { dexStats, solPrice } from "./dexscreener";
import { connection } from "./solana";
import { db } from "./supabase";
import { associatedTokenAddress, decodeTombstone, vaultAddress } from "@/lib/vault";
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

/** Registers a chain by its first vault's pk hash; the address is derived, never trusted. */
export async function registerPosition(pkHashHex: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(pkHashHex)) throw new Error("Bad pk hash");
  const [root] = vaultAddress(Uint8Array.from(Buffer.from(pkHashHex, "hex")));
  // Only funded or used vaults: a random hash would point at an empty address.
  const info = await connection.getAccountInfo(root, "confirmed");
  if (!info) throw new Error("Deposit first: the vault has to exist on-chain");
  const { error } = await db.from("pqc_pool_positions").upsert({ root_vault: root.toBase58(), pk_hash: pkHashHex }, { onConflict: "root_vault", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return root.toBase58();
}

async function roots(): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("pqc_pool_positions").select("root_vault").order("root_vault").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => r.root_vault as string));
    if (!data || data.length < 1000) return out;
  }
}

async function accounts(addresses: string[]) {
  const out = new Map<string, Awaited<ReturnType<typeof connection.getMultipleAccountsInfo>>[number]>();
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk.map((a) => new PublicKey(a)), "confirmed");
    chunk.forEach((a, j) => out.set(a, infos[j]));
  }
  return out;
}

/** Follows tombstones from each root to the first unspent vault. */
async function walk(rootList: string[]) {
  const chains = new Map(rootList.map((r) => [r, [r]]));
  let open = [...rootList];
  const lamports = new Map<string, number>();
  for (let hop = 0; hop < 128 && open.length; hop++) {
    const tips = open.map((r) => chains.get(r)!.at(-1)!);
    const infos = await accounts(tips);
    const next: string[] = [];
    for (const r of open) {
      const tip = chains.get(r)!.at(-1)!;
      const info = infos.get(tip) ?? null;
      const tomb = info ? decodeTombstone({ owner: info.owner, data: info.data, lamports: info.lamports }) : null;
      if (tomb) {
        chains.get(r)!.push(tomb.nextVault.toBase58());
        next.push(r);
      } else lamports.set(r, info?.lamports ?? 0);
    }
    open = next;
  }
  return { chains, lamports };
}

/** u64 amount at offset 64 of an SPL / Token-2022 account. */
const tokenAmount = (data: Buffer | Uint8Array | undefined) => (data && data.length >= 72 ? Number(Buffer.from(data).readBigUInt64LE(64)) : 0);

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
      roots(),
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
