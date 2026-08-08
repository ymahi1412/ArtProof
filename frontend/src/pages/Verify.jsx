import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ArtworkPanel from "../components/ArtworkPanel.jsx";

export default function Verify() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTokenId = searchParams.get("tokenId") ?? "";
  const [input, setInput] = useState(initialTokenId);
  const [activeTokenId, setActiveTokenId] = useState(initialTokenId || null);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed === "") return;
    setActiveTokenId(trimmed);
    setSearchParams({ tokenId: trimmed });
  }

  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="eyebrow">Verification</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, marginTop: 8, marginBottom: 12 }}>
        Look up any artwork
      </h1>
      <p style={{ color: "var(--text-muted)", maxWidth: 560, marginBottom: 28 }}>
        Enter a certificate's token ID to see its on-chain record: current owner, artist, royalty terms, full
        provenance, and exhibition history. No wallet connection needed — this is a free, public read.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, marginBottom: 36, maxWidth: 420 }}>
        <input
          type="number"
          min="0"
          placeholder="Token ID, e.g. 0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            background: "var(--ink-800)",
            border: "1px solid var(--ink-700)",
            borderRadius: "var(--radius-sm)",
            padding: "11px 14px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 14,
          }}
        />
        <button type="submit" className="btn btn-primary">
          Verify
        </button>
      </form>

      <ArtworkPanel tokenId={activeTokenId} />
    </main>
  );
}
