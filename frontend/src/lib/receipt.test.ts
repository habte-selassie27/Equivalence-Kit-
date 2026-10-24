/**
 * `summarizeReceipt` is the one place the UI decodes a receipt, and the SDK's runtime
 * shape does not match its own TypeScript declarations: the declarations are camelCase
 * (`statusName`, `numOfRounds`, `lastRound.validatorVotesName`) while the StudioNet RPC
 * returns snake_case. That mismatch shipped a screen showing "Execution result: unknown"
 * and no vote chips on a real finalized transaction, so these fixtures are transcribed
 * from a measured receipt (transaction 0x3b29…1891, VerdictJudge, 2026-10-23) rather
 * than from the type declarations.
 */
import { describe, expect, it } from "vitest";

import { summarizeReceipt, type ReceiptLike } from "./genlayer";

/**
 * The real receipt carries more keys than the decoder reads; keep them visible so the
 * fixture stays a faithful copy of what the network returned.
 */
type MeasuredReceipt = ReceiptLike &
  Record<string, unknown> & {
    last_round?: Record<string, unknown> & NonNullable<ReceiptLike["last_round"]>;
    consensus_data?: Record<string, unknown> & {
      votes?: Record<string, string>;
      leader_receipt?: (
        & Record<string, unknown>
        & { result?: Record<string, unknown> & { status?: string } }
      )[];
    };
  };

/**
 * Fields the SDK actually returned, trimmed to the ones this decoder reads. The extra
 * keys (`status`, `result`, `validator_votes`, `payload`) are kept because the real
 * receipt carries them, even though this decoder ignores them.
 */
const MEASURED: MeasuredReceipt = {
  status: 7,
  result: 6,
  status_name: "FINALIZED",
  result_name: "MAJORITY_AGREE",
  num_of_rounds: 1,
  last_round: {
    round: "0",
    result: 6,
    validator_votes: [1, 1, 5, 1, 5],
    validator_votes_name: ["AGREE", "AGREE", "NOT_VOTED", "AGREE", "NOT_VOTED"],
  },
  consensus_data: {
    votes: {
      "0xCB87CEDC1F42B73c5AC5B8A714C913310c7b4598": "idle",
      "0xFf18B875978c1Af9286D7da89599f3231097A47e": "agree",
      "0xdc2165072a47BFc23A1B5d9efC2908D0f4C47C96": "agree",
    },
    leader_receipt: [{ result: { status: "return", payload: { readable: "1" } } }],
  },
};

describe("summarizeReceipt", () => {
  it("reads the snake_case shape the StudioNet RPC returns", () => {
    const summary = summarizeReceipt(MEASURED);
    expect(summary.status).toBe("FINALIZED");
    expect(summary.consensusResult).toBe("MAJORITY_AGREE");
    expect(summary.execution).toBe("FINISHED_WITH_RETURN");
    expect(summary.rounds).toBe("1");
    expect(summary.votes).toEqual(["AGREE", "AGREE", "NOT_VOTED", "AGREE", "NOT_VOTED"]);
  });

  it("also reads the camelCase shape the type declarations promise", () => {
    const summary = summarizeReceipt({
      statusName: "FINALIZED",
      txExecutionResultName: "MAJORITY_AGREE",
      numOfRounds: 2,
      lastRound: { validatorVotesName: ["AGREE", "DISAGREE"] },
    });
    expect(summary.status).toBe("FINALIZED");
    expect(summary.consensusResult).toBe("MAJORITY_AGREE");
    expect(summary.rounds).toBe("2");
    expect(summary.votes).toEqual(["AGREE", "DISAGREE"]);
  });

  it("falls back to the consensus vote map when the round block is missing", () => {
    const summary = summarizeReceipt({
      status_name: "FINALIZED",
      result_name: "MAJORITY_DISAGREE",
      consensus_data: {
        votes: { "0xabc": "agree", "0xdef": "disagree" },
        leader_receipt: [],
      },
    });
    expect(summary.votes).toEqual(["AGREE", "DISAGREE"]);
  });

  it("keeps consensus and execution separate when the leader VM errored", () => {
    const errored: MeasuredReceipt["consensus_data"] = {
      votes: MEASURED.consensus_data?.votes,
      leader_receipt: [{ result: { status: "error" } }],
    };
    const summary = summarizeReceipt({ ...MEASURED, consensus_data: errored });
    // Accepted by consensus, failed in execution — the panel must say both.
    expect(summary.consensusResult).toBe("MAJORITY_AGREE");
    expect(summary.execution).toBe("FINISHED_WITH_ERROR");
  });

  it("reports nothing rather than inventing values on an empty receipt", () => {
    expect(summarizeReceipt(undefined)).toEqual({});
    expect(summarizeReceipt({})).toEqual({});
  });
});
