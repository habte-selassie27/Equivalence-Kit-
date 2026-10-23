import type { FieldResult } from "../worker/protocol";
import { ReasonCode } from "./ReasonCode";
import { VerdictChip } from "./VerdictChip";

/**
 * The result ledger.
 *
 * Rows, not identical cards: compared fields and fields that are deliberately not compared
 * are separate sections, because the second group is a teaching point, not a result.
 */
export function FieldLedger({
  fields,
  notCompared,
  children,
}: {
  fields: FieldResult[];
  notCompared?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="field-ledger">
      <table className="ledger">
        <caption className="visually-hidden">Comparison result per field</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Result</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name} data-ok={field.ok ? "true" : "false"}>
              <th scope="row" className="ledger-field">
                {field.name}
              </th>
              <td>
                <VerdictChip
                  kind={field.ok ? "accept" : "reject"}
                  label={field.ok ? "Accepted" : "Rejected"}
                />
              </td>
              <td>
                <ReasonCode reason={field.reason} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {children ? <div className="ledger-extra">{children}</div> : null}
      {notCompared && notCompared.length > 0 ? (
        <div className="ledger-notcompared">
          <h4>Not compared</h4>
          <p className="small">
            {notCompared.join(", ")} — digests and free text are stored for people to read.
            Consensus ignores them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
