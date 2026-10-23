/**
 * The browser's only bridge to GenLayer.
 *
 * Three rules, in order of importance:
 *
 * 1. The SDK loads lazily. Nothing else on the site — and no test — pays for it, and a
 *    failure to load it degrades to read-only messaging instead of a blank page.
 * 2. This module never re-implements chain logic. A read is `readContract`, a write is
 *    signed by the wallet, and finality is whatever the receipt says. Nothing here
 *    predicts consensus.
 * 3. Every address, method name, and argument shape comes from
 *    `deployments/studionet.md`, which `tests/deploy/test_studionet_deployment.py`
 *    generates from the contracts themselves. This registry is data, not inference.
 */

import type { Chain } from "viem";

/** StudioNet is the gasless GenLayer development network (0 GEN expected per write). */
export const NETWORK = "studionet";
export const EXPLORER = "https://explorer-studio.genlayer.com";

export type FieldKind = "int" | "str";

export interface ChainField {
  name: string;
  kind: FieldKind;
  /** Shown under the input so the argument shape is never a guess. */
  hint?: string;
}

export interface ViewMethod {
  name: string;
  args: ChainField[];
  note: string;
}

export interface WriteMethod {
  name: string;
  args: ChainField[];
  note: string;
  /** The values the deployment record actually used, so a first run is known-good. */
  example: Record<string, string>;
}

export interface Deployment {
  id: "verdict_judge" | "web_fact_attestor" | "ranking_judge";
  label: string;
  file: string;
  pattern: string;
  address: `0x${string}`;
  /** `get_config()` counter that reveals the id a new record gets. */
  counterKey: string;
  /** The view that reads one record back after a write. */
  recordView: string;
  reads: ViewMethod[];
  writes: WriteMethod[];
}

/**
 * The three reference contracts, exactly as deployed on StudioNet.
 *
 * The example write values are the ones recorded in `deployments/studionet.md` — the
 * same titles, verdict sets, rubrics, and fact rules that already reached consensus.
 */
