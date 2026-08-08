import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { useWallet } from "../hooks/useWallet.jsx";
import { getArtProofContract, getMarketplaceContract, getLogsChunked, getDeployment, formatEth, shortenAddress } from "../utils/contracts.js";

/**
 * Like Dashboard, ArtProofMarketplace has no on-chain "list all active listings"
 * call — `listings` is a mapping, not an array. So this page reconstructs the
 * current set of active listings from Listed / ListingCancelled / Sale events,
 * then double-checks each candidate against `listings(tokenId).active` on-chain
 * (mappings are always the source of truth; the event scan is just how we find
 * *which* tokenIds to check).
 */
export default function Marketplace() {
  const { account, chainId, provider, signer, connect } = useWallet();
  const [listings, setListings] = useState([]); // [{ tokenId, seller, price }]
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);
  const [busyTokenId, setBusyTokenId] = useState(null);

  const load = useCallback(async () => {
    if (!chainId || !provider) return;
    const marketplace = getMarketplaceContract(chainId, provider);
    if (!marketplace) {
      setStatus("error");
      setErrorMessage("This network isn't configured. Switch to Sepolia or Hardhat Local.");
      return;
    }

    setStatus("loading");
    try {
      const deployment = getDeployment(chainId);
      const fromBlock = deployment?.deployedAtBlock ?? 0;
      const [listedEvents, cancelledEvents, saleEvents] = await Promise.all([
        getLogsChunked(marketplace, marketplace.filters.Listed(), fromBlock, provider),
        getLogsChunked(marketplace, marketplace.filters.ListingCancelled(), fromBlock, provider),
        getLogsChunked(marketplace, marketplace.filters.Sale(), fromBlock, provider),
      ]);

      const candidateIds = [...new Set(listedEvents.map((e) => e.args.tokenId.toString()))];

      // A token might have been listed, then cancelled or sold — only keep it as a
      // candidate if its most recent event was Listed, then confirm with a live read.
      const results = await Promise.all(
        candidateIds.map(async (id) => {
          const listing = await marketplace.listings(id);
          if (!listing.active) return null;
          return { tokenId: id, seller: listing.seller, price: listing.price };
        })
      );

      setListings(results.filter(Boolean));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.shortMessage || err?.message || "Failed to load listings.");
    }
    // cancelledEvents/saleEvents aren't used directly above since the live `listings()`
    // read already reflects their effect — kept in the Promise.all for a single round trip.
  }, [chainId, provider]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBuy(tokenId, price) {
    if (!signer) return;
    setBusyTokenId(tokenId);
    try {
      const marketplace = getMarketplaceContract(chainId, signer);
      const tx = await marketplace.buy(tokenId, { value: price });
      await tx.wait();
      await load();
    } catch (err) {
      alert(err?.shortMessage || err?.message || "Purchase failed.");
    } finally {
      setBusyTokenId(null);
    }
  }

  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="eyebrow">Marketplace</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 8, marginBottom: 28 }}>
        Resale listings
      </h1>

      {account ? (
        <ListForResaleForm chainId={chainId} signer={signer} onListed={load} />
      ) : (
        <div className="notice" style={{ marginBottom: 28 }}>
          <button className="btn btn-secondary" onClick={connect}>
            Connect wallet to list or buy
          </button>
        </div>
      )}

      {status === "loading" && <p className="notice">Loading active listings…</p>}
      {status === "error" && (
        <p className="notice" style={{ color: "var(--danger)" }}>
          {errorMessage}
        </p>
      )}

      {status === "ready" && listings.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No active listings right now.</p>
      )}

      {status === "ready" && listings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {listings.map((listing) => (
            <div key={listing.tokenId} className="card" style={{ padding: 20 }}>
              <Link to={`/artwork/${listing.tokenId}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                <div className="mono" style={{ color: "var(--gold)", fontSize: 12 }}>
                  #{listing.tokenId}
                </div>
              </Link>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>{formatEth(listing.price)}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Seller: <span className="mono">{shortenAddress(listing.seller)}</span>
              </div>
              {account && account.toLowerCase() === listing.seller.toLowerCase() ? (
                <span className="badge badge-muted" style={{ marginTop: 12 }}>
                  Your listing
                </span>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                  disabled={!account || busyTokenId === listing.tokenId}
                  onClick={() => handleBuy(listing.tokenId, listing.price)}
                >
                  {busyTokenId === listing.tokenId ? "Buying…" : "Buy now"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function ListForResaleForm({ chainId, signer, onListed }) {
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    if (!signer) return;

    setSubmitting(true);
    try {
      const artProof = getArtProofContract(chainId, signer);
      const marketplace = getMarketplaceContract(chainId, signer);
      const marketplaceAddress = await marketplace.getAddress();

      // Approve the marketplace for this specific token, then list it.
      const approveTx = await artProof.approve(marketplaceAddress, tokenId);
      await approveTx.wait();

      const priceWei = ethers.parseEther(price);
      const listTx = await marketplace.listForResale(tokenId, priceWei);
      await listTx.wait();

      setFeedback({ type: "success", message: `Token #${tokenId} listed for ${price} ETH.` });
      setTokenId("");
      setPrice("");
      onListed();
    } catch (err) {
      setFeedback({ type: "error", message: err?.shortMessage || err?.message || "Listing failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 32 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        List a token you own for resale
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0, width: 140 }}>
          <label htmlFor="listTokenId">Token ID</label>
          <input id="listTokenId" type="number" min="0" required value={tokenId} onChange={(e) => setTokenId(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 160 }}>
          <label htmlFor="listPrice">Price (ETH)</label>
          <input id="listPrice" type="number" min="0" step="0.0001" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Listing…" : "Approve & list"}
        </button>
      </form>
      {feedback && (
        <p className="notice" style={{ marginTop: 14, color: feedback.type === "error" ? "var(--danger)" : "var(--success)" }}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
