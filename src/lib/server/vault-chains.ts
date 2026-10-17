import "server-only";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "./solana";
import { db } from "./supabase";
import { decodeTombstone, vaultAddress } from "@/lib/vault";

/**
 * Registered vault chains (pool positions, holder-reward vaults): a chain is
 * stored by its first vault and followed through tombstones, each of which names
 * the next vault, to wherever the funds live now.
 */

export type ChainTable = "pqc_pool_positions" | "pqc_vault_roots";

/** Registers a chain by its first vault's pk hash; the address is derived, never trusted. */
export async function registerRoot(table: ChainTable, pkHashHex: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(pkHashHex)) throw new Error("Bad pk hash");
  const [root] = vaultAddress(Uint8Array.from(Buffer.from(pkHashHex, "hex")));
  // Only funded or used vaults: a random hash would point at an empty address.
  // A token-only deposit leaves the vault itself without an account, so token accounts count too.
  const info = await connection.getAccountInfo(root, "confirmed");
  if (!info) {
    const owned = await Promise.all(
      [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) => connection.getTokenAccountsByOwner(root, { programId }, "confirmed").then((r) => r.value.length)),
    );
    if (!owned.some(Boolean)) throw new Error("Deposit first: the vault has to exist on-chain");
  }
  const { error } = await db.from(table).upsert({ root_vault: root.toBase58(), pk_hash: pkHashHex }, { onConflict: "root_vault", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return root.toBase58();
}

export async function listRoots(table: ChainTable): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("root_vault").order("root_vault").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => r.root_vault as string));
    if (!data || data.length < 1000) return out;
  }
}

export async function accounts(addresses: string[]) {
  const out = new Map<string, Awaited<ReturnType<typeof connection.getMultipleAccountsInfo>>[number]>();
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk.map((a) => new PublicKey(a)), "confirmed");
    chunk.forEach((a, j) => out.set(a, infos[j]));
  }
  return out;
}

/** Follows tombstones from each root to the first unspent vault; also returns its lamports. */
export async function walk(rootList: string[]) {
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
export const tokenAmount = (data: Buffer | Uint8Array | undefined) => (data && data.length >= 72 ? Number(Buffer.from(data).readBigUInt64LE(64)) : 0);
