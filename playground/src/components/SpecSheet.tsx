import type { PatternSpec } from "../data/types";

/**
 * The pattern specification.
 *
 * Known limits are always expanded, never collapsed behind a disclosure. A builder
 * deciding whether to trust a rule needs to see what it cannot catch.
 */
export function SpecSheet({ spec }: { spec: PatternSpec }) {
  const params = Object.entries(spec.params);

  return (
    <div className="spec-sheet">
      <h3>{spec.name}</h3>
      <p className="spec-use">{spec.useWhen}</p>

      <h4>Fields</h4>
      <table className="ledger">
        <caption className="visually-hidden">Fields, normalizers and comparators</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Normalized by</th>
            <th scope="col">Compared by</th>
          </tr>
        </thead>
        <tbody>
          {spec.fields.map((field) => (
            <tr key={field.name} data-compared={field.compared ? "true" : "false"}>
              <th scope="row" className="ledger-field">
                {field.name}
              </th>
              <td>
                <code className="small mono">{field.normalizer}</code>
              </td>
              <td>
                {field.compared ? (
                  <code className="small mono">{field.comparator}</code>
                ) : (
                  <span className="small muted">not compared</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Invariants</h4>
      <ul className="spec-list">
        {spec.invariants.map((invariant) => (
          <li key={invariant}>
            <code className="small mono">{invariant}</code>
          </li>
        ))}
      </ul>

      {params.length > 0 ? (
        <>
          <h4>Parameters in force</h4>
          <ul className="spec-list">
            {params.map(([key, value]) => (
              <li key={key}>
                <code className="small mono">
                  {key} = {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </code>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h4>Why this tolerance</h4>
      <p>{spec.toleranceRationale}</p>

      <h4>Why not strict equality</h4>
      <p>{spec.whyNotStrictEq}</p>

      <h4>When it fails</h4>
      <p>{spec.failureBehavior}</p>

      <div className="spec-limits">
        <h4>Known limits</h4>
        <ul>
          {spec.knownLimits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
