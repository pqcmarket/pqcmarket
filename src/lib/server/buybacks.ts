import "server-only";
import { PublicKey } from "@solana/web3.js";
import { cached, getStored, store } from "./cache";
import { dexStats, solPrice } from "./dexscreener";
import { connection } from "./solana";

/**
 * $PQC buyback and burn, read straight from the chain: every transaction of the
 * buyback wallet, classified by its own token balance changes. A buy raises the
 * wallet's $PQC and costs SOL; a burn lowers it with a Burn instruction. Nothing
 * depends on the (local) keeper process, so the page can't drift from reality.
 */

export const BUYBACK_WALLET = "GVsbAYYWAZDWZLLxXMzc8Y1ZSgLXJBD3SoJ5NfX6xQFr";
export const PQC_MINT = "7K52aYQW9rWGjwZmQ7o2d1P6E7bji6hSMsqaLy5EcxLh";
const DECIMALS = 6;
const INITIAL_SUPPLY = 1_000_000_000; // every pump.fun coin starts at 1B

type Event = { sig: string; at: number; kind: "buy" | "burn"; pqc: number; sol?: number };
type Index = { newest: string | null; events: Event[] }; // newest first

const INDEX_KEY = "buybacks:index:v2";
const INDEX_TTL = 90 * 86_400_000;

type RpcTx = {
  blockTime: number | null;
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: { mint: string; owner?: string; uiTokenAmount: { amount: string } }[];
    postTokenBalances?: { mint: string; owner?: string; uiTokenAmount: { amount: string } }[];
    logMessages?: string[];
  } | null;
};

/** Raw JSON-RPC so any transaction version parses. */
async function getTx(sig: string): Promise<RpcTx | null> {
  const res = await fetch(process.env.HELIUS_RPC_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

function classify(sig: string, tx: RpcTx): Event | null {
  const m = tx.meta;
  if (!m || m.err || !tx.blockTime) return null;
  // This wallet also created $PQC; its launch dev buy is not a buyback.
  const logs = m.logMessages ?? [];
  if (logs.some((l) => /Instruction: Create/.test(l))) return null;
  const held = (list: NonNullable<RpcTx["meta"]>["preTokenBalances"]) =>
    Number((list ?? []).find((b) => b.mint === PQC_MINT && b.owner === BUYBACK_WALLET)?.uiTokenAmount.amount ?? 0);
  const delta = (held(m.postTokenBalances) - held(m.preTokenBalances)) / 10 ** DECIMALS;
  if (delta > 0) {
    // The wallet pays the fee (account 0), so its SOL change is the full cost.
    const sol = (m.preBalances[0] - m.postBalances[0]) / 1e9;
    return sol > 0 ? { sig, at: tx.blockTime, kind: "buy", pqc: delta, sol } : null;
  }
  if (delta < 0 && logs.some((l) => /Instruction: Burn/.test(l))) return { sig, at: tx.blockTime, kind: "burn", pqc: -delta };
  return null;
}

/** New signatures since the last scan (all of them on the first run), oldest last. */
async function newSignatures(until: string | null) {
  const out: { signature: string; err: unknown }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page++) {
    const batch = await connection.getSignaturesForAddress(new PublicKey(BUYBACK_WALLET), { before, until: until ?? undefined, limit: 1000 });
    out.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }
  return out;
}

async function refreshIndex(): Promise<Index> {
  const index = (await getStored<Index>(INDEX_KEY).catch(() => undefined)) ?? { newest: null, events: [] };
  const sigs = await newSignatures(index.newest);
  if (!sigs.length) return index;

  const fresh: Event[] = [];
  const ok = sigs.filter((s) => !s.err);
  for (let i = 0; i < ok.length; i += 8) {
    const txs = await Promise.all(ok.slice(i, i + 8).map((s) => getTx(s.signature)));
    txs.forEach((tx, j) => {
      const e = tx && classify(ok[i + j].signature, tx);
      if (e) fresh.push(e);
    });
  }
  const next: Index = { newest: sigs[0].signature, events: [...fresh.sort((a, b) => b.at - a.at), ...index.events] };
  store(INDEX_KEY, next, INDEX_TTL);
  return next;
}

export type Revenue = {
  wallet: string;
  mint: string;
  burned: number;
  bought: number;
  solSpent: number;
  buys: number;
  burns: number;
  lastAt: number | null;
  supply: { initial: number; current: number | null; burnedPct: number | null };
  pqcPrice: number | null;
  solPrice: number | null;
  series: [number, number][]; // [unix seconds, cumulative PQC burned]
  recent: Event[];
};

export function revenue(): Promise<Revenue> {
  return cached("buybacks:revenue:v2", 30_000, async () => {
    const [index, supply, stats, sol] = await Promise.all([
      refreshIndex(),
      connection.getTokenSupply(new PublicKey(PQC_MINT)).then((s) => Number(s.value.uiAmountString)).catch(() => null),
      dexStats([PQC_MINT]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>),
      solPrice().catch(() => null),
    ]);
    const events = index.events;
    const burns = events.filter((e) => e.kind === "burn");
    const buys = events.filter((e) => e.kind === "buy");

    // Cumulative burn over time, downsampled to at most 240 points.
    let total = 0;
    const all = [...burns].reverse().map((e) => [e.at, (total += e.pqc)] as [number, number]);
    const step = Math.max(1, Math.ceil(all.length / 240));
    const series = all.filter((_, i) => i % step === 0 || i === all.length - 1);

    return {
      wallet: BUYBACK_WALLET,
      mint: PQC_MINT,
      burned: total,
      bought: buys.reduce((s, e) => s + e.pqc, 0),
      solSpent: buys.reduce((s, e) => s + (e.sol ?? 0), 0),
      buys: buys.length,
      burns: burns.length,
      lastAt: events[0]?.at ?? null,
      supply: { initial: INITIAL_SUPPLY, current: supply, burnedPct: supply !== null ? ((INITIAL_SUPPLY - supply) / INITIAL_SUPPLY) * 100 : null },
      pqcPrice: stats[PQC_MINT]?.price ?? null,
      solPrice: sol,
      series,
      recent: events.slice(0, 60),
    };
  });
}
