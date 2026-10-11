import type { Metadata } from "next";
import { PoolsView } from "@/components/pools-view";

export const metadata: Metadata = {
  title: "Pools · pqc.market",
  description: "Post-quantum pools: deposit, earn platform revenue, withdraw only with an on-chain verified WOTS signature.",
};

export default function Page() {
  return <PoolsView />;
}
