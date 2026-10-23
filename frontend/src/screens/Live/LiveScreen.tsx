import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorNotice } from "../../components/Notices";
import {
  DEPLOYMENTS,
  connectWallet,
  describeError,
  explorerAddressUrl,
  explorerTxUrl,
  findDeployment,
  getEthereum,
  readView,
  submitRecordWrite,
  type Deployment,
  type TxState,
  type WalletState,
} from "../../lib/genlayer";

/**
 * The Live screen is the only place this site touches the chain.
 *
 * Two halves, on purpose:
 *
 * 1. Reads need no wallet. Every view call goes to the deployed contract on StudioNet
 *    and renders exactly what came back — the same JSON strings the Python tests assert
 *    on. This is what makes the playground's claims checkable against the real thing.
 * 2. Writes are signed by the user's wallet and followed through the whole transaction
 *    lifecycle: signature, hash, live consensus status, the final receipt with the
 *    validator votes and the execution result, and finally a view call that reads the
 *    new record back so the write is proven to have landed.
 *
 * Nothing here is simulated. If the network is slow, the screen says so; if the wallet
 * is on the wrong chain, the screen says which one.
 */

const INT_FIELDS = new Set(["judgment_id", "spec_id", "ranking_id", "top_k", "min_overlap_pct", "max_rank_distance"]);
const JSON_FIELDS = new Set(["rubric_json", "facts_json"]);

