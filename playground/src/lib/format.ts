/**
 * Formatting helpers.
 *
 * Integers are shown as integers. A tolerance is never rendered as a rounded float, because
 * that would hide the comparison the validators actually perform.
 */

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "");
}

/** Bytes as a short human string, for the editor size counter. */
export function formatBytes(length: number): string {
  if (length < 1024) return `${length} characters`;
  return `${(length / 1024).toFixed(1)} KiB`;
}

/** Human label for a comparison verdict. */
export function verdictLabel(ok: boolean): string {
  return ok ? "Accepted" : "Rejected";
}

/** Icon shape, so state is never carried by colour alone. */
export function verdictIcon(ok: boolean): string {
  return ok ? "✓" : "✕";
}

export type CaseCategory = "MUST_ACCEPT" | "MUST_REJECT" | "BOUNDARY";

export function categoryLabel(category: CaseCategory): string {
  switch (category) {
    case "MUST_ACCEPT":
      return "Must accept";
    case "MUST_REJECT":
      return "Must reject";
    case "BOUNDARY":
      return "On the edge";
  }
}

export function categoryIcon(category: CaseCategory): string {
  switch (category) {
    case "MUST_ACCEPT":
      return "✓";
    case "MUST_REJECT":
      return "✕";
    case "BOUNDARY":
      return "◆";
  }
}

/** Pretty-print JSON for the editors, keeping key order stable. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** JSON.parse with a friendly error message for the editor. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Stable, readable summary of a value, used in chips and rows. */
export function summarize(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return `{${Object.keys(value).length}}`;
  return String(value);
}
