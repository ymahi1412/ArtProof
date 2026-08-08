import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet.jsx";
import { getArtProofContract } from "../utils/contracts.js";

/**
 * ArtProof.sol is NOT ERC721Enumerable (kept out deliberately to stay simple —
 * see README "What should NOT be included"), so there's no single on-chain call
 * that returns "all tokens owned by address X". Instead, this page reconstructs
 * that list client-side from historical events:
 *   1. CertificateMinted(artist == me)  -> tokens I originally created
 *   2. Transfer(to == me)               -> tokens ever sent to me
 * ...then confirms current ownership with ownerOf() for each candidate, since a
 * token may have moved on since being minted/received.
 *
 * NOTE: querying from block 0 is fine for a fresh local/testnet deployment like
 * this one, but would need a fromBlock cutoff (or an indexer/subgraph) on a
 * long-lived mainnet deployment with a large block history.
 */
export default function Dashboard() {
  const { account, chainId, provider, connect } = useWallet();
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [created, setCreated] = useState([]);
  const [owned, setOwned] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);

  const load = useCallback(async () => {
    if (!account || !chainId || !provider) return;
    const contract = getArtProofContract(chainId, provider);
    if (!contract) {
      setStatus("error");
      setErrorMessage("This network isn't configured. Switch to Sepolia or Hardhat Local.");
      return;
    }

    setStatus("loading");
    try {
      const [mintedEvents, receivedEvents] = await Promise.all([
        contract.queryFilter(contract.filters.CertificateMinted(null, account)),
        contract.queryFilter(contract.filters.Transfer(null, account)),
      ]);

      const createdIds = [...new Set(mintedEvents.map((e) => e.args.tokenId.toString()))];
      const candidateOwnedIds = [...new Set(receivedEvents.map((e) => e.args.tokenId.toString()))];

      // Confirm current ownership (a candidate may have since been sold/transferred away).
      const ownedChecks = await Promise.all(
        candidateOwnedIds.map(async (id) => {
          try {
            const currentOwner = await contract.ownerOf(id);
            return currentOwner.toLowerCase() === account.toLowerCase() ? id : null;
          } catch {
            return null;
          }
        })
      );
      const confirmedOwnedIds = ownedChecks.filter(Boolean);

      // Fetch light display info (title from metadata skipped here to keep this
      // page dependency-free of IPFS fetches; shows tokenId + metadata link instead).
      setCreated(createdIds);
      setOwned(confirmedOwnedIds);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.shortMessage || err?.message || "Failed to load your tokens.");
    }
  }, [account, chainId, provider]);

  useEffect(() => {
    load();
  }, [load]);

  if (!account) {
    return (
      <main className="page" style={{ paddingTop: 48 }}>
        <div className="eyebrow">Dashboard</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 8, marginBottom: 20 }}>
          Your artworks
        </h1>
        <button className="btn btn-primary" onClick={connect}>
          Connect wallet to view your dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="eyebrow">Dashboard</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 8, marginBottom: 8 }}>
        Your artworks
      </h1>
      <p className="mono" style={{ marginBottom: 28 }}>{account}</p>

      {status === "loading" && <p className="notice">Scanning on-chain history for your tokens…</p>}
      {status === "error" && (
        <p className="notice" style={{ color: "var(--danger)" }}>
          {errorMessage}
        </p>
      )}

      {status === "ready" && (
        <>
          <TokenSection title="Created by you (artist of record)" tokenIds={created} emptyText="You haven't minted any certificates yet." />
          <TokenSection title="Currently owned" tokenIds={owned} emptyText="You don't currently own any certificates." />
        </>
      )}
    </main>
  );
}

function TokenSection({ title, tokenIds, emptyText }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        {title}
      </div>
      {tokenIds.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{emptyText}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {tokenIds.map((id) => (
            <Link
              key={id}
              to={`/artwork/${id}`}
              className="card"
              style={{ textDecoration: "none", color: "var(--text-primary)", padding: 18 }}
            >
              <div className="mono" style={{ color: "var(--gold)", fontSize: 12 }}>
                #{id}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>View details →</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
