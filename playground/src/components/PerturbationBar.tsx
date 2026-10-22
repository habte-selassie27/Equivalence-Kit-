/**
 * The tightness bars.
 *
 * Every bar carries a number and an icon, so the rate reads without relying on the bar
 * length or on colour. `goodWord` names what a passed case is ("accepted" for harmless
 * rows, "rejected" for harmful ones), so a harmful bar can never say it accepted
 * something it should have stopped.
 */
export function PerturbationBar({
  label,
  accepted,
  rejected,
  total,
  goodWord = "accepted",
  badWord = "rejected",
  onEdge = false,
}: {
  label: string;
  accepted: number;
  rejected: number;
  total: number;
  /** What a passing case was — reuses the accepted counter's meaning. */
  goodWord?: string;
  badWord?: string;
  onEdge?: boolean;
}) {
  const percent = total === 0 ? 0 : Math.round((accepted / total) * 100);

  return (
    <div className="perturbation-bar" data-on-edge={onEdge ? "true" : "false"}>
      <div className="bar-head">
        <span className="bar-label">{label}</span>
        <span className="bar-value">
          <span aria-hidden="true">✓</span> {accepted}/{total}
        </span>
      </div>
      <div
        className="bar-track"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${accepted} of ${total}`}
      >
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="small muted bar-note">
        <span aria-hidden="true">✓</span> {accepted} {goodWord},{" "}
        <span aria-hidden="true">✕</span> {rejected} {badWord}
      </p>
    </div>
  );
}
