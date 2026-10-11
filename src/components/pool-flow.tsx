"use client";

import { useEffect, useState } from "react";

/**
 * How a pool works, animated (SVG + SMIL, loops forever): tokens stream into a
 * WOTS vault ringed by its 67 hash chains, revenue drips in as yield, and a
 * withdrawal only leaves once the one-time signature is verified on-chain.
 * Static when the viewer prefers reduced motion.
 */

const POOL = "#c9a8ff";
const GREEN = "#3fb950";
const AMBER = "#e3b341";
const FG = "#f2eee9";
const MUTED = "#a8a19a";
const DIM = "#77706a";
const LINE = "#2a2725";
const MONO = "var(--font-geist-mono), monospace";
const SANS = "var(--font-geist-sans), sans-serif";

const VX = 450; // vault center
const VY = 206;
const LOOP = 6; // seconds, the withdraw sequence
const CARD = { x: 650, y: 106, w: 204, h: 200 };
const WALLET = { cx: 936, cy: VY };

type Source = { key: string; label: string; y: number; color: string };
const SOURCES: Source[] = [
  { key: "SOL", label: "SOL", y: 116, color: POOL },
  { key: "USDC", label: "USDC", y: 206, color: "#7fb2ff" },
  { key: "SPL", label: "any SPL", y: 296, color: AMBER },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

function useLogos() {
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes?proxy=1")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const out: Record<string, string> = {};
        for (const q of (j.quotes ?? []) as { symbol: string; image: string | null }[]) {
          const s = q.symbol.trim();
          if ((s === "SOL" || s === "USDC") && q.image) out[s] = q.image;
        }
        setLogos(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return logos;
}

/** Deterministic "digest" cells for the signature card. */
const COLS = 10;
const ROWS = 5;
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => {
  const h = (i * 2654435761) >>> 0;
  return { color: h % 5 === 0 ? GREEN : h % 3 === 0 ? FG : POOL, o: 0.35 + ((h >> 8) % 60) / 100 };
});

/** A stack of coins: the generic "any SPL token" mark. */
function CoinStack({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} fill="#1a1918" stroke={AMBER} strokeWidth={1.8}>
      <ellipse cx={0} cy={8} rx={13} ry={4.5} />
      <path d="M-13,8 v-6 a13,4.5 0 0 0 26,0 v6" fill="#1a1918" />
      <ellipse cx={0} cy={2} rx={13} ry={4.5} />
      <path d="M-13,2 v-6 a13,4.5 0 0 0 26,0 v6" fill="#1a1918" />
      <ellipse cx={0} cy={-4} rx={13} ry={4.5} />
      <path d="M-13,-4 v-6 a13,4.5 0 0 0 26,0 v6" fill="#1a1918" />
      <ellipse cx={0} cy={-10} rx={13} ry={4.5} fill={AMBER} fillOpacity={0.25} />
    </g>
  );
}

/** The "any SPL token" coin stack as a standalone round icon (matches the graphic). */
export function SplIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-29 -29 58 58" className={className} aria-hidden>
      <circle r={28} fill="#121110" stroke={AMBER} strokeOpacity={0.65} strokeWidth={1.5} />
      <CoinStack cx={0} cy={2} />
    </svg>
  );
}

