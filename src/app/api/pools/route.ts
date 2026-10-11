import { poolsSummary } from "@/lib/server/pools";

/**
 * Pool totals (TVL, yield, APR). `?positions=1` adds every position with its live
 * vault and USD value, which the rewards distributor reads; `?root=` returns one.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const { positions, ...summary } = await poolsSummary();
    const root = params.get("root");
    if (root) return Response.json({ ...summary, position: positions.find((p) => p.root === root) ?? null });
    return Response.json(params.get("positions") === "1" ? { ...summary, positions } : summary);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "pools unavailable" }, { status: 500 });
  }
}
