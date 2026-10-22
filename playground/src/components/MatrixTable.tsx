import { useMemo, useState } from "react";
import { categoryIcon, categoryLabel } from "../lib/format";
import type { CaseCategory, MatrixCase } from "../data/types";
import { VerdictChip } from "./VerdictChip";

const FILTERS: Array<CaseCategory | "ALL"> = ["ALL", "MUST_ACCEPT", "MUST_REJECT", "BOUNDARY"];

/**
 * The acceptance matrix for one pattern.
 *
 * Boundary cases are highlighted, because that is where rules actually differ from one
 * another.
 */
export function MatrixTable({
  cases,
  onLoad,
}: {
  cases: MatrixCase[];
  onLoad?: (matrixCase: MatrixCase) => void;
}) {
  const [filter, setFilter] = useState<CaseCategory | "ALL">("ALL");

  const visible = useMemo(
    () => (filter === "ALL" ? cases : cases.filter((item) => item.category === filter)),
    [cases, filter],
  );

  return (
    <div className="matrix-table">
      <div className="row matrix-filters">
        <label className="field-label" htmlFor="matrix-filter">
          Show
        </label>
        <select
          id="matrix-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as CaseCategory | "ALL")}
        >
          {FILTERS.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? "All cases" : categoryLabel(option as CaseCategory)}
            </option>
          ))}
        </select>
        <span className="small muted">
          {visible.length} of {cases.length}
        </span>
      </div>

      <table className="ledger matrix">
        <caption className="visually-hidden">Acceptance matrix cases</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Category</th>
            <th scope="col">Expected</th>
            <th scope="col">Reason</th>
            {onLoad ? <th scope="col">Try it</th> : null}
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <tr
              key={item.id}
              data-boundary={item.category === "BOUNDARY" ? "true" : "false"}
            >
              <th scope="row" className="ledger-field">
                <span className="case-title">{item.title}</span>
                <span className="small muted case-id">{item.id}</span>
              </th>
              <td>
                <span className="case-category">
                  <span aria-hidden="true">{categoryIcon(item.category)}</span>{" "}
                  {categoryLabel(item.category)}
                </span>
              </td>
              <td>
                <VerdictChip
                  kind={item.expected === "ACCEPT" ? "accept" : "reject"}
                  label={item.expected === "ACCEPT" ? "Accepted" : "Rejected"}
                />
              </td>
              <td>
                <code className="small mono">{item.reasonCode}</code>
              </td>
              {onLoad ? (
                <td>
                  <button type="button" className="btn small" onClick={() => onLoad(item)}>
                    Try in playground
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
