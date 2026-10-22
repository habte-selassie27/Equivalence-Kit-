/** Standing lines. The same copy everywhere, so the honesty message never drifts. */
export const HONESTY_LINE =
  "These rules show how validators agree. They do not check whether content is true.";
export const NOT_COMPARED_LINE =
  "Digests and free text are stored for people to read. Consensus ignores them.";
export const INTEGERS_LINE =
  "Tolerances use whole numbers so every validator computes the same comparison.";
export const BOUNDARY_LINE =
  "On the edge: this case sits exactly at the tolerance limit.";

export function LimitsNote({ line }: { line: string }) {
  return <p className="honesty">{line}</p>;
}
