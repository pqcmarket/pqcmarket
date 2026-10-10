import { revenue } from "@/lib/server/buybacks";

/** $PQC buyback and burn totals, read from the chain (cached 30s). */
export async function GET() {
  try {
    return Response.json(await revenue());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "revenue unavailable" }, { status: 500 });
  }
}
