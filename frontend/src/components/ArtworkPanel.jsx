import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet.jsx";
import {
  getArtProofContract,
  formatEth,
  formatTimestamp,
  shortenAddress,
  resolveIpfsUri,
} from "../utils/contracts.js";

/**
 * Looks up a single tokenId on-chain and renders its full public record:
 * summary, royalty terms, provenance timeline, and exhibition history.
 * Every call here is a free `view` read — no wallet connection or gas required,
 * matching the "anyone can verify, free of charge" requirement.
 */
export default function ArtworkPanel({ tokenId }) {
  const { provider, chainId } = useWallet();
  const [state, setState] = useState({ status: "idle" }); // idle | loading | notfound | error | ready

  useEffect(() => {
    if (tokenId === null || tokenId === undefined || tokenId === "" || !provider || !chainId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      const contract = getArtProofContract(chainId, provider);
      if (!contract) {
        if (!cancelled) setState({ status: "error", message: "This network isn't configured. Switch to Sepolia or Hardhat Local." });
        return;
      }
      try {
        const summary = await contract.getArtworkSummary(tokenId);
        const [history, exhibitions, royalty] = await Promise.all([
          contract.getHistory(tokenId),
          contract.getExhibitions(tokenId),
          contract.royaltyInfo(tokenId, 10000n), // sample against 10000 wei to derive the bps rate
        ]);
        if (!cancelled) {
          setState({
            status: "ready",
            summary,
            history,
            exhibitions,
            // royaltyInfo() called against a 10000-wei sample price returns royaltyAmount == bps directly,
            // since royaltyAmount = salePrice * bps / 10000.
            royaltyBps: royalty[1],
            royaltyReceiver: royalty[0],
          });
        }
      } catch (err) {
        if (!cancelled) {
          // ArtProof's view functions revert on a nonexistent tokenId (via ownerOf), which ethers surfaces here.
          setState({ status: "notfound" });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenId, provider, chainId]);

  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return <p className="notice">Looking up token #{tokenId} on-chain…</p>;
  }

  if (state.status === "notfound") {
    return <p className="notice">No artwork found for token #{tokenId} on this network.</p>;
  }

  if (state.status === "error") {
    return (
      <p className="notice" style={{ color: "var(--danger)" }}>
        {state.message}
      </p>
    );
  }

  const { summary, history, exhibitions, royaltyBps, royaltyReceiver } = state;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="eyebrow">Certificate #{tokenId}</div>
            <p style={{ marginTop: 6, marginBottom: 0 }}>
              <a href={resolveIpfsUri(summary.metadataURI)} target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>
                View metadata ↗
              </a>
            </p>
          </div>
          <span className="badge badge-success">Verified on-chain</span>
        </div>

        <dl style={{ marginTop: 20, display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 10, columnGap: 12 }}>
          <dt style={{ color: "var(--text-muted)", fontSize: 13 }}>Current owner</dt>
          <dd className="mono" style={{ margin: 0 }}>{summary.currentOwner}</dd>

          <dt style={{ color: "var(--text-muted)", fontSize: 13 }}>Artist of record</dt>
          <dd className="mono" style={{ margin: 0 }}>{summary.artist}</dd>

          <dt style={{ color: "var(--text-muted)", fontSize: 13 }}>Royalty on resale</dt>
          <dd style={{ margin: 0 }}>
            {(Number(royaltyBps) / 100).toFixed(2)}% to <span className="mono">{shortenAddress(royaltyReceiver)}</span>
          </dd>

          <dt style={{ color: "var(--text-muted)", fontSize: 13 }}>Transfers logged</dt>
          <dd style={{ margin: 0 }}>{summary.numTransfers.toString()}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Provenance (on-chain, oldest first)
        </div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {history.map((record, i) => (
            <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i === history.length - 1 ? "var(--gold)" : "var(--ink-700)",
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 14 }}>
                  <span className="mono">{shortenAddress(record.owner)}</span> — {record.note}
                  {record.salePrice > 0n && <> for {formatEth(record.salePrice)}</>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatTimestamp(record.timestamp)}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Exhibition & custody history
        </div>
        {exhibitions.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>No exhibition records yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {exhibitions.map((ex, i) => (
              <li key={i}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.institution}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Custodian: {ex.custodian} · {formatTimestamp(ex.startDate)} —{" "}
                  {ex.endDate > 0n ? formatTimestamp(ex.endDate) : "ongoing"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
        This record shows what was entered on-chain and when. It does not independently verify that recorded
        facts (identity, sale price) are true, nor does it confirm the physical artwork's authenticity. See{" "}
        <Link to="/" style={{ color: "var(--gold)" }}>
          on-chain vs. off-chain vs. physical
        </Link>
        .
      </p>
    </div>
  );
}
