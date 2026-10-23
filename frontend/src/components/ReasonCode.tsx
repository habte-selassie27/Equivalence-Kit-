import { useState } from "react";

/**
 * A stable reason code from the package's error registry.
 *
 * Shown in monospace with a copy action, because the reason code is the part a builder
 * pastes into a test.
 */
export function ReasonCode({ reason }: { reason: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reason);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="reason-code">
      <code>{reason}</code>
      <button
        type="button"
        className="reason-copy"
        onClick={copy}
        aria-label={`Copy reason code ${reason}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
