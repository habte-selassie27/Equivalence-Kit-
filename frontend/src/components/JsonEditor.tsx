import { useId } from "react";
import { parseJson } from "../lib/format";
import { MAX_EDITOR_CHARS } from "../lib/limits";

/** Character count against the cap, always in characters (the cap is in characters). */
function withCap(length: number): string {
  const cap = MAX_EDITOR_CHARS.toLocaleString("en-US");
  if (length <= MAX_EDITOR_CHARS) {
    return `${length.toLocaleString("en-US")} of ${cap} characters`;
  }
  return `${length.toLocaleString("en-US")} characters — over the ${cap} cap`;
}

/**
 * A bounded JSON editor.
 *
 * It shows the size against the cap, flags invalid JSON, and never autosaves. Inputs over
 * the cap are refused with the message from the copy deck.
 */
export function JsonEditor({
  label,
  value,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const statusId = `${id}-status`;
  const tooLarge = value.length > MAX_EDITOR_CHARS;
  const parsed = parseJson(value);
  const invalid = !tooLarge && !parsed.ok;

  return (
    <div className="json-editor">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {hint ? <p className="small muted editor-hint">{hint}</p> : null}
      <textarea
        id={id}
        value={value}
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || tooLarge}
        aria-describedby={statusId}
        rows={12}
      />
      <div id={statusId} className="editor-status">
        <span className={tooLarge ? "status-bad" : "small muted"}>
          {withCap(value.length)}
        </span>
        {tooLarge ? (
          <span className="status-bad">
            Input is larger than the allowed size. Shorten it to continue.
          </span>
        ) : invalid ? (
          <span className="status-bad">
            This isn&apos;t valid JSON. Check the highlighted line.
          </span>
        ) : (
          <span className="status-ok">Valid JSON</span>
        )}
      </div>
    </div>
  );
}
