/**
 * Post-quantum pools, built on the vault program. A pool position is a chain of
 * WOTS vaults owned by a separate "pool identity" derived from the user's
 * identity, so every withdrawal is verified on-chain exactly like a vault spend,
 * and pool funds never mix with the personal vault. Yield (the pools' share of
 * platform revenue) is paid into each position's live vault.
 *
 *   pool.skSeed  = HKDF-SHA256(identity.skSeed,  salt = ∅, info = "pqc.market/pool/v1/sk",  32)
 *   pool.pubSeed = HKDF-SHA256(identity.pubSeed, salt = ∅, info = "pqc.market/pool/v1/pub", 32)
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { N } from "./constants";
import { utf8ToBytes } from "./bytes";
import type { Identity } from "./vault";

export function poolIdentity(identity: Identity): Identity {
  return {
    skSeed: hkdf(sha256, identity.skSeed, undefined, utf8ToBytes("pqc.market/pool/v1/sk"), N),
    pubSeed: hkdf(sha256, identity.pubSeed, undefined, utf8ToBytes("pqc.market/pool/v1/pub"), N),
  };
}

export type PoolToken = { mint: string | null; symbol: string; decimals: number; tokenProgram: string | null };

/** What the pool accepts. Positions are weighted by USD value across these. */
export const POOL_TOKENS: PoolToken[] = [
  { mint: null, symbol: "SOL", decimals: 9, tokenProgram: null },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
  { mint: "7K52aYQW9rWGjwZmQ7o2d1P6E7bji6hSMsqaLy5EcxLh", symbol: "PQC", decimals: 6, tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
];
