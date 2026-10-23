/**
 * Plain-language rendering of comparator parameters.
 *
 * The parameters come straight from the generated data; only the phrasing lives here.
 * UI.md 7.3: parameters are shown in plain terms ("numbers: within 50 bps") with the
 * exact function names visible elsewhere. Integers stay integers.
 */

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function joinWords(values: unknown[]): string {
  if (values.length === 0) return "none";
  return values.join(", ");
}

function numberWord(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
}

/** True when the value is a list of scalars (an option list), not shaped data. */
function isOptionList(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item !== "object" || item === null)
  );
}

/** A fact rule inside a P2 `rules` dictionary, in plain words. */
function factRulePhrase(rule: unknown): string {
  const dict = asDict(rule);
  switch (dict.kind) {
    case "bool":
      return "yes/no must match";
    case "enum":
      return isOptionList(dict.allowed)
        ? `label must match (${dict.allowed.join(" or ")})`
        : "label must match";
    case "int_abs":
      return dict.delta !== undefined
        ? `within ±${numberWord(dict.delta)}`
        : "within an absolute tolerance";
    case "bucket":
      return isOptionList(dict.edges)
        ? `same or adjacent bucket (edges ${dict.edges.join(", ")})`
        : "same or adjacent bucket";
    default:
      return "must match by its rule";
  }
}

/** Phrase one parameter value. */
export function paramPhrase(key: string, value: unknown): string {
  switch (key) {
    case "verdict_set":
      return isOptionList(value)
        ? `allowed verdict labels: ${joinWords(value)}`
        : "allowed verdict labels";
    case "provided_ids":
      return isOptionList(value)
        ? `id universe supplied by the contract: ${joinWords(value)}`
        : "id universe supplied by the contract";
    case "candidates":
      return isOptionList(value)
        ? `candidate universe: ${joinWords(value)}`
        : "candidate universe";
    case "unit_set":
      return isOptionList(value)
        ? `allowed units: ${joinWords(value)}`
        : "allowed units";
    case "evidence_ids":
      return isOptionList(value)
        ? `evidence universe: ${joinWords(value)}`
        : "evidence universe";
    case "max_band_steps":
      return `band may differ by at most ${numberWord(value)} step${value === 1 ? "" : "s"}`;
    case "tolerance_bps":
      return isOptionList(value)
        ? `within ${value.join(" or ")} basis points`
        : `within ${numberWord(value)} basis points`;
    case "delta":
      return isOptionList(value)
        ? `within ±${value.join(" or ±")} of the leader value`
        : `within ±${numberWord(value)} of the leader value`;
    case "min":
      return `value must be at least ${numberWord(value)}`;
    case "max":
      return `value must be at most ${numberWord(value)}`;
    case "k":
      return `top ${numberWord(value)} of the ranking decides`;
    case "max_rank_distance":
      return isOptionList(value)
        ? `ranks may differ by up to ${value.join(" or ")}`
        : `ranks may differ by up to ${numberWord(value)}`;
    case "min_overlap_pct":
    case "threshold_pct":
      return isOptionList(value)
        ? `overlap must be at least ${value.join("% or ")}%`
        : `overlap must be at least ${numberWord(value)}%`;
    case "mode":
      return isOptionList(value)
        ? `comparison mode: ${value.join(" or ")}`
        : `comparison mode: ${String(value)}`;
    case "edges":
      if (Array.isArray(value) && value.every((item) => Array.isArray(item))) {
        return `bucket edges: ${value.map((edge) => (edge as number[]).join("/")).join(" or ")}`;
      }
      return isOptionList(value)
        ? `bucket edges at ${joinWords(value)}`
        : "bucket edges";
    case "allow_unavailable":
      return `UNAVAILABLE is an allowed state: ${value === true ? "yes" : "no"}`;
    case "deterministic_checks": {
      const keys = Object.keys(asDict(value));
      return keys.length > 0
        ? `checks decided in code: ${keys.join(", ")}`
        : "no deterministic checks";
    }
    case "forbidden": {
      const dict = asDict(value);
      const verdicts = Object.entries(dict).flatMap(([check, labels]) =>
        Array.isArray(labels)
          ? labels.map((label) => `${label} (after a failed ${check})`)
          : [],
      );
      return verdicts.length > 0
        ? `forbidden verdicts on code failure: ${verdicts.join(", ")}`
        : "no forbidden verdicts";
    }
    case "rules": {
      const dict = asDict(value);
      const parts = Object.entries(dict).map(
        ([name, rule]) => `${name}: ${factRulePhrase(rule)}`,
      );
      return parts.length > 0 ? `per-fact rules — ${parts.join("; ")}` : "no fact rules";
    }
    default:
      return typeof value === "object" && value !== null
        ? `${key}: ${JSON.stringify(value)}`
        : `${key}: ${String(value)}`;
  }
}

export interface ParamRow {
  /** The parameter key as the package spells it. */
  key: string;
  /** Human name for the row label. */
  label: string;
  phrase: string;
  /** Parameter values the acceptance matrix exercises beyond the canonical one. */
  variants?: string[];
}

/** Build the parameter rows for a pattern, with per-case variance called out. */
export function paramRows(
  params: Record<string, unknown>,
  variants?: Record<string, unknown[]>,
): ParamRow[] {
  return Object.entries(params).map(([key, value]) => {
    const keyVariants = variants?.[key];
    const hasVariance = Array.isArray(keyVariants) && keyVariants.length > 1;

    return {
      key,
      label: key.replace(/_/g, " "),
      phrase: paramPhrase(key, value),
      variants: hasVariance
        ? keyVariants.map((item) => paramPhrase(key, item)).map((text) => {
            // Strip the shared "key: " prefix so the variant list stays compact.
            const colon = text.indexOf(":");
            return colon > -1 && colon < text.length - 1
              ? text.slice(colon + 1).trim()
              : text;
          })
        : undefined,
    };
  });
}
