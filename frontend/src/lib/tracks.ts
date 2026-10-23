import type { TrackSpec, TrackResult } from "../components/ToleranceTrack";
import { formatInteger } from "./format";
import type { PatternId } from "../worker/protocol";

const BANDS = ["LOW", "MEDIUM", "HIGH"];
const SOURCE_STATES = ["OK", "UNAVAILABLE"];

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringList(value: unknown): string[] {
  return asList(value).map((item) => String(item));
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringAt(source: Dict, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : String(value ?? "");
}

/**
 * Build the tolerance track for one field of a pattern.
 *
 * Returns null when the field has no meaningful spatial representation — an invariant
 * row, for example, is a rule, not a position.
 */
export function buildTrackSpec(
  patternId: PatternId,
  fieldName: string,
  leader: unknown,
  validator: unknown,
  context: unknown,
): TrackSpec | null {
  const left = asDict(leader);
  const right = asDict(validator);
  const ctx = asDict(context);

  switch (patternId) {
    case "P1":
      if (fieldName === "verdict") {
        const levels = asStringList(ctx.verdict_set);
        return {
          kind: "enum",
          levels: levels.length > 0 ? levels : ["ELIGIBLE", "INELIGIBLE"],
          leader: stringAt(left, "verdict"),
          validator: stringAt(right, "verdict"),
        };
      }
      if (fieldName === "band") {
        return {
          kind: "ordinal",
          levels: BANDS,
          leader: stringAt(left, "band"),
          validator: stringAt(right, "band"),
          maxSteps: typeof ctx.max_band_steps === "number" ? ctx.max_band_steps : 1,
        };
      }
      if (fieldName === "cited_ids") {
        return {
          kind: "set",
          leader: asStringList(left.cited_ids),
          validator: asStringList(right.cited_ids),
          universe: asStringList(ctx.provided_ids),
        };
      }
      return null;

    case "P2":
      if (fieldName === "source_status") {
        return {
          kind: "enum",
          levels: SOURCE_STATES,
          leader: stringAt(left, "source_status"),
          validator: stringAt(right, "source_status"),
        };
      }
      if (fieldName === "facts") {
        const leftFacts = asDict(left.facts);
        const rightFacts = asDict(right.facts);
        const names = Array.from(new Set([...Object.keys(leftFacts), ...Object.keys(rightFacts)]));
        return {
          kind: "set",
          leader: names.filter((name) => name in leftFacts),
          validator: names.filter((name) => name in rightFacts),
          universe: names,
        };
      }
      return null;

    case "P3":
      if (fieldName === "unit") {
        const units = asStringList(ctx.unit_set);
        return {
          kind: "enum",
          levels: units.length > 0 ? units : ["UNIT"],
          leader: stringAt(left, "unit"),
          validator: stringAt(right, "unit"),
        };
      }
      if (fieldName === "value") {
        const min = typeof ctx.min === "number" ? ctx.min : 0;
        const max = typeof ctx.max === "number" ? ctx.max : 100;
        const spec: TrackSpec = {
          kind: "number",
          leader: asNumber(left.value),
          validator: asNumber(right.value),
          min,
          max,
        };
        if (typeof ctx.delta === "number") {
          spec.delta = ctx.delta;
        }
        if (typeof ctx.tolerance_bps === "number") {
          spec.toleranceBps = ctx.tolerance_bps;
        }
        return spec;
      }
      return null;

    case "P4":
      if (fieldName === "ranking") {
        return {
          kind: "ranking",
          leader: asStringList(left.ranking),
          validator: asStringList(right.ranking),
          k: typeof ctx.k === "number" ? ctx.k : 3,
          universe: asStringList(ctx.candidates),
        };
      }
      return null;

    case "P5":
      if (fieldName === "entities") {
        const names = Array.from(
          new Set([
            ...asStringList(left.entities),
            ...asStringList(right.entities),
          ]),
        );
        return {
          kind: "set",
          leader: asStringList(left.entities),
          validator: asStringList(right.entities),
          universe: names,
        };
      }
      return null;

    case "P6":
      if (fieldName === "source_status") {
        return {
          kind: "enum",
          levels: SOURCE_STATES,
          leader: stringAt(left, "source_status"),
          validator: stringAt(right, "source_status"),
        };
      }
      if (fieldName === "answer") {
        const toBool = (value: unknown): boolean | "UNAVAILABLE" =>
          typeof value === "boolean" ? value : "UNAVAILABLE";
        return {
          kind: "boolean",
          leader: toBool(left.answer),
          validator: toBool(right.answer),
        };
      }
      if (fieldName === "evidence_ids") {
        return {
          kind: "set",
          leader: asStringList(left.evidence_ids),
          validator: asStringList(right.evidence_ids),
          universe: asStringList(ctx.evidence_ids),
        };
      }
      return null;
  }
}

/**
 * Describe a field in plain language and note whether the pair sits exactly on a
 * tolerance edge.
 */
export function describeField(
  spec: TrackSpec | null,
  leader: unknown,
  validator: unknown,
  ok: boolean,
): TrackResult {
  if (!spec) {
    return {
      accepted: ok,
      onEdge: false,
      summary: "This field is a rule, not a position on a scale.",
    };
  }

  const onEdge = isOnEdge(spec, leader, validator);

  switch (spec.kind) {
    case "enum":
      return {
        accepted: ok,
        onEdge,
        summary: `Leader ${spec.leader}, validator ${spec.validator}. Accepted only when the labels match.`,
      };
    case "ordinal": {
      const distance = Math.abs(spec.levels.indexOf(spec.leader) - spec.levels.indexOf(spec.validator));
      return {
        accepted: ok,
        onEdge,
        summary: `Leader ${spec.leader}, validator ${spec.validator}, allowed distance ${spec.maxSteps} step${spec.maxSteps === 1 ? "" : "s"}. They are ${distance} step${distance === 1 ? "" : "s"} apart.`,
      };
    }
    case "number": {
      const band =
        spec.delta !== undefined
          ? `${formatInteger(spec.leader - spec.delta)} to ${formatInteger(spec.leader + spec.delta)}`
          : spec.toleranceBps !== undefined
            ? `within ${spec.toleranceBps} basis points`
            : "no tolerance band";
      return {
        accepted: ok,
        onEdge,
        summary: `Leader ${formatInteger(spec.leader)}, validator ${formatInteger(spec.validator)}, allowed ${band}.`,
      };
    }
    case "bucket": {
      const leaderSegment = Math.min(spec.leader, spec.edges.length);
      const validatorSegment = Math.min(spec.validator, spec.edges.length);
      return {
        accepted: ok,
        onEdge,
        summary: `Leader in bucket ${leaderSegment}, validator in bucket ${validatorSegment}. Adjacent buckets are accepted.`,
      };
    }
    case "set": {
      const missing = spec.leader.filter((id) => !spec.validator.includes(id));
      const extra = spec.validator.filter((id) => !spec.leader.includes(id));
      const outside = spec.universe.length
        ? [...spec.leader, ...spec.validator].filter((id) => !spec.universe.includes(id))
        : [];
      const parts: string[] = [];
      if (missing.length) parts.push(`missing from the validator: ${missing.join(", ")}`);
      if (extra.length) parts.push(`only the validator has: ${extra.join(", ")}`);
      if (outside.length) parts.push(`not in the provided universe: ${outside.join(", ")}`);
      return {
        accepted: ok,
        onEdge,
        summary: parts.length
          ? `Leader ${spec.leader.join(", ") || "none"}; validator ${spec.validator.join(", ") || "none"}. ${parts.join(". ")}.`
          : `Leader and validator both list ${spec.leader.join(", ") || "nothing"}.`,
      };
    }
    case "ranking": {
      const leaderTop = spec.leader.slice(0, spec.k);
      const validatorTop = spec.validator.slice(0, spec.k);
      const shared = leaderTop.filter((id) => validatorTop.includes(id));
      return {
        accepted: ok,
        onEdge,
        summary: `Top ${spec.k}: leader ${leaderTop.join(", ") || "none"}, validator ${validatorTop.join(", ") || "none"}. They share ${shared.length}.`,
      };
    }
    case "boolean": {
      const label = (value: boolean | "UNAVAILABLE") =>
        value === "UNAVAILABLE" ? "source unavailable" : value ? "yes" : "no";
      return {
        accepted: ok,
        onEdge,
        summary: `Leader says ${label(spec.leader)}, validator says ${label(spec.validator)}.`,
      };
    }
  }
}

/** True when the pair sits exactly on the tolerance limit. */
export function isOnEdge(spec: TrackSpec, leader: unknown, validator: unknown): boolean {
  void leader;
  void validator;
  switch (spec.kind) {
    case "ordinal": {
      const distance = Math.abs(spec.levels.indexOf(spec.leader) - spec.levels.indexOf(spec.validator));
      return distance === spec.maxSteps;
    }
    case "number": {
      if (spec.delta !== undefined) {
        return Math.abs(spec.validator - spec.leader) === spec.delta;
      }
      if (spec.toleranceBps !== undefined) {
        const scale = Math.max(Math.abs(spec.leader), Math.abs(spec.validator), 1);
        const allowance = (spec.toleranceBps * scale) / 10000;
        return Math.abs(spec.validator - spec.leader) >= allowance;
      }
      return false;
    }
    case "bucket": {
      const leaderSegment = Math.min(spec.leader, spec.edges.length);
      const validatorSegment = Math.min(spec.validator, spec.edges.length);
      return Math.abs(leaderSegment - validatorSegment) === 1;
    }
    default:
      return false;
  }
}
