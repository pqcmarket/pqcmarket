"use client";

import { useEffect, useState } from "react";
import { AMBER, DIM, FG, Frame, GREEN, MUTED, RED, SURFACE, TopBar } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Daily recap v2: live figures from /api/stats. Three headline cards, launches
 * per hour across the day, the top coins by market cap with their logos, and a
 * quiet strip of post-quantum totals. Cards only, no rules.
 */

type Top = { mint: string; symbol: string; marketCap: number; change24h: number | null; image: string | null };
type Stats = {
  launches: number;
  launches24h: number;
  quantum: number;
  paired: number;
  graduated: number;
  identities: number;
  signatures: number;
  marketCap: number;
  volume24h: number;
  hourly?: number[];
  top?: Top[];
};

const POOL = "#c9a8ff";
const CARD = "rgba(255,255,255,0.035)";
const CARD_SCENE = "rgba(20,19,18,0.82)";

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;
const int = (n: number) => n.toLocaleString("en-US");

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((j) => !cancelled && !j.error && setStats(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

/** The image as a data URL (null until loaded), so the PNG export has nothing to fetch. */
function useDataUrl(src: string | null) {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .then((url) => !cancelled && setData(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  return data;
}

function CoinLogo({ src }: { src: string | null }) {
  const data = useDataUrl(src);
  const style = { width: 42, height: 42, borderRadius: "50%", background: SURFACE, flexShrink: 0 } as const;
  return data ? <img src={data} alt="" style={{ ...style, objectFit: "cover" }} /> : <div style={style} />;
}

function Label({ color, children }: { color?: string; children: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 15, letterSpacing: 0.5, color: MUTED }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />}
      {children}
    </div>
  );
}

function Headline({ label, value, sub, color, bg }: { label: string; value: string; sub: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 20, padding: "28px 32px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 28, bottom: 28, width: 3, borderRadius: 3, background: color }} />
      <Label>{label}</Label>
      <div style={{ marginTop: 18, fontFamily: SANS, fontWeight: 700, fontSize: 60, lineHeight: 1, letterSpacing: -1.5, color: FG }}>{value}</div>
      <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 15, color: DIM }}>{sub}</div>
    </div>
  );
}

function HourlyChart({ hourly, bg }: { hourly: number[]; bg: string }) {
  const W = 788;
  const H = 214;
  const gap = 8;
  const bw = (W - gap * 23) / 24;
  const max = Math.max(1, ...hourly);
  const peak = hourly.indexOf(max);
  const ticks = ["24h ago", "18h", "12h", "6h", "now"];

  return (
    <div style={{ background: bg, borderRadius: 20, padding: "28px 32px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Label color={POOL}>launches per hour</Label>
        <span style={{ fontFamily: MONO, fontSize: 14, color: DIM }}>peak {max} in one hour</span>
      </div>
      <svg width={W} height={H + 34} style={{ display: "block", marginTop: 34, overflow: "visible" }}>
        <defs>
          <linearGradient id="recap-bar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={POOL} stopOpacity="0.95" />
            <stop offset="100%" stopColor={POOL} stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="recap-bar-dim" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={POOL} stopOpacity="0.5" />
            <stop offset="100%" stopColor={POOL} stopOpacity="0.12" />
          </linearGradient>
        </defs>
        {hourly.map((v, i) => {
          const h = Math.max(4, (v / max) * H);
          const x = i * (bw + gap);
          return (
            <g key={i}>
              <rect x={x} y={H - h} width={bw} height={h} rx={5} fill={i === peak ? "url(#recap-bar)" : "url(#recap-bar-dim)"} />
              {i === peak && (
                <text x={x + bw / 2} y={H - h - 10} textAnchor="middle" fill={FG} style={{ fontFamily: MONO, fontSize: 14 }}>
                  {v}
                </text>
              )}
            </g>
          );
        })}
        {ticks.map((t, i) => (
          <text
            key={t}
            x={i === 0 ? 0 : i === ticks.length - 1 ? W : (W * i) / (ticks.length - 1)}
            y={H + 28}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            fill={DIM}
            style={{ fontFamily: MONO, fontSize: 13 }}
          >
            {t}
          </text>
        ))}
      </svg>
    </div>
  );
}

function TopCoins({ top, bg }: { top: Top[]; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 20, padding: "28px 30px", height: "100%", boxSizing: "border-box" }}>
      <Label color={AMBER}>top performing tokens</Label>
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        {top.map((t, i) => {
          const up = (t.change24h ?? 0) >= 0;
          return (
            <div key={t.mint} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 16, fontFamily: MONO, fontSize: 14, color: DIM }}>{i + 1}</span>
              <CoinLogo src={t.image} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 20, color: FG, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>${t.symbol}</div>
                <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 14, color: MUTED }}>{usd(t.marketCap)} mcap</div>
              </div>
              {t.change24h !== null && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 14,
                    color: up ? GREEN : RED,
                    background: up ? "rgba(63,185,80,0.12)" : "rgba(242,85,90,0.12)",
                    borderRadius: 999,
                    padding: "5px 11px",
                  }}
                >
                  {up ? "+" : ""}
                  {Math.round(t.change24h)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Recap({ scene }: { scene?: boolean }) {
  const s = useStats();
  const bg = scene ? CARD_SCENE : CARD;
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const v = (f: (x: Stats) => string) => (s ? f(s) : "…");
  const pad = 88;

  return (
    <Frame w={1600} h={900} plain>
      {scene ? (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.6} y={0.3} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.72) 0%, rgba(18,17,16,0.9) 32%, rgba(18,17,16,0.95) 100%)" }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(1100px 520px at 78% -10%, rgba(201,168,255,0.07), transparent 70%)" }} />
      )}
      <TopBar pad={pad} right={`${date} · last 24 hours`} />

      <div style={{ position: "absolute", left: pad, right: pad, top: 150, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <Headline label="24h volume" value={v((x) => usd(x.volume24h))} sub="traded across every coin" color={GREEN} bg={bg} />
        <Headline label="coins launched" value={v((x) => int(x.launches24h))} sub={v((x) => `${int(x.launches)} all-time`)} color={POOL} bg={bg} />
        <Headline label="combined market cap" value={v((x) => usd(x.marketCap))} sub={v((x) => `${int(x.graduated)} graduated`)} color={AMBER} bg={bg} />
      </div>

      <div style={{ position: "absolute", left: pad, right: pad, top: 368, height: 352, display: "grid", gridTemplateColumns: "852px 1fr", gap: 20 }}>
        <HourlyChart hourly={s?.hourly ?? Array.from({ length: 24 }, () => 0)} bg={bg} />
        <TopCoins top={(s?.top ?? []).slice(0, 4)} bg={bg} />
      </div>

      <div style={{ position: "absolute", left: pad, right: pad, top: 758, display: "flex", gap: 48, fontFamily: MONO, fontSize: 16, color: MUTED }}>
        {[
          [v((x) => int(x.quantum)), "quantum launches"],
          [v((x) => int(x.identities)), "post-quantum identities"],
          [v((x) => int(x.signatures)), "hash-based signatures"],
          [v((x) => int(x.paired)), "custom-pair coins"],
        ].map(([n, label]) => (
          <span key={label}>
            <span style={{ color: FG, fontFamily: SANS, fontWeight: 600, fontSize: 20, marginRight: 8 }}>{n}</span>
            {label}
          </span>
        ))}
      </div>
    </Frame>
  );
}

export const RecapScene = () => <Recap scene />;
export const RecapTweet = () => <Recap />;
