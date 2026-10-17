import { rewardsSummary } from "@/lib/server/holder-rewards";
import { bad, isPubkey } from "@/lib/server/validate";

/**
 * A rewards coin's fees, the holders' share, what's been paid, and its quantum
 * holders. `?holders=1` includes every holder (the payout script); `?root=`
 * returns one vault chain's holding and earnings.
 */
export async function GET(request: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) return bad("Invalid mint");
  const params = new URL(request.url).searchParams;
  try {
    const summary = await rewardsSummary(mint);
    if (!summary) return bad("Not a holder-rewards coin", 404);
    const { holders, ...rest } = summary;
    const root = params.get("root");
    if (root) return Response.json({ ...rest, position: holders.find((h) => h.root === root) ?? null });
    return Response.json(params.get("holders") === "1" ? summary : rest);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "rewards unavailable" }, { status: 500 });
  }
}
