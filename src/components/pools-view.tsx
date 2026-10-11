"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { ago, cn, short } from "@/lib/format";
import { VaultKey } from "@/lib/vault";
import { poolIdentity } from "@/lib/vault/pool";
import { useIdentity } from "./identity";
import { ButtonLink, CopyText, Panel, Pill, Skeleton } from "./ui";
import { PoolFlow, SplIcon } from "./pool-flow";
import { PoolBody } from "./vault-view";

type Position = { root: string; vault: string; balances: Record<string, number>; usd: number; yieldSol: number };
type Summary = {
  live: boolean;
  rewardsWallet: string | null;
  epochHours: number;
  tvlUsd: number;
  tokens: { symbol: string; amount: number; usd: number }[];
  depositors: number;
  yieldSol: number;
  yield7dSol: number;
  aprPct: number | null;
  lastYieldAt: number | null;
  solPrice: number | null;
  position?: Position | null;
};

const dollars = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);
const amount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 4 });

export function PoolsView() {
  const { unlocked, connected, remote } = useIdentity();
  // The position's first vault: derived locally, used only to look up its stats.
  const root = useMemo(
    () => (unlocked ? VaultKey.fromIdentity(poolIdentity({ skSeed: unlocked.skSeed, pubSeed: unlocked.pubSeed }), 0).address.toBase58() : null),
    [unlocked],
  );
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/pools${root ? `?root=${root}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && !j.error && setData(j))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [root]);

  const mine = data?.position ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-[28px] font-bold tracking-tight">Post-quantum pools</h1>
            {data && (data.live ? <Pill tone="up">live</Pill> : <Pill tone="warn">testing</Pill>)}
          </div>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Deposit SOL, USDC or $PQC and earn the pools&apos; share of platform revenue. Withdrawals need a Winternitz one-time signature
            that the vault program verifies on Solana with SHA-256, so an ed25519 wallet signature alone, even a forged one, can&apos;t move
            your funds.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total deposited" value={data ? dollars(data.tvlUsd) : null} />
        <Stat label="Yield APR" value={data ? (data.aprPct !== null ? `${data.aprPct.toFixed(1)}%` : "—") : null} sub={data && data.aprPct === null ? "after the first payout" : "last 7 days, annualized"} />
        <Stat label="Yield paid" value={data ? `${data.yieldSol.toFixed(3)} SOL` : null} sub={data?.lastYieldAt ? `last ${ago(new Date(data.lastYieldAt * 1000).toISOString())}` : `every ${data?.epochHours ?? 24}h`} />
        <Stat label="Depositors" value={data ? data.depositors.toLocaleString("en-US") : null} />
      </div>

      <div className="mt-3">
        <PoolFlow />
      </div>

      <InThePools data={data} />

      <div className="mt-8">
        {!unlocked ? (
          <Panel className="flex flex-col items-center px-6 py-14 text-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-dim">{connected && remote ? "keys locked" : "identity required"}</div>
            <h2 className="mt-3 font-serif text-[22px] font-bold">Your pool position opens with your post-quantum identity</h2>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
              Pool keys are derived from your identity in this tab and never stored. Unlock on the Identity page and you&apos;ll come
              straight back here.
            </p>
            <ButtonLink href="/identity?next=/pools" variant="primary" className="mt-6">
              {connected && remote ? "Unlock on Identity" : "Go to Identity"}
            </ButtonLink>
          </Panel>
        ) : (
          <>
            <Panel className="mb-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-dim">Your position</div>
                  <div className="mt-1 font-mono text-[22px]">{mine ? dollars(mine.usd) : "$0.00"}</div>
                </div>
                <div className="flex flex-wrap gap-6 font-mono text-[12.5px]">
                  <KV k="yield earned" v={`${(mine?.yieldSol ?? 0).toFixed(4)} SOL`} tone="up" />
                  {(data?.tokens ?? []).map((t) => (
                    <KV key={t.symbol} k={t.symbol} v={amount(mine?.balances[t.symbol] ?? 0)} />
                  ))}
                </div>
              </div>
              {!mine && <p className="mt-3 text-[12px] text-dim">Deposit below to open your position. It&apos;s registered for payouts automatically.</p>}
            </Panel>
            <PoolBody />
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11.5px] text-dim">
        <span className="flex items-center gap-1.5">
          <Check size={11} className="text-up" /> withdrawals verified on-chain
        </span>
        {data?.rewardsWallet && (
          <span className="flex items-center gap-2">
            rewards wallet <CopyText value={data.rewardsWallet} display={short(data.rewardsWallet, 6, 6)} />
            <a href={`https://solscan.io/account/${data.rewardsWallet}`} target="_blank" rel="noreferrer" className="cursor-pointer text-muted hover:text-fg">
              <ArrowUpRight size={11} />
            </a>
          </span>
        )}
        <Link href="/docs#pools" className="cursor-pointer text-muted underline-offset-2 hover:text-fg hover:underline">
          How pools work →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <Panel className="p-4">
      <div className="text-[11.5px] text-dim">{label}</div>
      {value === null ? <Skeleton className="mt-2 h-7 w-24" /> : <div className="mt-1.5 font-mono text-[22px] tracking-tight">{value}</div>}
      <div className="mt-1 h-4 truncate font-mono text-[11px] text-muted">{sub}</div>
    </Panel>
  );
}

