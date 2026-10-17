import { invalidate } from "@/lib/server/cache";
import { registerRoot } from "@/lib/server/vault-chains";
import { bad } from "@/lib/server/validate";

/** Opts a vault chain into holder rewards by its first vault's pk hash. Idempotent; the address is derived. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.pkHash !== "string") return bad("pkHash required");
  try {
    const root = await registerRoot("pqc_vault_roots", body.pkHash.toLowerCase());
    await invalidate("rewards:summary:");
    return Response.json({ root });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not register");
  }
}