export const DEPLOYMENTS: Deployment[] = [
  {
    id: "verdict_judge",
    label: "VerdictJudge",
    file: "contracts/verdict_judge.py",
    pattern: "P1",
    address: "0xC4B6E69EC35A9114b43397F6bB59541bC8c5e94B",
    counterKey: "judgments_created",
    recordView: "get_judgment",
    reads: [
      { name: "get_config", args: [], note: "Limits and the counter of judgments created." },
      {
        name: "get_judgment",
        args: [{ name: "judgment_id", kind: "int" }],
        note: "One judgment: frozen verdict set, rubric, evidence, and assessment history.",
      },
      {
        name: "get_evidence",
        args: [{ name: "judgment_id", kind: "int" }],
        note: "The appended evidence references.",
      },
      {
        name: "get_assessments",
        args: [{ name: "judgment_id", kind: "int" }],
        note: "Append-only P1 assessments: verdict, band, cited ids.",
      },
    ],
    writes: [
      {
        name: "create_judgment",
        note: "Freeze a verdict set and rubric. Anyone may call it; the record never changes after.",
        args: [
          { name: "title", kind: "str", hint: "non-empty" },
          { name: "verdicts_csv", kind: "str", hint: "comma-separated allowed verdicts" },
          {
            name: "rubric_json",
            kind: "str",
            hint: "JSON array: {item_id, text, kind: DETERMINISTIC|INTERPRETIVE, rule_kind, rule_value}",
          },
        ],
        example: {
          title: "Income eligibility",
          verdicts_csv: "ELIGIBLE,INELIGIBLE",
          rubric_json:
            '[{"item_id":"hard_income","text":"Evidence must mention income.","kind":"DETERMINISTIC","rule_kind":"EVIDENCE_CONTAINS","rule_value":"income"},{"item_id":"quality","text":"Assess whether the evidence is sufficient and relevant.","kind":"INTERPRETIVE"}]',
        },
      },
    ],
  },
  {
    id: "web_fact_attestor",
    label: "WebFactAttestor",
    file: "contracts/web_fact_attestor.py",
    pattern: "P2",
    address: "0x6E720e9d701B542f0f77F52A4cD1b155225ad0FF",
    counterKey: "specs_created",
    recordView: "get_spec",
    reads: [
      { name: "get_config", args: [], note: "Limits and the counter of specs created." },
      {
        name: "get_spec",
        args: [{ name: "spec_id", kind: "int" }],
        note: "One frozen spec: the exact URL and the fixed fact rules.",
      },
      {
        name: "get_latest_attestation",
        args: [{ name: "spec_id", kind: "int" }],
        note: "The newest attestation, with source_status as a first-class state.",
      },
      {
        name: "get_attestations",
        args: [{ name: "spec_id", kind: "int" }],
        note: "The append-only attestation history for a spec.",
      },
    ],
    writes: [
      {
        name: "create_spec",
        note: "Freeze an HTTPS URL and its fact rules. Validators re-fetch that exact page.",
        args: [
          { name: "url", kind: "str", hint: "https only; loopback and private hosts are rejected" },
          {
            name: "facts_json",
            kind: "str",
            hint: "JSON array: {name, kind: BOOL_PRESENT_HEADING|BOOL_CONTAINS_PHRASE|BUCKET_WORD_COUNT|ENUM_FROM_LIST, param, edges, allowed}",
          },
        ],
        example: {
          url: "https://example.com/",
          facts_json:
            '[{"name":"has_heading","kind":"BOOL_PRESENT_HEADING","param":"Example Domain"},{"name":"mentions_documentation","kind":"BOOL_CONTAINS_PHRASE","param":"documentation examples"},{"name":"word_bucket","kind":"BUCKET_WORD_COUNT","edges":[10,100]}]',
        },
      },
    ],
  },
  {
    id: "ranking_judge",
    label: "RankingJudge",
    file: "contracts/ranking_judge.py",
    pattern: "P4",
    address: "0x6dc5764eE90dB65E7b102a0e78E7983deD92b717",
    counterKey: "records_created",
    recordView: "get_ranking",
    reads: [
      { name: "get_config", args: [], note: "Limits and the counter of rankings created." },
      {
        name: "get_ranking",
        args: [{ name: "ranking_id", kind: "int" }],
        note: "One ranking: frozen candidates, rubric, P4 parameters, evidence, history.",
      },
      {
        name: "get_evidence",
        args: [{ name: "ranking_id", kind: "int" }],
        note: "The evidence references rendered into the ranking prompt.",
      },
      {
        name: "get_rankings",
        args: [{ name: "ranking_id", kind: "int" }],
        note: "The append-only ranking history.",
      },
    ],
    writes: [
      {
        name: "create_ranking",
        note: "Freeze the candidate universe and the P4 parameters. min_overlap_pct has a floor of 1.",
        args: [
          { name: "title", kind: "str", hint: "non-empty" },
          { name: "candidates_csv", kind: "str", hint: "comma-separated candidate ids" },
          { name: "rubric_json", kind: "str", hint: "JSON array of rubric items" },
          { name: "top_k", kind: "int", hint: "1 … candidates.length" },
          { name: "min_overlap_pct", kind: "int", hint: "1 … 100" },
          { name: "max_rank_distance", kind: "int", hint: "0 = no cap" },
        ],
        example: {
          title: "Vendor ranking",
          candidates_csv: "acme,globex,initech,umbrella",
          rubric_json:
            '[{"item_id":"relevance","text":"Rank by how directly the evidence answers the question.","kind":"INTERPRETIVE","rule_kind":"NONE"},{"item_id":"freshness","text":"Prefer the more recent evidence.","kind":"INTERPRETIVE","rule_kind":"NONE"}]',
          top_k: "2",
          min_overlap_pct: "50",
          max_rank_distance: "1",
        },
      },
    ],
  },
];