function formatArg(field: string, value: string): string | number {
  if (INT_FIELDS.has(field)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return value;
}

function pretty(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const WALLET_LABEL: Record<WalletState["status"], string> = {
  "no-provider": "No browser wallet detected",
  disconnected: "Wallet not connected",
  connecting: "Connecting…",
  "wrong-network": "Wallet is on the wrong network",
  connected: "Wallet connected",
};

/** The first deployment and its first view — what runs on arrival, with no wallet. */
const FIRST_DEPLOYMENT_ID: Deployment["id"] = DEPLOYMENTS[0]?.id ?? "verdict_judge";
const FIRST_READ_NAME = DEPLOYMENTS[0]?.reads[0]?.name ?? "get_config";

function voteTone(vote: string): string {
  if (vote === "AGREE" || vote === "MAJORITY_AGREE") return "chip-accept";
  if (vote === "DISAGREE" || vote === "DETERMINISTIC_VIOLATION" || vote === "TIMEOUT") {
    return "chip-reject";
  }
  return "";
}

export function LiveScreen() {
  const [deploymentId, setDeploymentId] = useState<Deployment["id"]>(FIRST_DEPLOYMENT_ID);
  const deployment = useMemo(() => findDeployment(deploymentId), [deploymentId]);

  const [viewName, setViewName] = useState(FIRST_READ_NAME);
  const [viewArgs, setViewArgs] = useState<Record<string, string>>({});
  const [readResult, setReadResult] = useState<unknown>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const [wallet, setWallet] = useState<WalletState>({ status: "disconnected" });
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const view = useMemo(
    () =>
      deployment.reads.find((item) => item.name === viewName) ??
      deployment.reads[0] ??
      { name: "get_config", args: [], note: "" },
    [deployment, viewName],
  );
  const write = deployment.writes[0] ?? null;

  // A wallet that already authorized this site shows up without a popup.
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

  const runRead = useCallback(
    async (target: Deployment, method: string, args: unknown[]) => {
      setReading(true);
      setReadError(null);
      try {
        const result = await readView(target, method, args);
        setReadResult(result);
      } catch (error) {
        setReadResult(null);
        setReadError(describeError(error, "The read call failed. The StudioNet RPC may be busy."));
      } finally {
        setReading(false);
      }
    },
    [],
  );

  // Prove the call path on arrival: the config read runs itself, no wallet required.
  useEffect(() => {
    const firstRead = deployment.reads[0]?.name ?? "get_config";
    const create = deployment.writes[0];
    setReadResult(null);
    setReadError(null);
    setViewName(firstRead);
    setViewArgs({});
    setTx({ phase: "idle" });
    setFormError(null);
    setForm(
      create
        ? Object.fromEntries(
            create.args.map((field) => [field.name, create.example[field.name] ?? ""]),
          )
        : {},
    );
    void runRead(deployment, firstRead, []);
  }, [deployment, runRead]);

  const connect = async () => {
    setConnecting(true);
    try {
      setWallet(await connectWallet());
    } finally {
      setConnecting(false);
    }
  };

  const jsonProblem = useMemo(() => {
    for (const [name, value] of Object.entries(form)) {
      if (!JSON_FIELDS.has(name)) continue;
      try {
        JSON.parse(value);
      } catch {
        return `${name} is not valid JSON yet.`;
      }
    }
    return null;
  }, [form]);

  const canSubmit = wallet.status === "connected" && !jsonProblem && tx.phase !== "signing";

  const submit = async () => {
    if (!write || !canSubmit) return;
    setFormError(null);
    setTx({ phase: "signing" });
    try {
      await submitRecordWrite(
        deployment,
        write.name,
        write.args.map((field) => formatArg(field.name, form[field.name] ?? "")),
        setTx,
      );
    } catch (error) {
      setTx({ phase: "failed", error: describeError(error, "The write failed.") });
    }
  };

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Live contracts</h1>
        <p className="panel-note">
          These calls go to the three reference contracts deployed on StudioNet. Reads are
          free and need no wallet. A write is signed in your wallet and finalizes by
          consensus, which takes a minute or two — the status below is the transaction's
          real state, not a progress animation.
        </p>
        <p className="small muted">
          Network: StudioNet (gasless, 0 GEN per transaction). Addresses and method
          signatures come from{" "}
          <code>deployments/studionet.md</code>, generated from the contracts themselves.
        </p>
      </div>

      <div className="panel">
        <h2 className="panel-title">Contract</h2>
        <div className="live-tabs" role="tablist" aria-label="Deployed contract">
          {DEPLOYMENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === deployment.id}
              className={`live-tab${item.id === deployment.id ? " live-tab-active" : ""}`}
              onClick={() => setDeploymentId(item.id)}
            >
              {item.label}
              <span className="chip">{item.pattern}</span>
            </button>
          ))}
        </div>
        <p className="small muted">
          <a href={explorerAddressUrl(deployment.address)} target="_blank" rel="noreferrer">
            {deployment.address}
          </a>{" "}
          · {deployment.file}
        </p>
      </div>

      <div className="panel">
        <h2 className="panel-title">Read</h2>
        <p className="panel-note">{view.note}</p>
        <div className="row">
          <div className="live-field">
            <label className="field-label" htmlFor="live-view-method">
              View method
            </label>
            <select
              id="live-view-method"
              value={view.name}
              onChange={(event) => {
                setViewName(event.target.value);
                setViewArgs({});
              }}
            >
              {deployment.reads.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {view.args.map((field) => (
            <div className="live-field" key={field.name}>
              <label className="field-label" htmlFor={`live-read-${field.name}`}>
                {field.name}
              </label>
              <input
                id={`live-read-${field.name}`}
                inputMode="numeric"
                value={viewArgs[field.name] ?? "0"}
                onChange={(event) =>
                  setViewArgs((current) => ({ ...current, [field.name]: event.target.value }))
                }
              />
              {field.hint ? <span className="small muted">{field.hint}</span> : null}
            </div>
          ))}
          <button
            type="button"
            disabled={reading}
            onClick={() =>
              void runRead(
                deployment,
                view.name,
                view.args.map((field) => formatArg(field.name, viewArgs[field.name] ?? "0")),
              )
            }
          >
            {reading ? "Reading…" : "Run read"}
          </button>
        </div>

        {readError ? <ErrorNotice message={readError} /> : null}
        {readResult !== null && !readError ? (
          <pre className="live-json" data-testid="read-result">
            {pretty(readResult)}
          </pre>
        ) : null}
      </div>

      <div className="panel">
        <h2 className="panel-title">Write</h2>
        <p className="panel-note">{write?.note ?? ""}</p>

        <div className="row live-wallet">
          <span className={`chip live-wallet-chip`} data-status={wallet.status}>
            {WALLET_LABEL[wallet.status]}
          </span>
          {wallet.address ? (
            <span className="small muted">{shortAddress(wallet.address)} · StudioNet</span>
          ) : null}
          {wallet.status === "connected" ? null : (
            <button type="button" onClick={() => void connect()} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
        {wallet.status === "no-provider" ? (
          <p className="small muted">
            Installing a browser wallet unlocks writes. Reads above work without one.
          </p>
        ) : null}
        {wallet.status === "wrong-network" ? (
          <ErrorNotice message="Your wallet is on a different network. Switch it to StudioNet and connect again." />
        ) : null}

        <div className="row">
          {(write?.args ?? []).map((field) => (
            <div className="live-field" key={field.name}>
              <label className="field-label" htmlFor={`live-write-${field.name}`}>
                {field.name}
              </label>
              {JSON_FIELDS.has(field.name) ? (
                <textarea
                  id={`live-write-${field.name}`}
                  rows={4}
                  spellCheck={false}
                  value={form[field.name] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              ) : (
                <input
                  id={`live-write-${field.name}`}
                  value={form[field.name] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              )}
              {field.hint ? <span className="small muted">{field.hint}</span> : null}
            </div>
          ))}
        </div>
        {jsonProblem ? <p className="status-bad">{jsonProblem}</p> : null}

        <div className="row actions">
          <button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {tx.phase === "signing" ? "Waiting for wallet…" : `Send ${write?.name ?? "write"}`}
          </button>
          <span className="small muted">
            Prefilled with the values that already reached consensus on StudioNet. Edit them
            to try your own; the contract rejects anything outside its documented bounds.
          </span>
        </div>
        {formError ? <ErrorNotice message={formError} /> : null}
      </div>

      {tx.phase !== "idle" ? (
        <div className="panel">
          <h2 className="panel-title">Transaction</h2>
          <ol className="live-steps">
            <li className="live-step" data-state={tx.phase === "signing" ? "current" : "done"}>
              <strong>Signature</strong>
              <span className="small muted">
                Your wallet signs and broadcasts the transaction.
              </span>
            </li>
            <li
              className="live-step"
              data-state={
                tx.hash ? (tx.phase === "finalized" ? "done" : "current") : tx.phase === "failed" ? "failed" : "todo"
              }
            >
              <strong>Submitted</strong>
              {tx.hash ? (
                <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noreferrer" className="small">
                  {tx.hash}
                </a>
              ) : (
                <span className="small muted">Waiting for a transaction hash…</span>
              )}
            </li>
            <li
              className="live-step"
              data-state={
                tx.phase === "finalized" ? "done" : tx.phase === "tracking" ? "current" : "todo"
              }
            >
              <strong>Consensus</strong>
              <span className="small muted">
                {tx.phase === "tracking" || tx.phase === "finalized"
                  ? `Validators are voting — status ${tx.statusName ?? "…"}.`
                  : "Validators vote on the leader's result."}
              </span>
            </li>
            <li
              className="live-step"
              data-state={tx.phase === "finalized" ? "done" : "todo"}
            >
              <strong>Finality</strong>
              <span className="small muted">
                {tx.phase === "finalized"
                  ? `Finalized${tx.rounds ? ` after ${tx.rounds} round(s)` : ""}.`
                  : "Finalized means the result is permanent."}
              </span>
            </li>
          </ol>

          {tx.phase === "tracking" ? (
            <p className="small muted" role="status">
              Status {tx.statusName ?? "…"} — this can take a minute or two.
            </p>
          ) : null}

          {tx.phase === "failed" ? (
            <ErrorNotice message={tx.error ?? "The transaction failed."} />
          ) : null}

          {tx.phase === "finalized" ? (
            <>
              <div className="row live-votes" aria-label="Validator votes">
                {tx.votes?.map((vote, index) => (
                  <span key={`${vote}-${index}`} className={`chip ${voteTone(vote)}`}>
                    {vote}
                  </span>
                ))}
              </div>
              <p className="small muted">
                Execution result: <strong>{tx.executionResult ?? "unknown"}</strong>. A
                transaction can finalize and still have a failed execution, so the two are
                reported separately.
              </p>
              {tx.recordId !== undefined && tx.readBack !== undefined ? (
                <>
                  <p className="small muted">
                    Read back from <code>{deployment.recordView}({tx.recordId})</code> — the
                    write landed:
                  </p>
                  <pre className="live-json">{pretty(tx.readBack)}</pre>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
