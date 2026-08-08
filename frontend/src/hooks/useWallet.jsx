import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

/**
 * Wraps the app and exposes wallet state (account, chainId, provider, signer)
 * plus connect/disconnect actions. Uses window.ethereum, which MetaMask (and
 * most other browser wallets) inject automatically — no SDK/API key needed.
 */
export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const hasMetaMask = typeof window !== "undefined" && Boolean(window.ethereum);

  const refreshFromProvider = useCallback(async (browserProvider) => {
    const network = await browserProvider.getNetwork();
    setChainId(Number(network.chainId));

    const accounts = await browserProvider.listAccounts();
    if (accounts.length > 0) {
      const activeSigner = await browserProvider.getSigner();
      setSigner(activeSigner);
      setAccount(await activeSigner.getAddress());
    } else {
      setSigner(null);
      setAccount(null);
    }
  }, []);

  // On load, if MetaMask is already connected to this site from a previous
  // session, silently pick that up without prompting a new connect popup.
  useEffect(() => {
    if (!hasMetaMask) return;
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(browserProvider);
    refreshFromProvider(browserProvider).catch(() => {});
  }, [hasMetaMask, refreshFromProvider]);

  // React to the user switching accounts or networks inside MetaMask itself.
  useEffect(() => {
    if (!hasMetaMask) return;

    const handleAccountsChanged = () => {
      if (provider) refreshFromProvider(provider).catch(() => {});
    };
    const handleChainChanged = () => {
      // Simplest safe approach: reload, since a provider tied to the old
      // network can otherwise return stale/incorrect data mid-session.
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [hasMetaMask, provider, refreshFromProvider]);

  const connect = useCallback(async () => {
    setError(null);
    if (!hasMetaMask) {
      setError("MetaMask is not installed. Install it from metamask.io to use ArtProof.");
      return;
    }
    setConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      setProvider(browserProvider);
      await refreshFromProvider(browserProvider);
    } catch (err) {
      // 4001 = user rejected the connection request in the MetaMask popup
      if (err?.code === 4001) {
        setError("Connection request was rejected.");
      } else {
        setError(err?.shortMessage || err?.message || "Failed to connect wallet.");
      }
    } finally {
      setConnecting(false);
    }
  }, [hasMetaMask, refreshFromProvider]);

  const disconnect = useCallback(() => {
    // MetaMask doesn't expose a programmatic "disconnect" — this just clears
    // local app state. The user can fully disconnect from within MetaMask's
    // own "Connected sites" settings if they want to revoke access.
    setAccount(null);
    setSigner(null);
  }, []);

  const value = {
    account,
    chainId,
    provider,
    signer,
    connecting,
    error,
    hasMetaMask,
    isConnected: Boolean(account),
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