export function findDeployment(id: string): Deployment {
  const found = DEPLOYMENTS.find((item) => item.id === id) ?? DEPLOYMENTS[0];
  if (!found) throw new Error("NO_DEPLOYMENT");
  return found;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

/* SDK loading ------------------------------------------------------------ */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

/** Loose client surface: only the methods this module calls, structurally typed so the
 *  screen and its tests never import SDK types. */
export interface ChainClient {
  readContract(args: {
    address: `0x${string}`;
    functionName: string;
    args?: unknown[];
  }): Promise<unknown>;
  writeContract(args: {
    address: `0x${string}`;
    functionName: string;
    args?: unknown[];
    value: bigint;
  }): Promise<`0x${string}`>;
  getTransaction(args: { hash: string }): Promise<{ statusName?: string }>;
  waitForTransactionReceipt(args: {
    hash: string;
    status?: string;
    interval?: number;
    retries?: number;
  }): Promise<{
    statusName?: string;
    numOfRounds?: string | number;
    txExecutionResultName?: string;
    lastRound?: { validatorVotesName?: string[] };
  }>;
  connect(network?: string): Promise<void>;
}

interface Sdk {
  createClient(config: {
    chain?: Chain;
    account?: `0x${string}`;
    provider?: Eip1193Provider;
  }): ChainClient;
}

interface SdkTypes {
  studionet: Chain;
  TransactionStatus: { FINALIZED: string };
}

let sdkPromise: Promise<{ sdk: Sdk; types: SdkTypes }> | null = null;

/**
 * Load the SDK once. The import is dynamic so the initial bundle stays small and the
 * rest of the site keeps working if the chunk never arrives.
 */
export function loadSdk(): Promise<{ sdk: Sdk; types: SdkTypes }> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const [sdkMod, chainMod, typeMod] = await Promise.all([
        import("genlayer-js"),
        import("genlayer-js/chains"),
        import("genlayer-js/types"),
      ]);
      return {
        sdk: sdkMod as unknown as Sdk,
        types: {
          studionet: chainMod.studionet,
          TransactionStatus: typeMod.TransactionStatus,
        },
      };
    })();
  }
  return sdkPromise;
}

let readClient: ChainClient | null = null;

/** The read client: no wallet, no account, free calls. */
export async function getReadClient(): Promise<ChainClient> {
  if (readClient) return readClient;
  const { sdk, types } = await loadSdk();
  readClient = sdk.createClient({ chain: types.studionet });
  return readClient;
}

/* Reads ------------------------------------------------------------------ */

/**
 * Call a view method and return its JSON value.
 *
 * The reference contracts return JSON strings, which is also what the CLI and the
 * Python tests consume. A value that is not JSON is returned as the raw string rather
 * than dropped.
 */
export async function readView(
  deployment: Deployment,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const client = await getReadClient();
  const raw = await client.readContract({
    address: deployment.address,
    functionName: method,
    args,
  });
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Read `get_config()` and return the counter that names the next record. */
export async function readNextId(deployment: Deployment): Promise<number> {
  const config = (await readView(deployment, "get_config", [])) as Record<string, unknown>;
  const value = config?.[deployment.counterKey];
  return typeof value === "number" ? value : 0;
}

/* Wallet ----------------------------------------------------------------- */

export type WalletStatus =
  | "no-provider"
  | "disconnected"
  | "connecting"
  | "wrong-network"
  | "connected";

export interface WalletState {
  status: WalletStatus;
  address?: string;
}

export function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected ?? null;
}

/**
 * Ask the wallet for an account, then make sure it is on StudioNet.
 *
 * `client.connect` adds the network if the wallet has never seen it, which is why it is
 * preferred over a hand-rolled `wallet_switchEthereumChain`: the chain definition comes
 * from the SDK rather than a copy of it in this repo.
 */
export async function connectWallet(): Promise<WalletState> {
  const injected = getEthereum();
  if (!injected) return { status: "no-provider" };
  const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) return { status: "disconnected" };

  const client = await getReadClient();
  try {
    await client.connect(NETWORK);
  } catch {
    // The wallet refused to switch or add the network. Reads still work; writes don't.
    return { status: "wrong-network", address };
  }
  return { status: "connected", address };
}

/* Writes and the transaction lifecycle ------------------------------------ */

export type TxPhase =
  | "idle"
  | "signing"
  | "submitted"
  | "tracking"
  | "finalized"
  | "failed";

export interface TxState {
  phase: TxPhase;
  /** The hash once the wallet has signed and the network has taken the transaction. */
  hash?: string;
  /** The consensus status as it moves: PENDING, PROPOSING, COMMITTING, REVEALING, … */
  statusName?: string;
  /** The final receipt: validator votes, execution result, round count. */
  votes?: string[];
  executionResult?: string;
  rounds?: string;
  error?: string;
  /** The id the new record got, and the record read back after finality. */
  recordId?: number;
  readBack?: unknown;
}

const POLL_INTERVAL_MS = 4_000;
const FINALITY_RETRIES = 120;

