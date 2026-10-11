import { invalidate } from "@/lib/server/cache";
import { registerPosition } from "@/lib/server/pools";
import { bad } from "@/lib/server/validate";

/** Adds a pool position (its first vault's pk hash). Idempotent; the address is derived server-side. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.pkHash !== "string") return bad("pkHash required");
  try {
    const root = await registerPosition(body.pkHash.toLowerCase());
    await invalidate("pools:summary:");
    return Response.json({ root });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not register");
  }
}
