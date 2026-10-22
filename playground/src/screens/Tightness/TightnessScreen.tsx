import { PerturbationBar } from "../../components/PerturbationBar";
import { LimitsNote, HONESTY_LINE } from "../../components/LimitsNote";
import { matrices, report } from "../../data/load";
import { findPattern } from "../../data/load";

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
          rejected={totalHarmfulMax - totalHarmful}
          total={totalHarmlessMax}
        />
        <PerturbationBar
          label="Harmful variations rejected"
          accepted={totalHarmful}
          rejected={totalHarmfulMax - totalHarmful}
          total={totalHarmfulMax}
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

      {report.patterns.map((item) => {
        const spec = findPattern(item.patternId);
        const matrix = matrices[item.patternId];
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
            />
            <p className="small muted">
              {item.counts.MUST_ACCEPT} must accept, {item.counts.MUST_REJECT} must reject,{" "}
              {item.counts.BOUNDARY} on the edge.
            </p>
            {matrix ? (
              <details className="boundary-details">
                <summary>Boundary cases ({item.counts.BOUNDARY})</summary>
                <ul className="spec-list">
                  {matrix.cases
                    .filter((entry) => entry.category === "BOUNDARY")
                    .map((entry) => (
                      <li key={entry.id}>
                        <code className="small mono">{entry.id}</code> {entry.title} —{" "}
                        <code className="small mono">{entry.reasonCode}</code>
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </div>
        );
      })}

      <LimitsNote line={HONESTY_LINE} />
    </div>
  );
}
