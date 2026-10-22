import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { canonical } from "../../data/load";
import { HONESTY_LINE, LimitsNote } from "../../components/LimitsNote";
import { formatJson } from "../../lib/format";
import { encodeState } from "../../lib/urlState";
import type { PatternId } from "../../worker/protocol";

/**
 * Screen 4 — Decision guide.
 *
 * A real sequence: one question per step, two to four answers, a running summary, and a
 * recommendation card at the end. Answers persist in the URL hash, so a builder can
 * share a recommendation. The recommendations are starting points; confirm them with an
 * acceptance matrix before any comparator ships.
 */
interface AnswerOption {
  id: string;
  label: string;
  detail: string;
}

interface Question {
  id: number;
  question: string;
  detail: string;
  options: AnswerOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "Can validators reproduce the same normalized output?",
    detail:
      "If validators can compute the identical result in code from the same inputs, the comparison can be plain equality. If any free text, ordering noise, timestamps, great-model variance, or live web data is involved, equality is wrong: honest validators will disagree and the transaction never finalizes.",
    options: [
      {
        id: "code",
        label: "Yes, code decides everything",
        detail:
          "Pure code with no model or web input needs no equivalence rule at all; compare normalized values directly.",
      },
      {
        id: "mixed",
        label: "Partly — the model or the web is involved",
        detail:
          "An equivalence rule is required. Continue to choose the right pattern.",
      },
      {
        id: "unsure",
        label: "Not sure",
        detail:
          "Assume a rule is needed. A missing rule on non-deterministic output is the mistake this kit exists to prevent.",
      },
    ],
  },
  {
    id: 2,
    question: "What shape is the non-deterministic output?",
    detail:
      "Each shape has its own pattern: decisions, facts, numbers, rankings, sets.",
    options: [
      {
        id: "decision",
        label: "A decision among labels, with confidence",
        detail: "A verdict with a confidence band: eligibility, compliance, support.",
      },
      {
        id: "yesno",
        label: "A single yes/no about the world",
        detail: "A boolean attestation with evidence ids and an unavailable state.",
      },
      {
        id: "facts",
        label: "A structured set of facts",
        detail: "Several small structured facts extracted from one source.",
      },
      {
        id: "value",
        label: "A number, a ranking, or a set of names",
        detail: "Scores with noise, orderings over candidates, or lists of entities.",
      },
    ],
  },
  {
    id: 3,
    question: "Is it extracted from a live web page or API?",
    detail:
      "Live sources bring flakiness: an unreachable source is its own state, never a negative finding. Counts and dates from a page get bucketed.",
    options: [
      { id: "no", label: "No live source", detail: "No external fetch is involved." },
      {
        id: "yes",
        label: "Yes — a page or an API",
        detail:
          "Bucket volatile values, treat a failed fetch as UNAVAILABLE, and compare source status exactly.",
      },
    ],
  },
  {
    id: 4,
    question: "What can the leader hallucinate?",
    detail:
      "Anything a model produces that is not anchored to data you supplied: ids, entity names, out-of-range numbers.",
    options: [
      {
        id: "nothing",
        label: "Nothing material",
        detail: "The output space is small and closed.",
      },
      {
        id: "ids",
        label: "Ids or entity names",
        detail:
          "Add subset checks: every cited id must be in the universe you provided.",
      },
      {
        id: "numbers",
        label: "Numbers",
        detail: "Add range invariants at parse time, before any comparison.",
      },
      {
        id: "both",
        label: "Both ids and numbers",
        detail: "Subset checks for ids, range invariants for numbers.",
      },
    ],
  },
  {
    id: 5,
    question: "What must never change the decision?",
    detail:
      "Anything that must not flip the answer belongs in code, before the model, and is checked again afterwards as an invariant.",
    options: [
      {
        id: "none",
        label: "Nothing is code-decided",
        detail: "Every part of the output is genuinely interpretive.",
      },
      {
        id: "checks",
        label: "Specific checks decided in code",
        detail:
          "Deterministic checks run first, and their results forbid certain verdicts (consistent_with).",
      },
    ],
  },
  {
    id: 6,
    question: "What happens when the source is down?",
    detail:
      "Downstream code must be able to tell a negative finding from missing data.",
    options: [
      {
        id: "own-state",
        label: "UNAVAILABLE is its own state",
        detail:
          "Record and compare UNAVAILABLE as a distinct value; never treat it as false.",
      },
      {
        id: "skip",
        label: "No source to fail",
        detail: "No external fetch is involved in this judgment.",
      },
    ],
  },
  {
    id: 7,
    question: "How tight should the tolerance be?",
    detail:
      "Start strict, collect real disagreements, loosen one parameter at a time, and record the change with the matrix update. A tolerance change without a matrix update is not allowed.",
    options: [
      {
        id: "strict",
        label: "Start strict, loosen with evidence",
        detail:
          "Tightest parameters first; every loosening updates the acceptance matrix.",
      },
      {
        id: "known",
        label: "I have real variation data already",
        detail:
          "Set the parameters from observed variation and prove them with the matrix.",
      },
    ],
  },
  {
    id: 8,
    question: "How will you prove the rule is tight enough?",
    detail:
      "The acceptance matrix is written before the comparator, not after. The playground's perturbation harness covers the same idea.",
    options: [
      {
        id: "matrix",
        label: "Matrix before code",
        detail:
          "MUST_ACCEPT, MUST_REJECT, and BOUNDARY cases exist before the comparator ships.",
      },
      {
        id: "later",
        label: "Tests later",
        detail:
          "Not allowed in this kit: an unproven rule is a guess about where validators disagree.",
      },
    ],
  },
];