export function PoolFlow() {
  const reduced = useReducedMotion();
  const logos = useLogos();
  const anim = !reduced;
  const exitEnd = WALLET.cx - 33;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_300px_at_45%_50%,rgba(201,168,255,0.10),transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      <svg viewBox="0 0 1000 410" className="relative block h-auto w-full" role="img" aria-label="How a post-quantum pool works: deposit, earn, withdraw with a verified WOTS signature">
        <defs>
          <radialGradient id="pf-core" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#2c2340" />
            <stop offset="100%" stopColor="#100f0e" />
          </radialGradient>
          <radialGradient id="pf-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={POOL} stopOpacity="0.28" />
            <stop offset="100%" stopColor={POOL} stopOpacity="0" />
          </radialGradient>
          <filter id="pf-soft" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {SOURCES.map((t) => (
            <clipPath key={t.key} id={`pf-clip-${t.key}`}>
              <circle cx={90} cy={t.y} r={25} />
            </clipPath>
          ))}
          {SOURCES.map((t) => (
            <path key={t.key} id={`pf-in-${t.key}`} d={`M122,${t.y} C250,${t.y} 290,${VY} ${VX - 124},${VY}`} />
          ))}
          <path id="pf-drop" d={`M${VX},70 L${VX},${VY - 102}`} />
          <path id="pf-exit" d={`M${VX + 124},${VY} L${exitEnd},${VY}`} />
        </defs>

        {/* ---------- 01 deposit ---------- */}
        {SOURCES.map((t, ti) => (
          <g key={t.key}>
            <use href={`#pf-in-${t.key}`} fill="none" stroke={LINE} strokeWidth={2} />
            <use href={`#pf-in-${t.key}`} fill="none" stroke={t.color} strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="2 7" />
            {anim &&
              [0, 1, 2].map((k) => (
                <circle key={k} r={3.8} fill={t.color} opacity={0} filter="url(#pf-soft)">
                  <animateMotion dur="2.6s" begin={`${ti * 0.45 + k * 0.87}s`} repeatCount="indefinite">
                    <mpath href={`#pf-in-${t.key}`} />
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="2.6s" begin={`${ti * 0.45 + k * 0.87}s`} repeatCount="indefinite" />
                </circle>
              ))}
            <circle cx={90} cy={t.y} r={32} fill="none" stroke={t.color} strokeOpacity={0.12} strokeWidth={6} />
            <circle cx={90} cy={t.y} r={29} fill="#121110" stroke={t.color} strokeOpacity={0.65} strokeWidth={1.5} />
            {t.key === "SPL" ? (
              <CoinStack cx={90} cy={t.y + 2} />
            ) : logos[t.key] ? (
              <image href={logos[t.key]} x={65} y={t.y - 25} width={50} height={50} clipPath={`url(#pf-clip-${t.key})`} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text x={90} y={t.y + 5} textAnchor="middle" fill={MUTED} style={{ font: `600 13px ${MONO}` }}>
                {t.label}
              </text>
            )}
          </g>
        ))}

        {/* ---------- 02 earn: revenue drips in ---------- */}
        <g>
          <rect x={VX - 92} y={30} width={184} height={36} rx={18} fill="#121110" stroke={GREEN} strokeOpacity={0.45} />
          <circle cx={VX - 70} cy={48} r={5} fill={GREEN}>
            {anim && <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />}
          </circle>
          <text x={VX + 10} y={53} textAnchor="middle" fill={FG} style={{ font: `500 14px ${MONO}` }}>
            20% of revenue
          </text>
          <use href="#pf-drop" stroke={GREEN} strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="2 6" />
          {anim &&
            [0, 1].map((k) => (
              <circle key={k} r={4.5} fill={GREEN} opacity={0} filter="url(#pf-soft)">
                <animateMotion dur="1.5s" begin={`${k * 1.5}s`} repeatCount="indefinite">
                  <mpath href="#pf-drop" />
                </animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.2;0.75;1" dur="1.5s" begin={`${k * 1.5}s`} repeatCount="indefinite" />
              </circle>
            ))}
        </g>

        {/* ---------- the vault ---------- */}
        <circle cx={VX} cy={VY} r={170} fill="url(#pf-glow)" />
        <g transform={`translate(${VX} ${VY})`}>
          <circle r={122} fill="none" stroke={POOL} strokeOpacity={0.22} strokeDasharray="1 9" strokeWidth={2}>
            {anim && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="40s" repeatCount="indefinite" />}
          </circle>
          {/* 67 hash chains, swept in a wave */}
          {Array.from({ length: 67 }, (_, i) => (
            <rect key={i} x={-1.6} y={-106} width={3.2} height={13} rx={1.6} fill={POOL} opacity={0.18} transform={`rotate(${(i * 360) / 67})`}>
              {anim && <animate attributeName="opacity" values="0.15;1;0.15" dur="3.2s" begin={`${(i * 1.6) / 67}s`} repeatCount="indefinite" />}
            </rect>
          ))}
          {/* a ripple each time yield lands */}
          {anim && (
            <circle r={84} fill="none" stroke={GREEN} strokeWidth={2} opacity={0}>
              <animate attributeName="r" values="84;128" dur="1.5s" begin="1.1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.55;0" dur="1.5s" begin="1.1s" repeatCount="indefinite" />
            </circle>
          )}
          <circle r={84} fill="url(#pf-core)" stroke={POOL} strokeWidth={2} />
          <circle r={70} fill="none" stroke={POOL} strokeOpacity={0.16} />
          <g transform="translate(0 -14)">
            <rect x={-19} y={-6} width={38} height={30} rx={6} fill={POOL} fillOpacity={0.14} stroke={POOL} strokeWidth={2.5} />
            <path d="M-11,-6 v-9 a11,11 0 0 1 22,0 v9" fill="none" stroke={POOL} strokeWidth={2.5} />
            <circle cx={0} cy={8} r={3.5} fill={POOL} />
          </g>
          <text y={42} textAnchor="middle" fill={FG} style={{ font: `600 15px ${SANS}` }}>
            WOTS vault
          </text>
          <text y={60} textAnchor="middle" fill={MUTED} style={{ font: `11.5px ${MONO}` }}>
            67 hash chains
          </text>
        </g>

        {/* ---------- 03 withdraw ---------- */}
        <use href="#pf-exit" fill="none" stroke={LINE} strokeWidth={2} />
        <use href="#pf-exit" fill="none" stroke={GREEN} strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray="2 7" />
        {anim &&
          [0, 1, 2].map((k) => (
            <circle key={k} r={4.2} fill={GREEN} opacity={0} filter="url(#pf-soft)">
              <animateMotion dur="2.4s" begin={`${k * 0.8}s`} repeatCount="indefinite">
                <mpath href="#pf-exit" />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="2.4s" begin={`${k * 0.8}s`} repeatCount="indefinite" />
            </circle>
          ))}

        {/* signature card: cells fill, then the check lands */}
        <g transform={`translate(${CARD.x} ${CARD.y})`}>
          <rect width={CARD.w} height={CARD.h} rx={14} fill="#121110" stroke={LINE} strokeWidth={1.5} />
          <text x={18} y={28} fill={DIM} style={{ font: `10.5px ${MONO}`, letterSpacing: 1.6 }}>
            ONE-TIME SIGNATURE
          </text>
          {CELLS.map((c, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const t = 0.04 + (i / CELLS.length) * 0.4;
            return (
              <rect key={i} x={18 + col * 17} y={42 + row * 17} width={13} height={13} rx={2.5} fill={c.color} opacity={anim ? 0.08 : c.o}>
                {anim && (
                  <animate attributeName="opacity" values={`0.08;0.08;${c.o};${c.o};0.08`} keyTimes={`0;${t.toFixed(3)};${(t + 0.03).toFixed(3)};0.94;1`} dur={`${LOOP}s`} repeatCount="indefinite" />
                )}
              </rect>
            );
          })}
          {/* footer: divider, check, two short lines; all inside the card */}
          <line x1={18} x2={CARD.w - 18} y1={140} y2={140} stroke={LINE} />
          <g transform="translate(18 152)">
            <circle cx={14} cy={17} r={14} fill={GREEN} fillOpacity={0.14} stroke={GREEN} strokeOpacity={0.4} />
            <path d="M8,17 l4,4 l8,-8" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <text x={38} y={14} fill={FG} style={{ font: `600 12.5px ${SANS}` }}>
              verified on-chain
            </text>
            <text x={38} y={30} fill={MUTED} style={{ font: `10.5px ${MONO}` }}>
              SHA-256 · no ed25519
            </text>
          </g>
        </g>

        {/* wallet */}
        <g>
          <circle cx={WALLET.cx} cy={WALLET.cy} r={32} fill="none" stroke={GREEN} strokeOpacity={0.12} strokeWidth={6} />
          <circle cx={WALLET.cx} cy={WALLET.cy} r={29} fill="#121110" stroke={GREEN} strokeOpacity={0.65} strokeWidth={1.5} />
          <g transform={`translate(${WALLET.cx - 14.4} ${WALLET.cy - 14.4}) scale(1.2)`} fill="none" stroke={GREEN} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </g>
          <text x={WALLET.cx} y={WALLET.cy + 52} textAnchor="middle" fill={MUTED} style={{ font: `11px ${MONO}` }}>
            your wallet
          </text>
        </g>

        {/* ---------- captions ---------- */}
        {[
          { x: 90, n: "01", t: "Deposit", s: "SOL · USDC · any SPL" },
          { x: VX, n: "02", t: "Earn", s: "revenue, paid pro-rata" },
          { x: CARD.x + CARD.w / 2 + 60, n: "03", t: "Withdraw", s: "only with a WOTS signature" },
        ].map((c) => (
          <g key={c.n}>
            <text x={c.x} y={372} textAnchor="middle" fill={FG} style={{ font: `600 15px ${SANS}` }}>
              <tspan fill={DIM} style={{ font: `12px ${MONO}` }}>
                {c.n}{" "}
              </tspan>
              {c.t}
            </text>
            <text x={c.x} y={393} textAnchor="middle" fill={MUTED} style={{ font: `12px ${MONO}` }}>
              {c.s}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
