import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";

import {
  connectWallet,
  describeError,
  explorerTxUrl,
  getEthereum,
  submitRecordWrite,
  type Deployment,
  type TxState,
  type WalletState,
} from "../lib/genlayer";

const WALLET_LABEL: Record<WalletState["status"], string> = {
  "no-provider": "No browser wallet detected",
  disconnected: "Wallet not connected",
  connecting: "Connecting…",
  "wrong-network": "Wallet is on the wrong network",
  connected: "Wallet connected",
};

function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * A small, self-contained on-chain runner.
 *
 * The Playground and Tightness screens run their comparisons locally in Pyodide, which
 * is instant and needs no wallet. This component adds the one thing those screens
 * cannot do locally: submit a real transaction to a deployed StudioNet contract and
 * follow it through signature, hash, live consensus status, the final receipt, and the
 * read-back. It reuses the same lifecycle as the Live screen, so nothing is simulated.
 */
export interface OnChainRunHandle {
  run: () => Promise<void>;
}

export interface OnChainRunProps {
  deployment: Deployment;
  method: string;
  args: unknown[];
  label?: string;
}

export const OnChainRun = forwardRef<OnChainRunHandle, OnChainRunProps>(
  ({ deployment, method, args, label = "Run on StudioNet" }, ref) => {
  const [wallet, setWallet] = useState<WalletState>({ status: "disconnected" });
  const [connecting, setConnecting] = useState(false);
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [running, setRunning] = useState(false);

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

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      setWallet(await connectWallet());
    } finally {
      setConnecting(false);
    }
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    let currentWallet = wallet;
    if (currentWallet.status !== "connected") {
      setConnecting(true);
      try {
        currentWallet = await connectWallet();
        setWallet(currentWallet);
      } finally {
        setConnecting(false);
      }
    }
    if (currentWallet.status !== "connected") return;
    setRunning(true);
    setTx({ phase: "signing" });
    try {
      await submitRecordWrite(deployment, method, args, setTx);
    } catch (error) {
      setTx({ phase: "failed", error: describeError(error, "The write failed.") });
    } finally {
      setRunning(false);
    }
  }, [args, deployment, method, running, wallet]);

  useImperativeHandle(ref, () => ({ run }), [run]);

  return (
    <div className="on-chain-run">
      <div className="row" style={{ alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span className="small muted">
          StudioNet (gasless). {wallet.status === "connected" ? shortAddress(wallet.address) : WALLET_LABEL[wallet.status]}
        </span>
        {wallet.status !== "connected" && wallet.status !== "no-provider" ? (
          <button type="button" className="btn small" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : WALLET_LABEL[wallet.status]}
          </button>
        ) : null}
        <button
          type="button"
          className="btn small btn-primary"
          onClick={run}
          disabled={running || wallet.status === "no-provider" || wallet.status === "wrong-network"}
        >
          {running ? "Running…" : label}
        </button>
      </div>

      {tx.phase === "signing" ? (
        <p className="small muted" role="status">Waiting for the wallet signature…</p>
      ) : null}
      {tx.phase === "submitted" ? (
        <p className="small muted" role="status">
          Submitted: <code className="small mono">{tx.hash}</code>
        </p>
      ) : null}
      {tx.phase === "tracking" ? (
        <p className="small muted" role="status">
          Status {tx.statusName ?? "…"} — validators are voting; this can take a minute or two.
        </p>
      ) : null}
      {tx.phase === "failed" ? (
        <p className="small" role="alert" style={{ color: "var(--reject, #b00020)" }}>
          {tx.error ?? "The transaction failed."}
        </p>
      ) : null}
      {tx.phase === "finalized" ? (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <p className="small muted">
            Finalized{tx.rounds ? ` after ${tx.rounds} round(s)` : ""}. Consensus:{" "}
            <strong>{tx.consensusResult ?? "unknown"}</strong>
            {tx.execution ? (
              <>
                {" "}· Execution: <strong>{tx.execution}</strong>
              </>
            ) : null}
          </p>
          {tx.votes && tx.votes.length > 0 ? (
            <div className="row" style={{ gap: "0.25rem", flexWrap: "wrap" }}>
              {tx.votes.map((vote, index) => (
                <span key={`${vote}-${index}`} className="chip">
                  {vote}
                </span>
              ))}
            </div>
          ) : null}
          {tx.hash ? (
            <p className="small muted">
              <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            </p>
          ) : null}
          {tx.recordId !== undefined && tx.readBack !== undefined ? (
            <pre className="live-json">{JSON.stringify(tx.readBack, null, 2)}</pre>
          ) : null}
          {tx.recordId !== undefined && tx.readBack === undefined ? (
            <p className="small muted">
              Finalized, but the read-back did not return the record. Re-read in a moment;
              treat the explorer receipt as the authority.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
