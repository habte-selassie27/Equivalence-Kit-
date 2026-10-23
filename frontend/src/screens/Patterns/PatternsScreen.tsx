import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { findPattern, matrices, packageVersion } from "../../data/load";
import { MatrixTable } from "../../components/MatrixTable";
import { SpecSheet } from "../../components/SpecSheet";
import type { MatrixCase } from "../../data/types";

/**
 * Screen 1 — Patterns.
 *
 * The spec of a pattern and the acceptance matrix that proves it. The pattern list sits
 * beside the selected spec, and the selection lives in the URL so a link opens the same
 * pattern. The site data is imported statically, so a broken data file fails the build
 * rather than showing an empty screen.
 */
export function PatternsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("pattern");
  const [patternId, setPatternId] = useState(
    requested && findPattern(requested) ? requested : "P1",
  );

  // A link like /#/?pattern=P3 selects that pattern.
  useEffect(() => {
    if (requested && findPattern(requested) && requested !== patternId) {
      setPatternId(requested);
    }
  }, [requested, patternId]);

  const spec = findPattern(patternId);
  const matrix = matrices[patternId];

  const select = (id: string) => {
    if (id === patternId) return;

    const updateUrl = () => {
      const params = new URLSearchParams(searchParams);
      params.set("pattern", id);
      setSearchParams(params, { replace: true });
    };

    // A pattern change replaces a long spec and a tall matrix at once. Without help
    // that reads as a snap (and the matrix jumps to a new vertical position). The
    // View Transition API animates the old and new panels into place; browsers without
    // it, and readers who ask for reduced motion, get the plain swap.
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reducedMotion && typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        // flushSync keeps the new spec in the DOM before the browser takes its
        // "after" snapshot; without it React may paint after the snapshot.
        flushSync(() => setPatternId(id));
        updateUrl();
      });
    } else {
      setPatternId(id);
      updateUrl();
    }
  };

  const tryInPlayground = (matrixCase: MatrixCase) => {
    const params = new URLSearchParams({
      pattern: patternId,
      case: matrixCase.id,
    });
    navigate(`/playground?${params.toString()}`);
  };

  return (
    <div className="stack">
      <div className="panel patterns-panel">
        <h1 className="panel-title">Patterns</h1>
        <p className="panel-note">
          Six equivalence patterns, each with the fields it compares, the rule it applies,
          and the acceptance matrix that proves the rule. Generated from the same package
          the contracts run ({`equivalencekit ${packageVersion}`}), never hand-copied.
        </p>

        <div className="patterns-grid">
          <nav className="pattern-list" aria-label="Patterns">
            {(["P1", "P2", "P3", "P4", "P5", "P6"] as const).map((id) => {
              const pattern = findPattern(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`pattern-item${id === patternId ? " selected" : ""}`}
                  aria-pressed={id === patternId}
                  onClick={() => select(id)}
                >
                  <span className="pattern-item-id">{id}</span>
                  <span className="pattern-item-name">{pattern?.name}</span>
                  <span className="pattern-item-note">{pattern?.useWhen}</span>
                </button>
              );
            })}
          </nav>
          <div className="pattern-detail">
            {spec ? (
              <SpecSheet spec={spec} />
            ) : (
              <p>That pattern doesn&apos;t exist. Choose one from the list.</p>
            )}
          </div>
        </div>
      </div>

      {matrix ? (
        <div className="panel matrix-panel">
          <h2 className="panel-title">Acceptance matrix</h2>
          <p className="panel-note">{matrix.description}</p>
          <MatrixTable key={patternId} cases={matrix.cases} onLoad={tryInPlayground} />
        </div>
      ) : null}
    </div>
  );
}
