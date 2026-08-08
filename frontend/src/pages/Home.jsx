import React from "react";
import { Link } from "react-router-dom";
import { SealMark } from "../components/Navbar.jsx";

export default function Home() {
  return (
    <main>
      <section className="page" style={{ paddingTop: 72, paddingBottom: 56 }}>
        <div style={{ display: "flex", gap: 56, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 480px" }}>
            <div className="eyebrow">Certificate NFT · Provenance · Royalties</div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 52,
                lineHeight: 1.08,
                margin: "16px 0 20px",
              }}
            >
              A permanent digital passport for physical art.
            </h1>
            <p style={{ fontSize: 17, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 480 }}>
              ArtProof mints an on-chain certificate for a physical artwork, logs every transfer as public
              provenance, and splits resale royalties to the artist automatically — enforced by code, not by
              hoping a marketplace honors it.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              <Link to="/register" className="btn btn-primary">
                Register an artwork
              </Link>
              <Link to="/verify" className="btn btn-secondary">
                Verify a certificate
              </Link>
            </div>
          </div>

          <div style={{ flex: "0 0 260px", display: "flex", justifyContent: "center" }}>
            <div
              className="card"
              style={{
                width: 220,
                textAlign: "center",
                background: "var(--parchment)",
                color: "var(--ink-950)",
                border: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <SealMark size={56} />
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Certificate</div>
              <div className="mono" style={{ color: "var(--ink-700)", fontSize: 11, marginTop: 6 }}>
                ERC-721 · EIP-2981
              </div>
              <div style={{ borderTop: "1px dashed var(--parchment-dim)", margin: "16px 0" }} />
              <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5 }}>
                Provenance logged on every transfer. Royalty enforced on resale.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 56 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          <WorkflowStep number="01" title="Register" body="An artist mints a certificate NFT with metadata and a royalty rate." />
          <WorkflowStep number="02" title="First sale" body="The artist transfers the certificate directly to its first collector." />
          <WorkflowStep number="03" title="Resale" body="Later collectors list and buy through the marketplace — royalty splits automatically." />
          <WorkflowStep number="04" title="Verify" body="Anyone can look up an artwork's full history, free of charge, no wallet needed." />
          <WorkflowStep number="05" title="Exhibition" body="Museums log loan periods without ever changing recorded ownership." />
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 80 }}>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            On-chain, off-chain, physical
          </div>
          <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6, fontSize: 14 }}>
            <strong style={{ color: "var(--text-primary)" }}>On-chain</strong> data (ownership, provenance, royalty
            terms, exhibition records) shows what was recorded, by whom, and when — it does not independently
            verify that those recorded facts are true.{" "}
            <strong style={{ color: "var(--text-primary)" }}>Off-chain</strong> metadata on IPFS is
            content-addressed, so tampering is detectable, but the truthfulness of claims inside it isn't
            verified.{" "}
            <strong style={{ color: "var(--text-primary)" }}>The physical artwork</strong> is linked only by a
            tag ID the registering artist enters — asserted, not cryptographically proven, in this MVP. ArtProof
            is a working prototype, not a legally binding art registry.
          </p>
        </div>
      </section>
    </main>
  );
}

function WorkflowStep({ number, title, body }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="mono" style={{ color: "var(--gold)", fontSize: 12, marginBottom: 10 }}>
        {number}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
