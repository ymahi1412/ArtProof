import React from "react";
import { NavLink } from "react-router-dom";
import { useWallet } from "../hooks/useWallet.jsx";
import { getDeployment, shortenAddress } from "../utils/contracts.js";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/register", label: "Register" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/verify", label: "Verify" },
];

export default function Navbar() {
  const { account, chainId, connecting, error, connect, hasMetaMask } = useWallet();
  const deployment = chainId ? getDeployment(chainId) : null;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--ink-700)",
        position: "sticky",
        top: 0,
        background: "rgba(20, 18, 15, 0.9)",
        backdropFilter: "blur(8px)",
        zIndex: 10,
      }}
    >
      <div
        className="page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 18,
          paddingBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <NavLink to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <SealMark size={28} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, color: "var(--text-primary)" }}>
              ArtProof
            </span>
          </NavLink>
          <nav style={{ display: "flex", gap: 22 }}>
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                style={({ isActive }) => ({
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--gold)" : "2px solid transparent",
                  paddingBottom: 4,
                })}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {account && (
            <span
              className="mono"
              title={deployment ? deployment.name : "Unsupported network — switch to Hardhat Local or Sepolia"}
              style={{
                fontSize: 12,
                color: deployment ? "var(--success)" : "var(--danger)",
              }}
            >
              ● {deployment ? deployment.name : "Unsupported network"}
            </span>
          )}
          <button className="btn btn-primary" onClick={connect} disabled={connecting}>
            {account ? shortenAddress(account) : connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      </div>
      {!hasMetaMask && (
        <div className="page" style={{ paddingTop: 0, paddingBottom: 12 }}>
          <p className="notice">
            MetaMask isn't detected in this browser. Install it from{" "}
            <a href="https://metamask.io" target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>
              metamask.io
            </a>{" "}
            to use ArtProof.
          </p>
        </div>
      )}
      {error && (
        <div className="page" style={{ paddingTop: 0, paddingBottom: 12 }}>
          <p className="notice" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        </div>
      )}
    </header>
  );
}

/** The "signature element": a small wax-seal mark used as the wordmark icon and reused, larger, on the Verify page. */
export function SealMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="var(--seal-crimson)" />
      <circle cx="24" cy="24" r="22" stroke="var(--gold)" strokeOpacity="0.5" strokeWidth="1" />
      <path
        d="M15 24.5L21 30L33 17"
        stroke="var(--parchment)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
