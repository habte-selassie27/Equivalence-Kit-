import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { canonical, findPattern, matrices } from "../../data/load";
import { EmptyState, ErrorNotice } from "../../components/Notices";
import { JsonEditor } from "../../components/JsonEditor";
import { ReasonCode } from "../../components/ReasonCode";
import { ToleranceTrack, type TrackResult } from "../../components/ToleranceTrack";
import { VerdictChip } from "../../components/VerdictChip";
import {
  BOUNDARY_LINE,
  HONESTY_LINE,
  INTEGERS_LINE,
  LimitsNote,
  NOT_COMPARED_LINE,
} from "../../components/LimitsNote";
import { formatJson, parseJson } from "../../lib/format";
import { MAX_SEED } from "../../lib/limits";
import { buildShareLink, decodeState } from "../../lib/urlState";
import { buildTrackSpec, describeField } from "../../lib/tracks";
import { engine, EngineError } from "../../worker/engine";
import type { CompareResult, PatternId } from "../../worker/protocol";
import type { MatrixCase } from "../../data/types";

type Outcome =
  | { kind: "live"; result: CompareResult }
  | { kind: "precomputed"; ok: boolean; reason: string };

/**
 * Screen 2 — Playground.
 *
 * Edit a leader output and a validator output, run the real comparison, and see field by
 * field whether the rule accepts and why. When the engine cannot start, the screen falls
 * back to the stored matrix results and says so.
 */
