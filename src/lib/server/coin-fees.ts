import "server-only";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { bondingCurvePda, canonicalPumpPoolPdaWithQuote } from "@pump-fun/pump-sdk";
import { creatorFeeIn, type RawTx } from "@/lib/pump-events";
import { getStored, store } from "./cache";
import { connection } from "./solana";

/**
 * Exact creator fees one coin has earned, summed from its trade events on the
 * bonding curve and its canonical PumpSwap pool. Indexed incrementally in Redis:
 * each refresh only reads signatures newer than the last one it processed, and
 * writes old + delta (so two refreshes racing write the same total, never double it).
 */

type FeeIndex = { newest: Record<string, string | null>; feeRaw: string; trades: number; lastAt: number | null };
const KEY = (mint: string) => `coinfees:v1:${mint}`;
const TTL = 365 * 86_400_000;
const MAX_PER_REFRESH = 3000;

async function rpcBatch(sigs: string[]): Promise<{ sig: string; tx: RawTx & { blockTime?: number | null } }[]> {
  const body = sigs.map((s, i) => ({ jsonrpc: "2.0", id: i, method: "getTransaction", params: [s, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }] }));
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(process.env.HELIUS_RPC_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (Array.isArray(json)) return json.sort((a, b) => a.id - b.id).map((x) => ({ sig: sigs[x.id], tx: x.result }));
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  throw new Error("RPC batch failed");
}

/** New signatures for an address since `until`, oldest first. */
async function newSigs(address: PublicKey, until: string | null) {
  const out: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 30; page++) {
    const batch = await connection.getSignaturesForAddress(address, { before, until: until ?? undefined, limit: 1000 });
    out.push(...batch.filter((s) => !s.err).map((s) => s.signature));
    if (batch.length < 1000) break;
    before = batch.at(-1)!.signature;
  }
  return out.reverse();
}

export type CoinFees = { feeRaw: bigint; trades: number; lastAt: number | null; pool: string };

export async function coinFees(mint: string, quoteMint: string | null): Promise<CoinFees> {
  const mintKey = new PublicKey(mint);
  const curve = bondingCurvePda(mintKey);
  const pool = canonicalPumpPoolPdaWithQuote(mintKey, quoteMint ? new PublicKey(quoteMint) : NATIVE_MINT);
  const index = (await getStored<FeeIndex>(KEY(mint)).catch(() => undefined)) ?? { newest: {}, feeRaw: "0", trades: 0, lastAt: null };

  let fee = BigInt(index.feeRaw);
  let trades = index.trades;
  let lastAt = index.lastAt;
  const newest = { ...index.newest };
  const seen = new Set<string>();
  let budget = MAX_PER_REFRESH;

  for (const address of [curve, pool]) {
    const key = address.toBase58();
    const sigs = (await newSigs(address, newest[key] ?? null)).slice(0, budget);
    budget -= sigs.length;
    for (let i = 0; i < sigs.length; i += 50) {
      for (const { sig, tx } of await rpcBatch(sigs.slice(i, i + 50))) {
        if (seen.has(sig)) continue; // a tx touching both (the migration) counts once
        seen.add(sig);
        const f = creatorFeeIn(tx, mint, pool.toBase58());
        if (f > 0n) {
          fee += f;
          trades++;
          if (tx?.blockTime) lastAt = Math.max(lastAt ?? 0, tx.blockTime);
        }
      }
      // Oldest first, so the cursor only moves past what was processed.
      newest[key] = sigs[Math.min(i + 49, sigs.length - 1)];
    }
    if (budget <= 0) break;
  }

  store(KEY(mint), { newest, feeRaw: fee.toString(), trades, lastAt } satisfies FeeIndex, TTL);
  return { feeRaw: fee, trades, lastAt, pool: pool.toBase58() };
}