/** The shape a recommendation takes after all eight answers. */
interface Recommendation {
  primary: PatternId;
  extras: PatternId[];
  title: string;
  reason: string;
  invariants: string[];
}

function pickBase(shape: string): Recommendation {
  switch (shape) {
    case "yesno":
      return BASE.yesno;
    case "facts":
      return BASE.facts;
    case "value":
      return BASE.value;
    default:
      return BASE.decision;
  }
}

// The bases are keyed literals (not an indexed Record), so each lookup is a known,
// always-present recommendation — noUncheckedIndexedAccess keeps Record lookups optional.
const BASE = {
  decision: {
    primary: "P1" as PatternId,
    extras: [] as PatternId[],
    title: "Verdict plus band",
    reason: "A decision among labels with a confidence band compares with exact enums and a one-step band.",
    invariants: [
      "cited ids inside the provided universe (subset_of)",
      "band within one step of the leader's",
    ],
  },
  yesno: {
    primary: "P6" as PatternId,
    extras: [] as PatternId[],
    title: "Boolean attestation",
    reason: "A single yes/no compares with exact booleans and a distinct UNAVAILABLE state.",
    invariants: [
      "evidence ids inside the provided universe",
      "UNAVAILABLE never compared as false",
    ],
  },
  facts: {
    primary: "P2" as PatternId,
    extras: [] as PatternId[],
    title: "Fact set",
    reason: "Structured facts compare per fact: booleans exact, enums exact, counts by bucket.",
    invariants: [
      "source status OK or UNAVAILABLE compared exactly",
      "UNAVAILABLE implies no fact values",
    ],
  },
  value: {
    primary: "P3" as PatternId,
    extras: ["P4", "P5"] as PatternId[],
    title: "Bounded number (or ranking / entity set)",
    reason:
      "Numbers compare with integer tolerances (±delta or basis points); rankings use top-k overlap; entity sets use overlap thresholds.",
    invariants: [
      "value inside its declared range",
      "ranking and set ids inside the provided universe",
    ],
  },
};

function recommend(answers: Record<number, string>): Recommendation {
  const source = answers[3] ?? "no";
  const hallucination = answers[4] ?? "nothing";

  const chosen: Recommendation = { ...pickBase(answers[2] ?? "decision") };
  if (source === "yes" && chosen.primary !== "P2") {
    chosen.extras = Array.from(new Set(["P2", ...chosen.extras])) as PatternId[];
  }
  if (hallucination === "ids" || hallucination === "both") {
    chosen.invariants.unshift("subset checks on every id set");
  }
  if (hallucination === "numbers" || hallucination === "both") {
    chosen.invariants.unshift("range checks on parsed numbers");
  }
  if (answers[5] === "checks" && !chosen.invariants.some((line) => line.startsWith("consistent_with"))) {
    chosen.invariants.push(
      "consistent_with: code-decided checks forbid verdicts that can never be right",
    );
  }
  return chosen;
}

