"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { ago, cn, short } from "@/lib/format";
import { CopyText, Panel, Pill, Skeleton } from "./ui";

type Event = { sig: string; at: number; kind: "buy" | "burn"; pqc: number; sol?: number };
type Revenue = {
  wallet: string;
  mint: string;
  burned: number;
  bought: number;
  solSpent: number;
  buys: number;
  burns: number;
  lastAt: number | null;
  supply: { initial: number; current: number | null; burnedPct: number | null };
  pqcPrice: number | null;
  solPrice: number | null;
  series: [number, number][];
  recent: Event[];
};

const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const dollars = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const iso = (unix: number) => new Date(unix * 1000).toISOString();

export function RevenueView() {
  const [data, setData] = useState<Revenue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/revenue", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.error) setFailed(true);
          else {
            setData(j);
            setFailed(false);
          }
        })
        .catch(() => !cancelled && setFailed(true));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-bold tracking-tight">Revenue</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          60% of platform revenue buys $PQC on the open market and burns it, every 30 minutes. Every number here is read live from Solana, so
          anyone can check it against the chain.
        </p>
      </div>

      {failed && !data && <Panel className="p-6 text-[13px] text-muted">Couldn&apos;t load buyback data right now. Retrying every 30 seconds.</Panel>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="$PQC bought & burned"
          value={data ? tokens(data.burned) : null}
          sub={data?.pqcPrice ? `≈ ${dollars(data.burned * data.pqcPrice)} today` : undefined}
          accent
        />
        <Stat label="SOL spent on buybacks" value={data ? `${data.solSpent.toFixed(2)} SOL` : null} sub={data?.solPrice ? `≈ ${dollars(data.solSpent * data.solPrice)}` : undefined} />
        <Stat label="Buybacks" value={data ? data.burns.toLocaleString("en-US") : null} sub={data?.lastAt ? `last ${ago(iso(data.lastAt))}` : undefined} />
        <Stat
          label="Total supply burned"
          value={data?.supply.burnedPct != null ? `${data.supply.burnedPct.toFixed(2)}%` : data ? "—" : null}
          sub={data?.supply.current != null ? `${tokens(data.supply.initial - data.supply.current)} $PQC, all sources` : undefined}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_320px]">
        <Panel className="p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[13px] font-medium">Burned over time</div>
            <div className="font-mono text-[11px] text-dim">cumulative $PQC</div>
          </div>
          <div className="mt-4 h-[220px]">{data ? <BurnChart series={data.series} /> : <Skeleton className="h-full w-full" />}</div>
        </Panel>

        <Panel className="p-5">
          <div className="text-[13px] font-medium">Where revenue goes</div>
          <div className="mt-4 space-y-4">
            <Split pct={60} label="$PQC buyback & burn" tone="up" status="live" />
            <Split pct={20} label="Post-quantum liquidity pools" status="soon" />
            <Split pct={20} label="Backing top performing tokens" status="soon" />
          </div>
        </Panel>
      </div>

      <Panel className="mt-3">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
          <div className="text-[13px] font-medium">Recent buybacks</div>
          <div className="font-mono text-[11px] text-dim">updates every 30s</div>
        </div>
        <Activity events={data?.recent ?? null} />
      </Panel>

      {data && (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] text-dim">
          <span className="flex items-center gap-2">
            buyback wallet <CopyText value={data.wallet} display={short(data.wallet, 6, 6)} />
          </span>
          <a
            href={`https://solscan.io/account/${data.wallet}`}
            target="_blank"
            rel="noreferrer"
            className="flex cursor-pointer items-center gap-1 text-muted transition-colors hover:text-fg"
          >
            view on Solscan <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string | null; sub?: string; accent?: boolean }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-1.5 text-[11.5px] text-dim">
        {accent && <Image src="/logo-mark.png" alt="" width={16} height={16} />}
        {label}
      </div>
      {value === null ? <Skeleton className="mt-2 h-7 w-24" /> : <div className="mt-1.5 font-mono text-[22px] tracking-tight">{value}</div>}
      <div className="mt-1 h-4 truncate font-mono text-[11px] text-muted">{sub}</div>
    </Panel>
  );
}

function Split({ pct, label, status, tone }: { pct: number; label: string; status: "live" | "soon"; tone?: "up" }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted">
          <span className="mr-2 font-mono text-fg">{pct}%</span>
          {label}
        </span>
        {status === "live" ? <Pill tone="up">live</Pill> : <Pill>soon</Pill>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", tone === "up" ? "bg-up" : "bg-line-strong")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BurnChart({ series }: { series: [number, number][] }) {
  if (series.length < 2) return <div className="flex h-full items-center justify-center text-[12px] text-dim">The chart fills in after a few buybacks.</div>;
  const W = 600;
  const H = 220;
  const t0 = series[0][0];
  const t1 = series[series.length - 1][0];
  const max = series[series.length - 1][1];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - 8 - (v / max) * (H - 24);
  const line = series.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fmt = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="relative h-full text-up">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="burn-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#burn-area)" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-0 top-0 font-mono text-[11px] text-muted">{tokens(max)}</div>
      <div className="absolute inset-x-0 -bottom-5 flex justify-between font-mono text-[10.5px] text-dim">
        <span>{fmt(t0)}</span>
        <span>{fmt(t1)}</span>
      </div>
    </div>
  );
}

/** Each burn, paired with the buy that funded it (same wallet, moments earlier). */
function Activity({ events }: { events: Event[] | null }) {
  const rows = useMemo(() => {
    if (!events) return null;
    const buys = events.filter((e) => e.kind === "buy");
    return events
      .filter((e) => e.kind === "burn")
      .map((burn) => ({ burn, buy: buys.find((b) => b.at <= burn.at && burn.at - b.at < 600 && Math.abs(b.pqc - burn.pqc) < 1) ?? null }));
  }, [events]);

  if (!rows) {
    return (
      <div className="space-y-2 p-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (!rows.length) return <div className="p-5 text-[12.5px] text-dim">No buybacks yet.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12.5px]">
        <thead>
          <tr className="text-left font-mono text-[11px] text-dim">
            <th className="px-5 py-2.5 font-normal">when</th>
            <th className="px-5 py-2.5 font-normal">spent</th>
            <th className="px-5 py-2.5 font-normal">$PQC burned</th>
            <th className="px-5 py-2.5 text-right font-normal">transactions</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map(({ burn, buy }) => (
            <tr key={burn.sig} className="border-t border-line">
              <td className="px-5 py-2.5 text-muted">{ago(iso(burn.at))}</td>
              <td className="px-5 py-2.5 font-mono">{buy?.sol != null ? `${buy.sol.toFixed(3)} SOL` : "—"}</td>
              <td className="px-5 py-2.5 font-mono text-up">
                <span className="inline-flex items-center gap-1">
                  <Image src="/logo-mark.png" alt="" width={14} height={14} />
                  {burn.pqc.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </td>
              <td className="px-5 py-2.5 text-right">
                <span className="inline-flex gap-3 font-mono text-[11.5px]">
                  {buy && <TxLink sig={buy.sig} label="buy" />}
                  <TxLink sig={burn.sig} label="burn" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TxLink({ sig, label }: { sig: string; label: string }) {
  return (
    <a
      href={`https://solscan.io/tx/${sig}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex cursor-pointer items-center gap-0.5 text-muted transition-colors hover:text-fg"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}
