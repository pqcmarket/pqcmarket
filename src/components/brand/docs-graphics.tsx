"use client";

import { DIM, FG, Frame, GREEN, MUTED, TERM, Wordmark } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * "Documentation, updated": a 2:1 card (1500x750, shown uncropped in the X
 * feed). Left: the announcement; right: an excerpt of the real docs page, open
 * on the Quantum vault section, fading out at the bottom.
 */

const POOL = "#c9a8ff";
const W = 1500;
const H = 750;

const NAV: { label: string; sub?: boolean; isNew?: boolean; active?: boolean }[] = [
  { label: "Overview" },
  { label: "Threat model" },
  { label: "Primitives" },
  { label: "WOTS signatures" },
  { label: "Merkle identities" },
  { label: "Key derivation" },
  { label: "Launch attestation" },
  { label: "Creator fees", sub: true },
  { label: "Signature schemes" },
  { label: "Proof of possession" },
  { label: "Wallets", isNew: true },
  { label: "Quantum vault", isNew: true, active: true },
  { label: "Security analysis" },
  { label: "Parameters" },
  { label: "Verify it yourself" },
];

function NewTag() {
  return <span style={{ fontFamily: MONO, fontSize: 11, color: POOL, background: "rgba(201,168,255,0.12)", borderRadius: 999, padding: "2px 8px" }}>new</span>;
}

function DocsWindow({ scene }: { scene?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 640,
        top: 74,
        width: W - 640 - 72,
        height: H - 74,
        borderRadius: "20px 20px 0 0",
        background: scene ? "rgba(22,21,20,0.92)" : "#181716",
        boxShadow: "0 40px 80px -30px rgba(0,0,0,0.8)",
        overflow: "hidden",
      }}
    >
      {/* address bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 24px", background: "rgba(255,255,255,0.025)" }}>
        <div style={{ display: "flex", gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#34312e", display: "inline-block" }} />
          ))}
        </div>
        <div style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 14, color: DIM }}>
          pqc.market/docs<span style={{ color: MUTED }}>#vault</span>
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ display: "flex", height: "100%" }}>
        {/* sidebar */}
        <div style={{ width: 232, padding: "26px 0 0 24px", flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: DIM, marginBottom: 14 }}>CONTENTS</div>
          {NAV.map((n) => (
            <div
              key={n.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 31,
                paddingLeft: n.sub ? 26 : 12,
                marginRight: 16,
                borderRadius: 8,
                background: n.active ? "rgba(201,168,255,0.1)" : "transparent",
                fontFamily: SANS,
                fontSize: 15,
                color: n.active ? FG : n.sub ? DIM : MUTED,
                fontWeight: n.active ? 600 : 400,
              }}
            >
              {n.label}
              {n.isNew && <NewTag />}
            </div>
          ))}
        </div>

        {/* content */}
        <div style={{ flex: 1, padding: "34px 40px 0 28px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 15, color: DIM }}>§ 15</span>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: FG, letterSpacing: -0.5 }}>Quantum vault</span>
          </div>
          <p style={{ margin: "18px 0 0", fontFamily: SANS, fontSize: 16, lineHeight: 1.65, color: MUTED }}>
            The vault is a Solana program that holds SOL, SPL and Token-2022 balances at a PDA which only a{" "}
            <span style={{ color: FG, fontWeight: 600 }}>WOTS signature verified on-chain</span> can spend. There is no ed25519 path.
          </p>
          <div style={{ marginTop: 20, background: TERM, borderRadius: 12, padding: "18px 20px", fontFamily: MONO, fontSize: 14, lineHeight: 1.75, color: FG }}>
            <div>
              vault = PDA(<span style={{ color: GREEN }}>&quot;vault&quot;</span>, 0x01, SHA-256(pubSeed ‖ pk))
            </div>
            <div>
              d = SHA-256(vault ‖ recipient ‖ mint ‖ amount ‖ …)
            </div>
          </div>
          <p style={{ margin: "20px 0 0", fontFamily: SANS, fontSize: 16, lineHeight: 1.65, color: MUTED }}>
            The withdraw instruction walks the 67 hash chains, checks the result derives the vault&apos;s address, pays the recipient and rolls
            everything else into the next vault.
          </p>
          <p style={{ margin: "16px 0 0", fontFamily: SANS, fontSize: 16, lineHeight: 1.65, color: MUTED }}>
            <span style={{ color: FG, fontWeight: 600 }}>One key, one message.</span> Before anything is broadcast, the browser records the
            spend, so every retry replays the identical signature.
          </p>
        </div>
      </div>

      {/* fade into the frame */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 170, background: `linear-gradient(180deg, rgba(18,17,16,0) 0%, rgba(18,17,16,0.96) 100%)` }} />
    </div>
  );
}

function Docs({ scene }: { scene?: boolean }) {
  return (
    <Frame w={W} h={H} plain>
      {scene ? (
        <>
          <Scene w={W} h={H} scale={1.2} x={0.2} y={0.35} />
          <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.72) 0%, rgba(18,17,16,0.86) 34%, rgba(18,17,16,0.94) 50%, rgba(18,17,16,0.96) 100%)" }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 500px at 82% 0%, rgba(201,168,255,0.08), transparent 70%)" }} />
      )}

      <div style={{ position: "absolute", left: 72, top: 64 }}>
        <Wordmark size={28} />
      </div>

      <div style={{ position: "absolute", left: 72, top: 236, width: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: POOL }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: POOL, display: "inline-block" }} />
          DOCS
        </div>
        <div style={{ marginTop: 16, fontFamily: SANS, fontWeight: 700, fontSize: 56, lineHeight: 1.05, letterSpacing: -1.5, color: FG }}>
          Documentation,
          <br />
          updated
        </div>
        <div style={{ marginTop: 22, fontFamily: SANS, fontSize: 20, lineHeight: 1.5, color: MUTED }}>
          The full spec, from WOTS and Merkle identities to wallets and the quantum vault.
        </div>
        <div
          style={{
            marginTop: 30,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontFamily: MONO,
            fontSize: 17,
            color: FG,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 999,
            padding: "11px 20px",
          }}
        >
          pqc.market/docs <span style={{ color: POOL }}>→</span>
        </div>
      </div>

      <DocsWindow scene={scene} />
    </Frame>
  );
}

export const DocsScene = () => <Docs scene />;
export const DocsTweet = () => <Docs />;
