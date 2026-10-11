// Sanity checks for pool identities: distinct from the personal vault chain,
// deterministic, and the server-side PDA derivation matches the client key.
import { randomBytes } from "node:crypto";
import { VaultKey, vaultAddress } from "../src/lib/vault";
import { poolIdentity } from "../src/lib/vault/pool";

const id = { skSeed: new Uint8Array(randomBytes(32)), pubSeed: new Uint8Array(randomBytes(32)) };
const pool = poolIdentity(id);
const personal0 = VaultKey.fromIdentity(id, 0);
const pool0 = VaultKey.fromIdentity(pool, 0);
const pool0again = VaultKey.fromIdentity(poolIdentity(id), 0);
const pool1 = VaultKey.fromIdentity(pool, 1);
const [derived] = vaultAddress(pool0.pkHash);

const checks: [string, boolean][] = [
  ["pool vault differs from personal vault", !pool0.address.equals(personal0.address)],
  ["pool derivation is deterministic", pool0.address.equals(pool0again.address)],
  ["pool vault #1 differs from #0", !pool1.address.equals(pool0.address)],
  ["server PDA(pkHash) matches client address", derived.equals(pool0.address)],
];
for (const [name, ok] of checks) console.log(ok ? "ok  " : "FAIL", name);
if (checks.some(([, ok]) => !ok)) process.exit(1);