/**
 * Submit a create-style write and follow it all the way to a readable record:
 * signing (the wallet popup), the transaction hash, the live consensus status while
 * validators vote, the final receipt, and finally a view call that reads the new
 * record back.
 *
 * A transaction can finalize and still have a failed execution, so
 * `executionResult` is reported separately from finality — that distinction is what
 * makes a failing `evaluate` debuggable from the UI.
 *
 * The new record's id comes from the `get_config()` counter read *before* the write
 * lands, which is how the deployment tests find it too.
 */
export async function submitRecordWrite(
  deployment: Deployment,
  method: string,
  args: unknown[],
  onState: (state: TxState) => void,
): Promise<TxState> {
  const state: TxState = { phase: "signing" };
  onState({ ...state });

  let nextId: number | undefined;
  try {
    nextId = await readNextId(deployment);
  } catch {
    // A failed counter read is not fatal: the write still submits; the read-back is skipped.
  }

  try {
    const client = await getWriteClient();
    const hash = await client.writeContract({
      address: deployment.address,
      functionName: method,
      args,
      value: 0n,
    });
    state.phase = "submitted";
    state.hash = hash;
    state.statusName = "SUBMITTED";
    onState({ ...state });
  } catch (error) {
    state.phase = "failed";
    state.error = describeError(error, "The wallet declined or the node refused the transaction.");
    onState({ ...state });
    return state;
  }

  return followToFinality(state, deployment, nextId, onState);
}

let writeClient: ChainClient | null = null;

async function getWriteClient(): Promise<ChainClient> {
  if (writeClient) return writeClient;
  const injected = getEthereum();
  if (!injected) throw new Error("NO_WALLET");
  const accounts = (await injected.request({ method: "eth_accounts" })) as string[];
  const address = accounts?.[0];
  const { sdk, types } = await loadSdk();
  writeClient = sdk.createClient({
    chain: types.studionet,
    account: address as `0x${string}` | undefined,
    provider: injected,
  });
  return writeClient;
}

/** Poll the transaction's consensus status, wait for finality, read the record back. */
async function followToFinality(
  state: TxState,
  deployment: Deployment,
  nextId: number | undefined,
  onState: (state: TxState) => void,
): Promise<TxState> {
  const client = await getReadClient();
  const { types } = await loadSdk();
  const hash = state.hash as string;

  const seen = new Set<string>();
  const poll = async () => {
    try {
      const tx = await client.getTransaction({ hash });
      const status = tx?.statusName;
      if (status && !seen.has(status)) {
        seen.add(status);
        state.phase = "tracking";
        state.statusName = status;
        onState({ ...state });
      }
    } catch {
      // A transient poll failure is not a transaction failure; the receipt decides.
    }
  };

  await poll();
  const poller = setInterval(() => void poll(), POLL_INTERVAL_MS);
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: types.TransactionStatus.FINALIZED,
      interval: POLL_INTERVAL_MS,
      retries: FINALITY_RETRIES,
    });
    state.phase = "finalized";
    state.statusName = receipt?.statusName ?? "FINALIZED";
    state.votes = receipt?.lastRound?.validatorVotesName;
    state.executionResult = receipt?.txExecutionResultName;
    state.rounds = receipt?.numOfRounds !== undefined ? String(receipt.numOfRounds) : undefined;
    onState({ ...state });

    if (nextId !== undefined) {
      state.recordId = nextId;
      try {
        state.readBack = await readView(deployment, deployment.recordView, [nextId]);
      } catch {
        // The read-back is proof, not the transaction itself; a failure here never
        // re-labels a finalized write as failed.
      }
      onState({ ...state });
    }
    return state;
  } catch (error) {
    state.phase = "failed";
    state.error = describeError(error, "The transaction did not finalize in time.");
    onState({ ...state });
    return state;
  } finally {
    clearInterval(poller);
  }
}

/**
 * A short, non-technical error line. Wallet and node errors arrive as strings, numbers,
 * or objects depending on the provider; none of them belong verbatim in the UI.
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === "NO_WALLET") {
    return "No browser wallet was found. Install one to write; reads work without it.";
  }
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "";
  if (!text.trim()) return fallback;
  const line = firstLine(text);
  // The SDK throws a clear message naming the expected and actual chains; keep it, but
  // always lead with the reason this UI can act on.
  if (/chain/i.test(line)) return `${fallback} (${line})`;
  return line;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? text;
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}
