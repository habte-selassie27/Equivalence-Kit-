import { describe, expect, it } from "vitest";
import { buildShareLink, decodeState, encodeState } from "./urlState";
import { buildTrackSpec, describeField, isOnEdge } from "./tracks";
import { parseJson } from "./format";

describe("urlState", () => {
  const state = {
    patternId: "P1" as const,
    caseId: "P1-A01",
    leader: '{"verdict":"ELIGIBLE"}',
    validator: '{"verdict":"eligible"}',
  };

  it("round trips a shareable state", () => {
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
  });

  it("returns null for unreadable state instead of throwing", () => {
    expect(decodeState("not-encoded")).toBeNull();
    expect(decodeState("")).toBeNull();
  });

  it("refuses to build a link over the cap", () => {
    const huge = {
      ...state,
      leader: "x".repeat(9000),
      validator: "y".repeat(9000),
    };
    expect(buildShareLink(huge)).toBeNull();
  });
});

describe("tracks", () => {
  it("builds an ordinal track for the P1 band with the allowed steps", () => {
    const spec = buildTrackSpec(
      "P1",
      "band",
      { band: "MEDIUM" },
      { band: "HIGH" },
      { max_band_steps: 1 },
    );

    expect(spec?.kind).toBe("ordinal");
    if (spec?.kind === "ordinal") {
      expect(spec.maxSteps).toBe(1);
    }
  });

  it("builds a set track for cited ids against the provided universe", () => {
    const spec = buildTrackSpec(
      "P1",
      "cited_ids",
      { cited_ids: ["a", "b"] },
      { cited_ids: ["b", "a"] },
      { provided_ids: ["a", "b"] },
    );

    expect(spec?.kind).toBe("set");
    if (spec?.kind === "set") {
      expect(spec.universe).toEqual(["a", "b"]);
    }
  });

  it("returns no track for an invariant row", () => {
    expect(
      buildTrackSpec("P1", "consistent_with", {}, {}, {}),
    ).toBeNull();
  });

  it("marks a one-step band difference as on the edge", () => {
    const spec = buildTrackSpec(
      "P1",
      "band",
      { band: "LOW" },
      { band: "MEDIUM" },
      { max_band_steps: 1 },
    );
    expect(spec).not.toBeNull();
    if (spec) {
      expect(isOnEdge(spec, {}, {})).toBe(true);
    }
  });

  it("describes a set mismatch in plain language", () => {
    const spec = buildTrackSpec(
      "P1",
      "cited_ids",
      { cited_ids: ["a"] },
      { cited_ids: ["a", "b"] },
      { provided_ids: ["a", "b"] },
    );
    const result = describeField(spec, {}, {}, false);
    expect(result.summary).toContain("only the validator has");
  });

  it("describes a numeric tolerance as whole numbers", () => {
    const spec = buildTrackSpec(
      "P3",
      "value",
      { value: 100 },
      { value: 101 },
      { min: 0, max: 200, tolerance_bps: 100 },
    );
    const result = describeField(spec, {}, {}, true);
    expect(result.summary).toContain("within 100 basis points");
    expect(result.summary).toContain("Leader 100");
    expect(result.summary).toContain("validator 101");
  });
});

describe("format", () => {
  it("reports invalid JSON without throwing", () => {
    expect(parseJson("{nope").ok).toBe(false);
    expect(parseJson('{"a":1}').ok).toBe(true);
  });
});
