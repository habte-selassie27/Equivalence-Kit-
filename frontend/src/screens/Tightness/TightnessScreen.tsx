import { Link } from "react-router-dom";
import { OnChainRun } from "../../components/OnChainRun";
import { findDeployment } from "../../lib/genlayer";
import { PerturbationBar } from "../../components/PerturbationBar";
import { matrices, report } from "../../data/load";
import { findPattern } from "../../data/load";
import { paramRows } from "../../lib/params";
import { categoryLabel } from "../../lib/format";
import type { MatrixCase } from "../../data/types";

/**
 * Screen 3 — Tightness report.
 *
 * The headline is that both rates are 100 percent. The interesting part is the boundary
 * cases underneath, because that is where rules differ from one another.
 */
export function TightnessScreen() {
  const totalHarmless = report.patterns.reduce(
    (sum, item) => sum + item.harmlessAccepted,
    0,
  );
  const totalHarmlessMax = report.patterns.reduce((sum, item) => sum + item.harmlessTotal, 0);
  const totalHarmful = report.patterns.reduce((sum, item) => sum + item.harmfulRejected, 0);
  const totalHarmfulMax = report.patterns.reduce((sum, item) => sum + item.harmfulTotal, 0);
  const totalCases = report.patterns.reduce((sum, item) => sum + item.cases, 0);

  const allClean =
    totalHarmless === totalHarmlessMax && totalHarmful === totalHarmfulMax;

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Tightness report</h1>
        <p className="panel-note">
          A rule that is too loose lets validators agree on garbage. A rule that is too
          strict stops honest validators agreeing at all. Both failures are silent, so they
          are measured: harmless variations must be accepted, harmful ones must be
          rejected.
        </p>

        <PerturbationBar
          label="Harmless variations accepted"
          accepted={totalHarmless}
          rejected={totalHarmlessMax - totalHarmless}
          total={totalHarmlessMax}
        />
        <PerturbationBar
          label="Harmful variations rejected"
          accepted={totalHarmful}
          rejected={totalHarmfulMax - totalHarmful}
          total={totalHarmfulMax}
          goodWord="rejected"
          badWord="accepted"
        />

        <p className="small muted">{totalCases} acceptance matrix cases in total.</p>

        {allClean ? (
          <p className="gaps-ok">No gaps found. Harmless variations are accepted and harmful ones are rejected.</p>
        ) : (
          <p className="status-bad">
            Unexpected result: the rates are not 100 percent. This is a rule gap.
          </p>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">How to read this</h2>
        <p className="panel-note">
          A harmless variation is noise an honest validator produces: reordered ids,
          different casing, a value inside the tolerance. A harmful variation is a decision
          flip, a hallucinated id, or a value past the edge. A 100 percent bar on both
          rows means the rule accepts exactly the noise you tuned it for and nothing else.
        </p>
      </div>

      {report.patterns.map((item) => {
        const spec = findPattern(item.patternId);
        const matrix = matrices[item.patternId];
        const rows = paramRows(item.params, item.paramVariants);
        return (
          <div key={item.patternId} className="panel">
            <h2 className="panel-title">
              {item.patternId} {spec?.name}
            </h2>
            <p className="panel-note">{spec?.useWhen}</p>
            <PerturbationBar
              label={`${item.patternId} harmless accepted`}
              accepted={item.harmlessAccepted}
              rejected={item.harmlessTotal - item.harmlessAccepted}
              total={item.harmlessTotal}
            />
            <PerturbationBar
              label={`${item.patternId} harmful rejected`}
              accepted={item.harmfulRejected}
              rejected={item.harmfulTotal - item.harmfulRejected}
              total={item.harmfulTotal}
              goodWord="rejected"
              badWord="accepted"
            />
            <p className="small muted">
              {item.counts.MUST_ACCEPT} must accept, {item.counts.MUST_REJECT} must reject,{" "}
              {item.counts.BOUNDARY} on the edge.
            </p>

            {rows.length > 0 ? (
              <p className="small muted parameters-summary">
                <strong>Parameters:</strong>{" "}
                {rows.map((row) => row.phrase).join("; ")}.
              </p>
            ) : null}

            {matrix ? (
              <details className="boundary-details">
                <summary>Boundary cases ({item.counts.BOUNDARY})</summary>
                <ul className="spec-list">
                  {matrix.cases
                    .filter((entry: MatrixCase) => entry.category === "BOUNDARY")
                    .map((entry) => (
                      <li key={entry.id} className="boundary-case-row">
                        <code className="small mono">{entry.id}</code> {entry.title} —{" "}
                        <code className="small mono">{entry.reasonCode}</code>{" "}
                        <span className="small muted">
                          ({categoryLabel(entry.category)}, expected{" "}
                          {entry.expected === "ACCEPT" ? "accept" : "reject"})
                        </span>{" "}
                        <Link
                          className="case-link"
                          to={`/playground?pattern=${item.patternId}&case=${entry.id}`}
                        >
                          Try in playground
                        </Link>
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </div>
        );
      })}

      <div className="panel">
        <h2 className="panel-title">On chain (StudioNet)</h2>
        <p className="panel-note">
          The rates above are measured locally. This panel submits one real transaction to
          the deployed VerdictJudge contract so you can watch the full lifecycle —
          signature, hash, consensus, receipt, read-back — from this screen.
        </p>
        <OnChainRun
          deployment={findDeployment("verdict_judge")}
          method="create_judgment"
          args={[
            "Tightness run",
            "ELIGIBLE,INELIGIBLE",
            '[{"item_id":"hard_income","text":"Evidence must mention income.","kind":"DETERMINISTIC","rule_kind":"EVIDENCE_CONTAINS","rule_value":"income"},{"item_id":"quality","text":"Assess whether the evidence is sufficient and relevant.","kind":"INTERPRETIVE"}]',
          ]}
          label="Run on StudioNet"
        />
      </div>
    </div>
  );
}