export function DecisionGuideScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State lives in the hash: q=step number (9 means finished), a=answers "1:code,3:yes".
  const step = Math.min(9, Math.max(1, Number(searchParams.get("q") ?? 1) || 1));
  const answers = useMemo(() => {
    const parsed: Record<number, string> = {};
    for (const part of (searchParams.get("a") ?? "").split(",")) {
      const [question, option] = part.split(":");
      const q = Number(question);
      if (q >= 1 && q <= 8 && option) parsed[q] = option;
    }
    return parsed;
  }, [searchParams]);

  const writeParams = (nextStep: number, nextAnswers: Record<number, string>) => {
    const encoded = Object.entries(nextAnswers)
      .map(([question, option]) => `${question}:${option}`)
      .join(",");
    setSearchParams(
      {
        q: String(Math.min(9, Math.max(1, nextStep))),
        ...(encoded ? { a: encoded } : {}),
      },
      { replace: true },
    );
  };

  const finished = step === 9 || Object.keys(answers).length === 8;
  const current = finished ? null : QUESTIONS.find((item) => item.id === step);
  const recommendation = useMemo(
    () => (Object.keys(answers).length === 8 ? recommend(answers) : null),
    [answers],
  );

  const answer = (questionId: number, optionId: string) => {
    const nextAnswers = { ...answers, [questionId]: optionId };
    writeParams(Math.min(9, questionId + 1), nextAnswers);
  };

  const tryPattern = (patternId: PatternId) => {
    // Seed both editors with the canonical example for the recommended pattern, and let
    // the playground fill the context editor with the canonical context.
    const entry = canonical.patterns[patternId];
    if (entry) {
      const encoded = encodeState({
        patternId,
        caseId: "",
        leader: formatJson(entry.output),
        validator: formatJson(entry.output),
      });
      navigate(`/playground?pattern=${patternId}&state=${encoded}`);
      return;
    }
    navigate(`/playground?pattern=${patternId}`);
  };

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Decision guide</h1>
        <p className="panel-note">
          Work through these in order before writing any non-deterministic logic. The
          answers give you the pattern and the tolerance parameters. This guide suggests a
          starting point — confirm it with an acceptance matrix.
        </p>
      </div>

      <div className="panel guide-panel">
        <div className="guide-grid">
          <div className="guide-main">
            {finished && recommendation ? (
              <div className="guide-recommendation">
                <h2 className="panel-title">Recommendation</h2>
                <p className="guide-rec-list">
                  <strong>
                    {recommendation.primary} — {recommendation.title}
                  </strong>
                  {recommendation.extras.length > 0 ? (
                    <span className="small muted">
                      {" "}
                      · also consider {recommendation.extras.join(", ")} where they apply
                    </span>
                  ) : null}
                </p>
                <p>{recommendation.reason}</p>
                <h3>Invariants to add</h3>
                <ul className="spec-list">
                  {recommendation.invariants.map((line) => (
                    <li key={line}>
                      <code className="small mono">{line}</code>
                    </li>
                  ))}
                </ul>
                <h3>Tolerance starting point</h3>
                <div className="small muted">
                  For {recommendation.title}, begin with the canonical parameters — read
                  them on the pattern page, or open the playground with the canonical
                  example loaded and edit from there.
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => tryPattern(recommendation.primary)}
                  >
                    Try {recommendation.primary} in the playground
                  </button>
                  <button type="button" className="btn" onClick={() => navigate(`/?pattern=${recommendation.primary}`)}>
                    Read the pattern spec
                  </button>
                  <button type="button" className="btn" onClick={() => writeParams(1, {})}>
                    Start over
                  </button>
                </div>
              </div>
            ) : current ? (
              <div className="guide-step">
                <p className="small muted guide-step-count">
                  Question {current.id} of 8
                </p>
                <h2 className="guide-step-title">{current.question}</h2>
                <p className="guide-detail">{current.detail}</p>
                <div className="guide-options">
                  {current.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="guide-option"
                      data-selected={answers[current.id] === option.id ? "true" : "false"}
                      onClick={() => answer(current.id, option.id)}
                    >
                      <span className="guide-option-label">{option.label}</span>
                      <span className="small muted">{option.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="row guide-nav">
              <button
                type="button"
                className="btn"
                disabled={step <= 1}
                onClick={() => writeParams(step - 1, omit(answers, step - 1))}
              >
                Back
              </button>
              {Object.keys(answers).length > 0 && !finished ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => writeParams(step + 1, answers)}
                >
                  Skip
                </button>
              ) : null}
            </div>
          </div>

          <aside className="guide-summary" aria-label="Your answers so far">
            <h2 className="guide-summary-title">Answers so far</h2>
            <ol className="guide-progress">
              {QUESTIONS.map((item) => {
                const answered = answers[item.id];
                const option = item.options.find((entry) => entry.id === answered);
                return (
                  <li key={item.id} data-answered={answered ? "true" : "false"}>
                    <span className="guide-progress-q">
                      {item.id}. {item.question}
                    </span>
                    <span className="guide-progress-a">
                      {option?.label ?? "not answered"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>

      <LimitsNote line={HONESTY_LINE} />
    </div>
  );
}

/** Remove an answer when stepping back, so the summary stays truthful. */
function omit(
  answers: Record<number, string>,
  questionId: number,
): Record<number, string> {
  const next = { ...answers };
  delete next[questionId];
  return next;
}
