"use client";

import { useEffect, useState } from "react";
import { DIM, FG, Frame, GREEN, MUTED, TopBar } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Buyback & burn, live from /api/revenue (read from the chain): the total
 * burned, the cumulative burn curve and the latest buybacks. Cards, no rules.
 */

type Event = { sig: string; at: number; kind: "buy" | "burn"; pqc: number; sol?: number };
type Revenue = {
  burned: number;
  solSpent: number;
  burns: number;
  supply: { burnedPct: number | null };
  pqcPrice: number | null;
  series: [number, number][];
  recent: Event[];
};

const CARD = "rgba(255,255,255,0.035)";
const CARD_SCENE = "rgba(20,19,18,0.84)";

const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);
const ago = (unix: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86_400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86_400)}d ago`;
};

function useRevenue() {
  const [data, setData] = useState<Revenue | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/revenue")
      .then((r) => r.json())
      .then((j) => !cancelled && !j.error && setData(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/** The pqc.market mark (same-origin, so the PNG export includes it). */
function Mark({ size = 16 }: { size?: number }) {
  return <img src="/logo-mark.png" alt="" style={{ width: size * 1.3, height: size * 1.3, flexShrink: 0 }} />;
}

function Small({ value, label, bg }: { value: string; label: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30, lineHeight: 1, letterSpacing: -0.5, color: FG }}>{value}</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 14, color: MUTED }}>{label}</div>
    </div>
  );
}

function Curve({ series }: { series: [number, number][] }) {
  const W = 700;
  const H = 250;
  if (series.length < 2) return <div style={{ height: H }} />;
  const t0 = series[0][0];
  const t1 = series[series.length - 1][0];
  const max = series[series.length - 1][1];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - 12);
  const y = (v: number) => H - 6 - (v / max) * (H - 30);
  const line = series.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const [lx, ly] = [x(t1), y(max)];
  const fmt = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg width={W} height={H + 30} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="burn-curve" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.28" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${lx},${H} L0,${H} Z`} fill="url(#burn-curve)" />
      <path d={line} fill="none" stroke={GREEN} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={11} fill={GREEN} fillOpacity={0.18} />
      <circle cx={lx} cy={ly} r={5.5} fill={GREEN} />
      <text x={0} y={H + 26} fill={DIM} style={{ fontFamily: MONO, fontSize: 13 }}>
        {fmt(t0)}
      </text>
      <text x={W} y={H + 26} textAnchor="end" fill={DIM} style={{ fontFamily: MONO, fontSize: 13 }}>
        now
      </text>
    </svg>
  );
}

function Burn({ scene }: { scene?: boolean }) {
  const d = useRevenue();
  const bg = scene ? CARD_SCENE : CARD;
  const v = (f: (x: Revenue) => string) => (d ? f(d) : "…");
  const latest = (d?.recent ?? []).filter((e) => e.kind === "burn").slice(0, 3);
  const buyFor = (burn: Event) => d?.recent.find((b) => b.kind === "buy" && b.at <= burn.at && burn.at - b.at < 600 && Math.abs(b.pqc - burn.pqc) < 1);
  const pad = 88;

  return (
    <Frame w={1600} h={900} plain>
      {scene ? (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.15} y={0.35} />
          <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.7) 0%, rgba(18,17,16,0.88) 32%, rgba(18,17,16,0.95) 48%, rgba(18,17,16,0.96) 100%)" }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(1000px 560px at 85% 10%, rgba(63,185,80,0.06), transparent 70%)" }} />
      )}
      <TopBar pad={pad} right="pqc.market/revenue" />

      {/* left: the headline */}
      <div style={{ position: "absolute", left: pad, top: 278, width: 600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: GREEN }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
          BUYBACK &amp; BURN · LIVE
        </div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 84, lineHeight: 1, letterSpacing: -2.5, color: FG }}>{v((x) => tokens(x.burned))}</span>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 30, color: MUTED }}>$PQC burned</span>
        </div>
        <div style={{ marginTop: 22, fontFamily: SANS, fontSize: 20, lineHeight: 1.5, color: MUTED, maxWidth: 520 }}>
          60% of platform revenue buys $PQC on the open market and burns it, every 30 minutes.
        </div>
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Small value={v((x) => `${x.solSpent.toFixed(1)} SOL`)} label="spent on buybacks" bg={bg} />
          <Small value={v((x) => String(x.burns))} label="buybacks" bg={bg} />
          <Small value={v((x) => (x.supply.burnedPct != null ? `${x.supply.burnedPct.toFixed(2)}%` : "—"))} label="of supply burned" bg={bg} />
        </div>
      </div>

      {/* right: the curve and the latest burns */}
      <div style={{ position: "absolute", left: 764, right: pad, top: 168, bottom: 150, background: bg, borderRadius: 22, padding: "30px 34px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 15, color: MUTED }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Mark size={17} />
            cumulative $PQC burned
          </span>
          <span style={{ color: DIM, fontSize: 14 }}>read from the chain</span>
        </div>
        <div style={{ marginTop: 26 }}>{d && <Curve series={d.series} />}</div>
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {latest.map((burn) => {
            const buy = buyFor(burn);
            return (
              <div
                key={burn.sig}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: MONO, fontSize: 15, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 16px" }}
              >
                <span style={{ color: DIM, width: 90 }}>{ago(burn.at)}</span>
                <span style={{ color: MUTED, flex: 1 }}>{buy?.sol != null ? `${buy.sol.toFixed(3)} SOL → $PQC` : "buy → $PQC"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: GREEN }}>
                  <Mark size={14} />
                  {Math.round(burn.pqc).toLocaleString("en-US")} burned
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

export const BurnScene = () => <Burn scene />;
export const BurnTweet = () => <Burn />;
