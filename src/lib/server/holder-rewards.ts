import "server-only";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { associatedTokenAddress } from "@/lib/vault";
import { cached, getStored, store } from "./cache";
import { coinFees } from "./coin-fees";
import { dexStats, solPrice } from "./dexscreener";
import { connection } from "./solana";
import { db } from "./supabase";
import { accounts, listRoots, tokenAmount, walk } from "./vault-chains";

/**
 * Quantum holder rewards: a share of a coin's creator fees (which accrue to the
 * treasury) is paid to holders who keep the coin in a pqc-vault. Fees come from
 * the coin's own trade events (coin-fees.ts); holdings from registered vault
 * chains; payouts from the rewards wallet, each tagged with a memo naming the coin.
 */

export const REWARDS_WALLET = process.env.HOLDER_REWARDS_WALLET || null;
export const MEMO_PREFIX = "pqc.market holder rewards ";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const COIN_DECIMALS = 6;
const SUPPLY = 1_000_000_000;

export type RewardCoin = { mint: string; name: string; symbol: string; image_url: string | null; reward_share_bps: number; quote_mint: string | null; quote_symbol: string | null };

export function rewardCoins(): Promise<RewardCoin[]> {
  return cached("rewards:coins:v1", 60_000, async () => {
    const { data, error } = await db
      .from("pqc_launches")
      .select("mint, name, symbol, image_url, reward_share_bps, quote_mint, quote_symbol")
      .eq("status", "live")
      .eq("reward_mode", "holders");
    if (error) throw new Error(error.message);
    return (data ?? []) as RewardCoin[];
  });
}

type PaidIndex = { newest: string | null; paid: Record<string, number>; byVault: Record<string, Record<string, number>>; lastAt: Record<string, number> };
const PAID_KEY = "rewards:paid:v1";

/** Lamports the rewards wallet has paid per coin (by memo) and per coin per vault. */
async function paidIndex(): Promise<PaidIndex> {
  const index = (await getStored<PaidIndex>(PAID_KEY).catch(() => undefined)) ?? { newest: null, paid: {}, byVault: {}, lastAt: {} };
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
      ok.slice(i, i + 8).map((s) => connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null)),
    );
    for (const tx of txs) {
      if (!tx?.blockTime) continue;
      const ixs = tx.transaction.message.instructions;
      const memo = ixs.find((ix) => ix.programId.toBase58() === MEMO_PROGRAM && "parsed" in ix);
      const text = memo && "parsed" in memo ? String(memo.parsed) : "";
      if (!text.startsWith(MEMO_PREFIX)) continue;
      const mint = text.slice(MEMO_PREFIX.length).trim();
      for (const ix of ixs) {
        if (!("parsed" in ix) || ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
        const { source, destination, lamports } = ix.parsed.info as { source: string; destination: string; lamports: number };
        if (source !== REWARDS_WALLET) continue;
        index.paid[mint] = (index.paid[mint] ?? 0) + lamports;
        index.byVault[mint] ??= {};
        index.byVault[mint][destination] = (index.byVault[mint][destination] ?? 0) + lamports;
        index.lastAt[mint] = Math.max(index.lastAt[mint] ?? 0, tx.blockTime);
      }
    }
  }
  index.newest = sigs[0].signature;
  store(PAID_KEY, index, 365 * 86_400_000);
  return index;
}

/** Quote mint decimals (SOL 9), cached for a day. */
function quoteDecimals(quoteMint: string | null): Promise<number> {
  if (!quoteMint) return Promise.resolve(9);
  return cached(`mint:decimals:${quoteMint}`, 86_400_000, async () => (await connection.getTokenSupply(new PublicKey(quoteMint))).value.decimals);
}

export type Holder = { root: string; vault: string; chain: string[]; amount: number; earnedSol: number; lamports: number };

export type RewardsSummary = {
  mint: string;
  shareBps: number;
  quoteSymbol: string;
  live: boolean;
  feesQuote: number;
  feesSol: number;
  feesUsd: number;
  holdersShareSol: number;
  paidSol: number;
  owedSol: number;
  trades: number;
  lastPaidAt: number | null;
  holdersCount: number;
  heldInVaults: number;
  supplyPct: number;
  holders: Holder[];
};

export function rewardsSummary(mint: string): Promise<RewardsSummary | null> {
  return cached(`rewards:summary:v1:${mint}`, 60_000, async () => {
    const coin = (await rewardCoins()).find((c) => c.mint === mint);
    if (!coin) return null;
    const [fees, decimals, sol, stats, paid, rootList] = await Promise.all([
      coinFees(mint, coin.quote_mint),
      quoteDecimals(coin.quote_mint),
      solPrice().catch(() => null),
      coin.quote_mint ? dexStats([coin.quote_mint]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>) : Promise.resolve({} as Awaited<ReturnType<typeof dexStats>>),
      paidIndex(),
      listRoots("pqc_vault_roots"),
    ]);
    const feesQuote = Number(fees.feeRaw) / 10 ** decimals;
    const quoteUsd = coin.quote_mint ? (stats[coin.quote_mint]?.price ?? 0) : (sol ?? 0);
    const feesUsd = feesQuote * quoteUsd;
    const feesSol = sol ? feesUsd / sol : coin.quote_mint ? 0 : feesQuote;
    const holdersShareSol = (feesSol * coin.reward_share_bps) / 10_000;
    const paidSol = (paid.paid[mint] ?? 0) / 1e9;

    // Who holds the coin in a registered vault right now.
    const { chains, lamports } = await walk(rootList);
    const ata = (vault: string) => associatedTokenAddress(new PublicKey(vault), new PublicKey(mint), TOKEN_2022_PROGRAM_ID).toBase58();
    const live = rootList.map((r) => chains.get(r)!.at(-1)!);
    const atas = await accounts(live.map(ata));
    const byVault = paid.byVault[mint] ?? {};
    const holders: Holder[] = rootList
      .map((root) => {
        const chain = chains.get(root)!;
        const vault = chain.at(-1)!;
        const amount = tokenAmount(atas.get(ata(vault))?.data) / 10 ** COIN_DECIMALS;
        const earnedSol = chain.reduce((s, a) => s + (byVault[a] ?? 0), 0) / 1e9;
        return { root, vault, chain, amount, earnedSol, lamports: lamports.get(root) ?? 0 };
      })
      .filter((h) => h.amount > 0 || h.earnedSol > 0);
    const heldInVaults = holders.reduce((s, h) => s + h.amount, 0);

    return {
      mint,
      shareBps: coin.reward_share_bps,
      quoteSymbol: coin.quote_symbol ?? "SOL",
      live: Boolean(REWARDS_WALLET),
      feesQuote,
      feesSol,
      feesUsd,
      holdersShareSol,
      paidSol,
      owedSol: Math.max(0, holdersShareSol - paidSol),
      trades: fees.trades,
      lastPaidAt: paid.lastAt[mint] ?? null,
      holdersCount: holders.filter((h) => h.amount > 0).length,
      heldInVaults,
      supplyPct: (heldInVaults / SUPPLY) * 100,
      holders,
    };
  });
}
