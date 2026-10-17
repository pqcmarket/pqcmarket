/**
 * Creator fees from pump.fun trade events. Every bonding-curve trade emits a
 * TradeEvent (`creatorFee`) and every PumpSwap trade a Buy/Sell event
 * (`coinCreatorFee`), as Anchor self-CPI inner instructions or `Program data:`
 * logs. Amounts are in the coin's quote units (lamports for SOL).
 */
import bs58 from "bs58";
import { PumpSdk } from "@pump-fun/pump-sdk";

const sdk = new PumpSdk();

export type RawTx = {
  meta: { err: unknown; logMessages?: string[]; innerInstructions?: { instructions: { data: string }[] }[] } | null;
} | null;

/** Candidate event payloads in a transaction, with and without Anchor's 8-byte prefixes. */
function payloads(tx: NonNullable<RawTx>): Buffer[] {
  const out: Buffer[] = [];
  for (const ii of tx.meta?.innerInstructions ?? []) {
    for (const ix of ii.instructions) {
      try {
        const b = Buffer.from(bs58.decode(ix.data));
        if (b.length > 16) out.push(b.subarray(8), b.subarray(16));
      } catch {}
    }
  }
  for (const l of tx.meta?.logMessages ?? []) {
    if (!l.startsWith("Program data: ")) continue;
    const b = Buffer.from(l.slice(14), "base64");
    if (b.length > 8) out.push(b, b.subarray(8));
  }
  return out;
}

/**
 * The creator fee a transaction paid for `mint` (curve trades) or `pool`
 * (PumpSwap trades), as a bigint in quote base units; 0n if it holds no trade.
 * Each decoded event is checked against the mint / pool so a stray match can't count.
 */
export function creatorFeeIn(tx: RawTx, mint: string, pool: string | null): bigint {
  if (!tx?.meta || tx.meta.err) return 0n;
  const logs = tx.meta.logMessages ?? [];
  const amm = logs.some((l) => /Instruction: (Buy|Sell)(ExactQuoteIn)?(V\d)?$/.test(l)) && pool !== null;
  const seen = new Set<string>();
  let total = 0n;
  for (const buf of payloads(tx)) {
    const key = buf.toString("base64");
    if (seen.has(key)) continue;
    // Curve trade
    try {
      const ev = sdk.decodeTradeEventBc(buf);
      if (ev?.mint?.toBase58?.() === mint && ev.creatorFee) {
        seen.add(key);
        total += BigInt(ev.creatorFee.toString());
        continue;
      }
    } catch {}
    if (!amm) continue;
    for (const decode of [(b: Buffer) => sdk.decodeBuyEventAmm(b), (b: Buffer) => sdk.decodeSellEventAmm(b)]) {
      try {
        const ev = decode(buf);
        if (ev?.pool?.toBase58?.() === pool && ev.coinCreatorFee) {
          seen.add(key);
          total += BigInt(ev.coinCreatorFee.toString());
          break;
        }
      } catch {}
    }
  }
  return total;
}
