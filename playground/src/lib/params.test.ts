import { describe, expect, it } from "vitest";
import { paramPhrase, paramRows } from "./params";

describe("paramPhrase", () => {
  it("phrases tolerance parameters as integers with units", () => {
    expect(paramPhrase("tolerance_bps", 100)).toBe("within 100 basis points");
    expect(paramPhrase("tolerance_bps", [100, 10000])).toBe(
      "within 100 or 10000 basis points",
    );
    expect(paramPhrase("delta", 5)).toBe("within ±5 of the leader value");
    expect(paramPhrase("max_rank_distance", [0, 1])).toBe(
      "ranks may differ by up to 0 or 1",
    );
  });

  it("phrases id universes and thresholds", () => {
    expect(paramPhrase("provided_ids", ["a", "b"])).toBe(
      "id universe supplied by the contract: a, b",
    );
    expect(paramPhrase("threshold_pct", 66)).toBe("overlap must be at least 66%");
    expect(paramPhrase("k", 3)).toBe("top 3 of the ranking decides");
    expect(paramPhrase("edges", [300, 1000])).toBe("bucket edges at 300, 1000");
  });

  it("phrases P1 invariants that decide in code", () => {
    expect(paramPhrase("forbidden", { check_hard: ["ELIGIBLE"] })).toBe(
      "forbidden verdicts on code failure: ELIGIBLE (after a failed check_hard)",
    );
    expect(paramPhrase("deterministic_checks", { check_hard: true })).toBe(
      "checks decided in code: check_hard",
    );
  });

  it("phrases P2 fact rules per fact", () => {
    expect(
      paramPhrase("rules", {
        has_pricing: { kind: "bool" },
        plan: { kind: "enum", allowed: ["FREE", "PRO"] },
        heading_count: { kind: "int_abs", delta: 1 },
        word_bucket: { kind: "bucket", edges: [300, 1000] },
      }),
    ).toBe(
      "per-fact rules — has_pricing: yes/no must match; plan: label must match (FREE or PRO); " +
        "heading_count: within ±1; word_bucket: same or adjacent bucket (edges 300, 1000)",
    );
  });
});

describe("paramRows", () => {
  it("marks parameters the matrix exercises with more than one value", () => {
    const rows = paramRows(
      { tolerance_bps: 100, provided_ids: ["a"] },
      {
        tolerance_bps: [100, 10000],
        provided_ids: [["a"]],
      },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.key).toBe("tolerance_bps");
    expect(rows[0]?.variants).toEqual(["within 100 basis points", "within 10000 basis points"]);
    // A single exercised value is not called out as variance.
    expect(rows[1]?.variants).toBeUndefined();
  });
});