const TOKEN_STYLE: Record<string, { name: string; color: string; logo?: string }> = {
  SOL: { name: "Solana", color: "#c9a8ff" },
  USDC: { name: "USD Coin", color: "#7fb2ff" },
  // The SPL slot: $PQC is the supported SPL token besides USDC today.
  PQC: { name: "supported SPL", color: "#e3b341" },
};

/** Share-of-TVL donut: one arc per token, a dashed ring while empty. */
function Donut({ tokens, tvl }: { tokens: { symbol: string; usd: number }[]; tvl: number }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg viewBox="0 0 168 168" className="h-full w-full -rotate-90">
        <circle cx={84} cy={84} r={R} fill="none" stroke="currentColor" strokeWidth={14} className="text-surface-2" />
        {tvl > 0 ? (
          tokens.map((t) => {
            const len = (t.usd / tvl) * C;
            const seg = (
              <circle
                key={t.symbol}
                cx={84}
                cy={84}
                r={R}
                fill="none"
                stroke={TOKEN_STYLE[t.symbol]?.color ?? "#a8a19a"}
                strokeWidth={14}
                strokeDasharray={`${Math.max(0, len - 2)} ${C}`}
                strokeDashoffset={-offset}
                className="transition-all duration-700"
              />
            );
            offset += len;
            return seg;
          })
        ) : (
          <circle cx={84} cy={84} r={R} fill="none" stroke="#3a3633" strokeWidth={1.5} strokeDasharray="2 6" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10.5px] uppercase tracking-wider text-dim">deposited</div>
        <div className="mt-0.5 font-mono text-[19px]">{dollars(tvl)}</div>
      </div>
    </div>
  );
}

/** What's deposited: a donut of each token's share, and a row per token. */
function InThePools({ data }: { data: Summary | null }) {
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/quotes?proxy=1")
      .then((r) => r.json())
      .then((j) => {
        const out: Record<string, string> = {};
        for (const q of (j.quotes ?? []) as { symbol: string; image: string | null }[]) if (q.image) out[q.symbol.trim()] = q.image;
        setLogos(out);
      })
      .catch(() => {});
  }, []);

  const tokens = data?.tokens ?? ["SOL", "USDC", "PQC"].map((symbol) => ({ symbol, amount: 0, usd: 0 }));
  const tvl = data?.tvlUsd ?? 0;

  return (
    <Panel className="mt-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="text-[13px] font-medium">In the pools</div>
        <div className="font-mono text-[11px] text-dim">{data ? `${data.depositors} depositor${data.depositors === 1 ? "" : "s"}` : "…"}</div>
      </div>
      <div className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-center sm:gap-8">
        <Donut tokens={tokens} tvl={tvl} />
        <div className="w-full min-w-0 flex-1 space-y-2.5">
          {tokens.map((t) => {
            const style = TOKEN_STYLE[t.symbol] ?? { name: t.symbol, color: "#a8a19a" };
            const logo = style.logo ?? logos[t.symbol];
            const share = tvl > 0 ? (t.usd / tvl) * 100 : 0;
            return (
              <div key={t.symbol} className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3 transition-colors hover:border-line-strong">
                <div className="flex w-[150px] shrink-0 items-center gap-3">
                  {t.symbol === "PQC" ? (
                    <SplIcon className="h-8 w-8 shrink-0" />
                  ) : logo ? (
                    <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-full bg-surface-2 object-cover" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-tight">{t.symbol === "PQC" ? "SPL tokens" : t.symbol}</div>
                    <div className="truncate text-[11px] text-dim">{style.name}</div>
                  </div>
                </div>
                <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 sm:block">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${share}%`, background: style.color }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11.5px]" style={{ color: share > 0 ? style.color : undefined }}>
                  {share.toFixed(0)}%
                </span>
                <div className="ml-auto w-[96px] shrink-0 text-right font-mono sm:ml-0">
                  {data ? (
                    <div className="text-[14px] leading-tight">{t.symbol === "PQC" ? dollars(t.usd) : amount(t.amount)}</div>
                  ) : (
                    <Skeleton className="ml-auto h-4 w-14" />
                  )}
                  <div className="text-[11px] text-muted">{data ? (t.symbol === "PQC" ? `${amount(t.amount)} $PQC` : dollars(t.usd)) : ""}</div>
                </div>
              </div>
            );
          })}
          {data && tvl === 0 && <div className="pt-1 text-[11.5px] text-dim">Nothing deposited yet. The first deposit opens the pools.</div>}
        </div>
      </div>
    </Panel>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "up" }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-dim">{k}</div>
      <div className={cn("mt-0.5", tone === "up" ? "text-up" : "text-fg")}>{v}</div>
    </div>
  );
}
