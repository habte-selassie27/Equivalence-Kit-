import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LimitsNote, HONESTY_LINE } from "../../components/LimitsNote";

interface Question {
  id: number;
  question: string;
  detail: string;
  patterns: string[];
}

/**
 * Screen 4 — Decision guide.
 *
 * The eight questions to answer before writing any non-deterministic logic, in order.
 */
const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "Can validators reproduce the same normalized output?",
    detail:
      "If any free text, ordering noise, timestamps, model variance, or live web data is involved, equality is wrong: honest validators will disagree and the transaction never finalizes.",
    patterns: [],
  },
  {
    id: 2,
    question: "What kind of output is it?",
    detail:
      "A decision among labels, a single yes/no, a structured fact set, one number with noise, an ordered list, or an unordered set of entities. Each has its own pattern.",
    patterns: ["P1", "P2", "P3", "P4", "P5", "P6"],
  },
  {
    id: 3,
    question: "Is it extracted from a live web page or API?",
    detail:
      "Add the fact-set pattern and bucket volatile values. Treat a failed fetch as unavailable, never as a negative finding.",
    patterns: ["P2"],
  },
  {
    id: 4,
    question: "What can the leader hallucinate?",
    detail:
      "Ids must be a subset of the universe you supplied. Numbers need range invariants. Unknown enum values reject rather than snap to the closest label.",
    patterns: ["P1", "P2", "P4", "P6"],
  },
  {
    id: 5,
    question: "What must never change the decision?",
    detail:
      "Anything that must not change belongs in code, before the model is asked, and is checked again afterwards as an invariant.",
    patterns: ["P1"],
  },
  {
    id: 6,
    question: "What happens when the source is down?",
    detail:
      "Define unavailable as its own state with no facts or evidence. Downstream consumers treat it as insufficient evidence, never as a negative answer.",
    patterns: ["P2", "P6"],
  },
  {
    id: 7,
    question: "How tight should the tolerance be?",
    detail:
      "Start strict, collect real disagreements, loosen one parameter at a time, and record the change with the matrix update. A tolerance change without a matrix update is not allowed.",
    patterns: ["P1", "P3", "P4", "P5"],
  },
  {
    id: 8,
    question: "How will you prove it?",
    detail:
      "Write the acceptance matrix before the contract: must accept, must reject, and boundary cases. Then run the perturbation harness over it.",
    patterns: ["P1", "P2", "P3", "P4", "P5", "P6"],
  },
];

export function DecisionGuideScreen() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(1);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Decision guide</h1>
        <p className="panel-note">
          Work through these in order before writing any non-deterministic logic. The
          answers give you the pattern and the tolerance parameters.
        </p>
      </div>

      <div className="panel">
        <ol className="guide">
          {QUESTIONS.map((item) => (
            <li key={item.id} className="guide-item">
              <button
                type="button"
                className="guide-question"
                aria-expanded={open === item.id}
                onClick={() => setOpen(open === item.id ? null : item.id)}
              >
                <span className="guide-number">{item.id}</span>
                {item.question}
              </button>
              {open === item.id ? (
                <div className="guide-body">
                  <p>{item.detail}</p>
                  {item.patterns.length > 0 ? (
                    <div className="row">
                      {item.patterns.map((patternId) => (
                        <button
                          key={patternId}
                          type="button"
                          className="btn small"
                          onClick={() => navigate(`/playground?pattern=${patternId}`)}
                        >
                          Try {patternId}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <LimitsNote line={HONESTY_LINE} />
    </div>
  );
}
