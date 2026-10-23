import type { ReactNode } from "react";

export type VerdictKind = "accept" | "reject" | "boundary";

/**
 * A verdict chip. State is never colour alone: every chip carries an icon shape and a
 * word, so it reads correctly in greyscale and to a screen reader.
 */
export function VerdictChip({
  kind,
  label,
  children,
}: {
  kind: VerdictKind;
  label: string;
  children?: ReactNode;
}) {
  const icon = kind === "accept" ? "✓" : kind === "reject" ? "✕" : "◆";
  return (
    <span className={`chip chip-${kind}`} data-kind={kind}>
      <span className="chip-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="chip-label">{label}</span>
      {children ? <span className="chip-extra">{children}</span> : null}
    </span>
  );
}
