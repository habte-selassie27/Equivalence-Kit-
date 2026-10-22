import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { findPattern, matrices } from "../../data/load";
import { MatrixTable } from "../../components/MatrixTable";
import { SpecSheet } from "../../components/SpecSheet";
import { HONESTY_LINE, LimitsNote } from "../../components/LimitsNote";
import type { MatrixCase } from "../../data/types";

/**
 * Screen 1 — Patterns.
 *
 * The spec of a pattern and the acceptance matrix that proves it, side by side.
 */
export function PatternsScreen() {
  const navigate = useNavigate();
  const [patternId, setPatternId] = useState("P1");

  const spec = findPattern(patternId);
  const matrix = matrices[patternId];

  const tryInPlayground = (matrixCase: MatrixCase) => {
    const params = new URLSearchParams({
      pattern: patternId,
      case: matrixCase.id,
    });
    navigate(`/playground?${params.toString()}`);
  };

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Patterns</h1>
        <p className="panel-note">
          Six equivalence patterns, each with the fields it compares, the rule it applies,
          and the acceptance matrix that proves the rule. Every pattern was generated from
          the same package the contracts run.
        </p>

        <div className="row">
          <label className="field-label" htmlFor="pattern-select">
            Pattern
          </label>
          <select
            id="pattern-select"
            value={patternId}
            onChange={(event) => setPatternId(event.target.value)}
          >
            {(["P1", "P2", "P3", "P4", "P5", "P6"] as const).map((id) => {
              const pattern = findPattern(id);
              return (
                <option key={id} value={id}>
                  {id} {pattern?.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {spec ? (
        <div className="panel">
          <SpecSheet spec={spec} />
        </div>
      ) : (
        <div className="panel">
          <p>That pattern doesn&apos;t exist. Choose one from the list.</p>
        </div>
      )}

      {matrix ? (
        <div className="panel">
          <h2 className="panel-title">Acceptance matrix</h2>
          <p className="panel-note">{matrix.description}</p>
          <MatrixTable cases={matrix.cases} onLoad={tryInPlayground} />
        </div>
      ) : null}

      <LimitsNote line={HONESTY_LINE} />
    </div>
  );
}
