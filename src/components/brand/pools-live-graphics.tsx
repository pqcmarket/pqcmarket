"use client";

import { FG, Frame, GREEN, MUTED, TopBar } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";
import { PoolFlow } from "../pool-flow";

/**
 * "Post-quantum pools are live": the announcement over a still frame of the
 * pools page diagram (deposit → WOTS vault → verified withdrawal).
 */

function PoolsLive({ scene }: { scene?: boolean }) {
  const pad = 88;
  return (
    <Frame w={1600} h={900} plain>
      {scene ? (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.5} y={0.25} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.62) 0%, rgba(18,17,16,0.88) 26%, rgba(18,17,16,0.95) 40%, rgba(18,17,16,0.96) 100%)" }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 520px at 50% 72%, rgba(201,168,255,0.08), transparent 70%)" }} />
      )}
      <TopBar pad={pad} right="pqc.market/pools" />

      <div style={{ position: "absolute", left: pad, right: pad, top: 146, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: GREEN }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: GREEN, display: "inline-block", boxShadow: "0 0 0 5px rgba(63,185,80,0.15)" }} />
            LIVE NOW
          </div>
          <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 700, fontSize: 60, lineHeight: 1.02, letterSpacing: -1.6, color: FG }}>
            Post-quantum pools are live
          </div>
        </div>
        <div style={{ maxWidth: 440, paddingBottom: 6, fontFamily: SANS, fontSize: 19, lineHeight: 1.5, color: MUTED, textAlign: "right" }}>
          Deposit, earn 20% of platform revenue, and withdraw only with a hash-based signature verified on Solana.
        </div>
      </div>

      <div style={{ position: "absolute", left: 160, right: 160, top: 306 }}>
        <PoolFlow still />
      </div>
    </Frame>
  );
}

export const PoolsLiveScene = () => <PoolsLive scene />;
export const PoolsLiveTweet = () => <PoolsLive />;
