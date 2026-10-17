import { rewardCoins } from "@/lib/server/holder-rewards";

/** Every live coin with quantum holder rewards (the payout script reads this). */
export async function GET() {
  try {
    return Response.json({ coins: await rewardCoins() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "rewards unavailable" }, { status: 500 });
  }
}
