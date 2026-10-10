import type { Metadata } from "next";
import { RevenueView } from "@/components/revenue-view";

export const metadata: Metadata = {
  title: "Revenue · pqc.market",
  description: "$PQC buyback and burn, live from the chain.",
};

export default function Page() {
  return <RevenueView />;
}
