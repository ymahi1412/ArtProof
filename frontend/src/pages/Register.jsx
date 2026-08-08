import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet.jsx";
import { getArtProofContract } from "../utils/contracts.js";
import { uploadArtworkMetadata, isIpfsConfigured } from "../utils/ipfs.js";

export default function Register() {
  const { account, chainId, signer, connect } = useWallet();
  const [form, setForm] = useState({ title: "", description: "", royaltyPercent: "5" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [stage, setStage] = useState("idle"); // idle | uploading | minting | done
  const [result, setResult] = useState(null); // { tokenId, txHash } | null
  const [error, setError] = useState(null);

  function handleImageChange(e) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!signer) {
      setError("Connect your wallet first.");
      return;
    }

    const royaltyBps = Math.round(Number(form.royaltyPercent) * 100);

    try {
      // Step 1: upload image + metadata to IPFS.
      setStage("uploading");
      const metadataURI = await uploadArtworkMetadata({
        title: form.title,
        description: form.description,
        artistAddress: account,
        imageFile,
      });

      // Step 2: mint the certificate pointing at that metadata.
      setStage("minting");
      const contract = getArtProofContract(chainId, signer);
      const tx = await contract.mintCertificate(metadataURI, royaltyBps);
      const receipt = await tx.wait();

      const mintEvent = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "CertificateMinted");

      setResult({
        tokenId: mintEvent ? mintEvent.args.tokenId.toString() : null,
        txHash: receipt.hash,
      });
      setStage("done");
      setForm({ title: "", description: "", royaltyPercent: "5" });
      setImageFile(null);
      setImagePreviewUrl(null);
    } catch (err) {
      setError(err?.shortMessage || err?.message || "Something went wrong.");
      setStage("idle");
    }
  }

  const submitting = stage === "uploading" || stage === "minting";

  return (
    <main className="page" style={{ paddingTop: 48, maxWidth: 620 }}>
      <div className="eyebrow">Register</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 8, marginBottom: 12 }}>
        Mint an artwork certificate
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 28 }}>
        This uploads your artwork's image and details to IPFS, then mints an ERC-721 certificate on-chain with
        you (the connected wallet) as the artist of record.
      </p>

      {!isIpfsConfigured() && (
        <div className="notice" style={{ marginBottom: 24, color: "var(--danger)" }}>
          IPFS isn't configured yet. Add <code>VITE_PINATA_JWT</code> to <code>frontend/.env</code> (see the
          comment at the top of <code>src/utils/ipfs.js</code> for setup steps), then restart{" "}
          <code>npm run dev</code>.
        </div>
      )}

      {!account ? (
        <button className="btn btn-primary" onClick={connect}>
          Connect wallet to continue
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Sunset over Kochi"
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={4}
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Medium, dimensions, year, notes…"
            />
          </div>
          <div className="field">
            <label htmlFor="image">Artwork image</label>
            <input id="image" type="file" accept="image/*" onChange={handleImageChange} />
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Preview"
                style={{
                  marginTop: 10,
                  maxWidth: 220,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--ink-700)",
                }}
              />
            )}
          </div>
          <div className="field" style={{ maxWidth: 200 }}>
            <label htmlFor="royalty">Resale royalty (%, max 10)</label>
            <input
              id="royalty"
              type="number"
              min="0"
              max="10"
              step="0.1"
              required
              value={form.royaltyPercent}
              onChange={(e) => setForm({ ...form, royaltyPercent: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting || !isIpfsConfigured()}>
            {stage === "uploading" && "Uploading to IPFS…"}
            {stage === "minting" && "Minting on-chain…"}
            {(stage === "idle" || stage === "done") && "Mint certificate"}
          </button>
        </form>
      )}

      {error && (
        <p className="notice" style={{ marginTop: 20, color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {result && (
        <p className="notice" style={{ marginTop: 20, color: "var(--success)" }}>
          Minted! Token ID <strong>{result.tokenId ?? "—"}</strong>. Transaction:{" "}
          <span className="mono">{result.txHash}</span>
          {result.tokenId && (
            <>
              {" "}
              —{" "}
              <Link to={`/artwork/${result.tokenId}`} style={{ color: "var(--gold)" }}>
                View certificate →
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}
