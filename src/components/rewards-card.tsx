"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, Lock } from "lucide-react";
import { ago } from "@/lib/format";
import { VaultKey } from "@/lib/vault";
import { useIdentity } from "./identity";
import { ButtonLink, Panel, Skeleton } from "./ui";

type Summary = {
  shareBps: number;
  quoteSymbol: string;
  live: boolean;
  feesQuote: number;
  feesSol: number;
  feesUsd: number;
  holdersShareSol: number;
  paidSol: number;
  owedSol: number;
  trades: number;
  lastPaidAt: number | null;
  holdersCount: number;
  heldInVaults: number;
  supplyPct: number;
  position?: { amount: number; earnedSol: number } | null;
};

const sol = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 10 ? 2 : 4 });
const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** Quantum holder rewards on a coin page: what the coin has earned holders, and your share. */
export function RewardsCard({ mint, symbol }: { mint: string; symbol: string }) {
  const { unlocked } = useIdentity();
  // The viewer's personal vault chain, derived locally; only its first address is sent.
  const root = useMemo(() => (unlocked ? VaultKey.fromIdentity({ skSeed: unlocked.skSeed, pubSeed: unlocked.pubSeed }, 0).address.toBase58() : null), [unlocked]);
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/rewards/${mint}${root ? `?root=${root}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && !j.error && setData(j))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [mint, root]);

  const share = data ? Math.round(data.shareBps / 100) : 50;

  return (
    <Panel className="relative overflow-hidden border-up/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-up/[0.07] to-transparent" />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dim">
          <Gift size={11} className="text-up" /> Quantum holder rewards
        </span>
        <span className="font-mono text-[11px] text-up">{share}% of fees</span>
      </div>

      {data ? (
        <>
          <div className="relative mt-3 font-mono text-[26px] leading-none text-fg">
            {sol(data.holdersShareSol)}
            <span className="ml-1.5 text-[13px] text-muted">SOL to holders</span>
          </div>
          <div className="mt-1.5 text-[12px] text-dim">
            {share}% of {sol(data.feesQuote)} {data.quoteSymbol} in creator fees from {data.trades.toLocaleString("en-US")} trades
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11.5px]">
            <Cell k="paid out" v={`${sol(data.paidSol)} SOL`} />
            <Cell k="next payout" v={`${sol(data.owedSol)} SOL`} />
            <Cell k="quantum holders" v={data.holdersCount.toLocaleString("en-US")} />
            <Cell k="held in vaults" v={`${data.supplyPct.toFixed(2)}%`} />
          </dl>

          {unlocked ? (
            <div className="mt-4 rounded-lg border border-line bg-bg p-3">
              <div className="text-[11px] text-dim">Your vault</div>
              <div className="mt-1 flex items-baseline justify-between font-mono">
                <span className="text-[14px]">
                  {compact(data.position?.amount ?? 0)} <span className="text-[11px] text-muted">${symbol}</span>
                </span>
                <span className="text-[12px] text-up">+{sol(data.position?.earnedSol ?? 0)} SOL</span>
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            Keep ${symbol} in your quantum vault to earn. Rewards are paid in SOL into the vault itself, pro-rata by how much you held
            since the last payout, so only a hash-based signature can move them.
          </p>
          <ButtonLink href="/vault" variant="outline" size="sm" className="mt-3 w-full">
            <Lock size={12} /> {data.position?.amount ? "Add to your vault" : "Hold it in your vault"}
          </ButtonLink>
          <div className="mt-3 text-center font-mono text-[10.5px] text-dim">
            {data.live ? (data.lastPaidAt ? `last payout ${ago(new Date(data.lastPaidAt * 1000).toISOString())}` : "first payout within 24h") : "payouts start soon"}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      )}
    </Panel>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-dim">{k}</dt>
      <dd className="mt-0.5 text-fg">{v}</dd>
    </div>
  );
}
