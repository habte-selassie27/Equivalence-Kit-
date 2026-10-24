import { useEffect, useState } from "react";

import {
  connectWallet,
  getEthereum,
  type WalletState,
} from "../lib/genlayer";

const WALLET_LABEL: Record<WalletState["status"], string> = {
  "no-provider": "No wallet",
  disconnected: "Connect wallet",
  connecting: "Connecting…",
  "wrong-network": "Wrong network",
  connected: "Wallet",
};

function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletIcon() {
  return (
    <svg
      className="wallet-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5" />
      <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * A small wallet control for the header.
 *
 * Reads and writes still happen on the Live screen; this button just makes the wallet
 * visible and connectable from anywhere, so a user does not have to navigate to Live
 * to authorize the site.
 */
export function WalletButton() {
  const [wallet, setWallet] = useState<WalletState>({ status: "disconnected" });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const injected = getEthereum();
    if (!injected) {
      setWallet({ status: "no-provider" });
      return;
    }
    void injected
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list?.[0]) setWallet({ status: "connected", address: list[0] });
      })
      .catch(() => undefined);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      setWallet(await connectWallet());
    } finally {
      setConnecting(false);
    }
  };

  if (wallet.status === "connected") {
    return (
      <span
        className="wallet-pill"
        title={`${wallet.address} · StudioNet`}
      >
        <span className="wallet-pill-dot" aria-hidden="true" />
        <span className="wallet-pill-address">{shortAddress(wallet.address)}</span>
        <span className="wallet-pill-network" aria-hidden="true">
          StudioNet
        </span>
      </span>
    );
  }

  if (wallet.status === "no-provider") {
    return (
      <span className="wallet-pill wallet-pill-muted" title="No browser wallet was found">
        <span className="wallet-pill-dot" aria-hidden="true" />
        No wallet
      </span>
    );
  }

  if (wallet.status === "wrong-network") {
    return (
      <button
        type="button"
        className="btn wallet-wrong-network"
        onClick={connect}
        disabled={connecting}
      >
        <WalletIcon />
        {connecting ? "Switching…" : "Wrong network"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary wallet-connect"
      onClick={connect}
      disabled={connecting}
      data-connecting={connecting ? "true" : undefined}
    >
      <WalletIcon />
      {connecting ? "Connecting…" : WALLET_LABEL[wallet.status]}
    </button>
  );
}