export function PlaygroundScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const patternId = (searchParams.get("pattern") ?? "P1") as PatternId;
  const caseId = searchParams.get("case");

  const matrix = matrices[patternId];
  const initialCase = useMemo(
    () => matrix?.cases.find((item) => item.id === caseId) ?? matrix?.cases[0] ?? null,
    [matrix, caseId],
  );

  const [leaderText, setLeaderText] = useState("");
  const [validatorText, setValidatorText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [seed, setSeed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const loadCase = useCallback(
    (matrixCase: MatrixCase) => {
      setLeaderText(formatJson(matrixCase.leader));
      setValidatorText(formatJson(matrixCase.validator));
      setOutcome({
        kind: "precomputed",
        ok: matrixCase.expected === "ACCEPT",
        reason: matrixCase.reasonCode,
      });
      setError(null);
      setSearchParams({ pattern: patternId, case: matrixCase.id });
    },
    [patternId, setSearchParams],
  );

  // Load the case named in the URL, or a shared state, when the screen opens.
  useEffect(() => {
    const shared = searchParams.get("state");
    if (shared) {
      const decoded = decodeState(shared);
      if (decoded) {
        setLeaderText(decoded.leader);
        setValidatorText(decoded.validator);
        setOutcome(null);
        return;
      }
    }
    if (initialCase) {
      setLeaderText(formatJson(initialCase.leader));
      setValidatorText(formatJson(initialCase.validator));
      setOutcome({
        kind: "precomputed",
        ok: initialCase.expected === "ACCEPT",
        reason: initialCase.reasonCode,
      });
    }
  }, [initialCase, searchParams]);

  const spec = findPattern(patternId);

  const run = async () => {
    const leader = parseJson(leaderText);
    const validator = parseJson(validatorText);
    if (!leader.ok || !validator.ok) {
      setError("This isn't valid JSON. Check the highlighted line.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const context = canonical.patterns[patternId]?.context ?? {};
      const raw = await engine.send({
        kind: "compare",
        patternId,
        leader: leader.value,
        validator: validator.value,
        context,
      });
      setOutcome({ kind: "live", result: raw as CompareResult });
    } catch (caught) {
      if (caught instanceof EngineError) {
        setError(
          caught.errorClass === "ENGINE"
            ? "The engine couldn't start. Showing stored results only."
            : `${caught.errorClass}: ${caught.reason}`,
        );
      } else {
        setError("The engine couldn't start. Showing stored results only.");
      }
    } finally {
      setRunning(false);
    }
  };

  const perturb = async (mode: "harmless" | "harmful") => {
    const leader = parseJson(leaderText);
    if (!leader.ok) {
      setError("This isn't valid JSON. Check the highlighted line.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const variant = await engine.send({
        kind: "perturb",
        patternId,
        leader: leader.value,
        mode,
        seed,
      });
      setValidatorText(formatJson(variant));
      setSeed((current) => (current + 1) % (MAX_SEED + 1));
      setOutcome(null);
      setToast(mode === "harmless" ? "Harmless variation applied" : "Harmful variation applied");
      setTimeout(() => setToast(null), 2000);
    } catch (caught) {
      setError(
        caught instanceof EngineError
          ? `${caught.errorClass}: ${caught.reason}`
          : "The engine couldn't start. Showing stored results only.",
      );
    } finally {
      setRunning(false);
    }
  };

  const copyAsTestCase = async () => {
    const payload = JSON.stringify(
      { pattern: patternId, leader: parseJson(leaderText), validator: parseJson(validatorText) },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      setToast("Copied as test case");
    } catch {
      setToast("Copied as test case");
    }
    setTimeout(() => setToast(null), 2000);
  };

  const copyShareLink = async () => {
    const link = buildShareLink({ patternId, caseId, leader: leaderText, validator: validatorText });
    if (!link) {
      setError("Input is larger than the allowed size. Shorten it to continue.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setToast("Link copied");
    } catch {
      setToast("Link copied");
    }
    setTimeout(() => setToast(null), 2000);
  };

  const reset = () => {
    if (initialCase) {
      loadCase(initialCase);
    }
  };

  const leaderValue = parseJson(leaderText);
  const validatorValue = parseJson(validatorText);
  const fields = outcome?.kind === "live" ? outcome.result.fields : [];
  const notCompared = outcome?.kind === "live" ? outcome.result.not_compared : [];
  const accepted = outcome
    ? outcome.kind === "live"
      ? outcome.result.ok
      : outcome.ok
    : null;

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Playground</h1>
        <p className="panel-note">
          Load a case or paste outputs to compare them. The comparison runs the real
          package in your browser, so what you see is what the contracts do.
        </p>

        <div className="row">
          <label className="field-label" htmlFor="pg-pattern">
            Pattern
          </label>
          <select
            id="pg-pattern"
            value={patternId}
            onChange={(event) => setSearchParams({ pattern: event.target.value })}
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

          <label className="field-label" htmlFor="pg-case">
            Load case
          </label>
          <select
            id="pg-case"
            value={caseId ?? initialCase?.id ?? ""}
            onChange={(event) => {
              const found = matrix?.cases.find((item) => item.id === event.target.value);
              if (found) loadCase(found);
            }}
          >
            {matrix?.cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} — {item.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="grid-2">
          <JsonEditor
            label="Leader output (JSON)"
            value={leaderText}
            onChange={(next) => {
              setLeaderText(next);
              setOutcome(null);
            }}
          />
          <JsonEditor
            label="Validator output (JSON)"
            value={validatorText}
            onChange={(next) => {
              setValidatorText(next);
              setOutcome(null);
            }}
          />
        </div>

        <div className="row actions">
          <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
            {running ? "Running" : "Run comparison"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => perturb("harmless")}
            disabled={running}
          >
            Apply harmless variation
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => perturb("harmful")}
            disabled={running}
          >
            Apply harmful variation
          </button>
          <button type="button" className="btn" onClick={copyAsTestCase}>
            Copy as test case
          </button>
          <button type="button" className="btn" onClick={copyShareLink}>
            Copy share link
          </button>
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
          <span className="small muted">seed {seed}</span>
        </div>

        {error ? <ErrorNotice message={error} /> : null}
        {toast ? <p className="small toast">{toast}</p> : null}
      </div>

      <div className="panel">
        <h2 className="panel-title">Result</h2>
        {outcome === null ? (
          <EmptyState title="Run the comparison to see how each field is judged." />
        ) : (
          <>
            <div className="row result-head">
              <VerdictChip
                kind={accepted ? "accept" : "reject"}
                label={accepted ? "Accepted" : "Rejected"}
              />
              {outcome.kind === "precomputed" ? (
                <span className="small muted">
                  stored result from the acceptance matrix
                </span>
              ) : null}
              {outcome.kind === "live" ? (
                <ReasonCode reason={outcome.result.reason} />
              ) : null}
            </div>

            {fields.length > 0 && leaderValue.ok && validatorValue.ok ? (
              <div className="stack">
                {fields.map((field) => {
                  const trackSpec = buildTrackSpec(
                    patternId,
                    field.name,
                    leaderValue.value,
                    validatorValue.value,
                    canonical.patterns[patternId]?.context ?? {},
                  );
                  const track: TrackResult = describeField(
                    trackSpec,
                    leaderValue.value,
                    validatorValue.value,
                    field.ok,
                  );
                  return (
                    <div key={field.name} className="ledger-field-block">
                      <div className="row field-head">
                        <h3 className="field-name">{field.name}</h3>
                        <VerdictChip
                          kind={field.ok ? "accept" : "reject"}
                          label={field.ok ? "Accepted" : "Rejected"}
                        />
                        <ReasonCode reason={field.reason} />
                        {track.onEdge ? (
                          <span className="edge-tag">on the edge</span>
                        ) : null}
                      </div>
                      {trackSpec ? (
                        <ToleranceTrack spec={trackSpec} result={track} />
                      ) : (
                        <p className="small muted">{track.summary}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {notCompared.length > 0 ? (
              <p className="small muted">{NOT_COMPARED_LINE}</p>
            ) : null}
          </>
        )}
      </div>

      {spec ? (
        <div className="panel">
          <h2 className="panel-title">How this pattern is tuned</h2>
          <p className="panel-note">{spec.toleranceRationale}</p>
          <ul className="spec-list">
            {spec.invariants.map((invariant) => (
              <li key={invariant}>
                <code className="small mono">{invariant}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <LimitsNote line={HONESTY_LINE} />
      <LimitsNote line={INTEGERS_LINE} />
      <LimitsNote line={BOUNDARY_LINE} />
    </div>
  );
}
