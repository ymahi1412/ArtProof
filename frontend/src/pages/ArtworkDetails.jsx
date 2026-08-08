import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWallet } from "../hooks/useWallet.jsx";
import { getArtProofContract } from "../utils/contracts.js";
import ArtworkPanel from "../components/ArtworkPanel.jsx";

export default function ArtworkDetails() {
  const { tokenId } = useParams();
  const { account, chainId, provider, signer } = useWallet();

  const [isAuthorizedInstitution, setIsAuthorizedInstitution] = useState(false);
  const [form, setForm] = useState({ institution: "", custodian: "", startDate: "", endDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Check whether the connected account is an admin-authorized institution,
  // so we only show the "Log Exhibition" form to accounts that can actually use it.
  useEffect(() => {
    if (!account || !chainId || !provider) {
      setIsAuthorizedInstitution(false);
      return;
    }
    let cancelled = false;
    const contract = getArtProofContract(chainId, provider);
    if (!contract) return;
    contract
      .authorizedInstitutions(account)
      .then((authorized) => {
        if (!cancelled) setIsAuthorizedInstitution(authorized);
      })
      .catch(() => {
        if (!cancelled) setIsAuthorizedInstitution(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, chainId, provider]);

  async function handleLogCustody(e) {
    e.preventDefault();
    setFeedback(null);
    if (!signer) return;

    const contract = getArtProofContract(chainId, signer);
    const startUnix = form.startDate ? Math.floor(new Date(form.startDate).getTime() / 1000) : 0;
    const endUnix = form.endDate ? Math.floor(new Date(form.endDate).getTime() / 1000) : 0;

    setSubmitting(true);
    try {
      const tx = await contract.logCustody(tokenId, form.institution, form.custodian, startUnix, endUnix);
      await tx.wait();
      setFeedback({ type: "success", message: "Exhibition record logged on-chain." });
      setForm({ institution: "", custodian: "", startDate: "", endDate: "" });
      setRefreshKey((k) => k + 1); // forces ArtworkPanel to remount and re-fetch
    } catch (err) {
      setFeedback({ type: "error", message: err?.shortMessage || err?.message || "Transaction failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="eyebrow">Artwork Details</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 8, marginBottom: 28 }}>
        Certificate #{tokenId}
      </h1>

      <ArtworkPanel key={refreshKey} tokenId={tokenId} />

      {isAuthorizedInstitution && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Log exhibition / custody record
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 18 }}>
            Your connected account is an authorized institution. This only records a loan/exhibition period — it
            does not change ownership.
          </p>
          <form onSubmit={handleLogCustody}>
            <div className="field">
              <label htmlFor="institution">Institution name</label>
              <input
                id="institution"
                required
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                placeholder="e.g. Kochi Biennale Gallery"
              />
            </div>
            <div className="field">
              <label htmlFor="custodian">Custodian</label>
              <input
                id="custodian"
                required
                value={form.custodian}
                onChange={(e) => setForm({ ...form, custodian: e.target.value })}
                placeholder="e.g. Curator R. Nair"
              />
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="startDate">Start date</label>
                <input
                  id="startDate"
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="endDate">End date (optional — leave blank if ongoing)</label>
                <input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Logging…" : "Log exhibition record"}
            </button>
          </form>
          {feedback && (
            <p className="notice" style={{ marginTop: 14, color: feedback.type === "error" ? "var(--danger)" : "var(--success)" }}>
              {feedback.message}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
