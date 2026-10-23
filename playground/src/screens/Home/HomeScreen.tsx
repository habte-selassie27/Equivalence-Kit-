import { Link } from "react-router-dom";
import { packageVersion, patterns, report } from "../../data/load";

/**
 * Screen 1 — Home.
 *
 * The landing page: what the kit is, the six patterns as proven rules, and where to go
 * next. Every number on this page comes from the generated site data
 * (`tools/export_site_data.py`) — the staleness test keeps them honest.
 */

const REFERENCE_CONTRACTS = [
  {
    file: "contracts/verdict_judge.py",
    pattern: "P1",
    label: "VerdictJudge",
    note: "A judgment with a confidence band, built on the verdict-plus-band pattern.",
  },
  {
    file: "contracts/web_fact_attestor.py",
    pattern: "P2",
    label: "WebFactAttestor",
    note: "Attests a fixed set of facts about a web page, with UNAVAILABLE as its own state.",
  },
  {
    file: "contracts/ranking_judge.py",
    pattern: "P4",
    label: "RankingJudge",
    note: "Ranks candidates with top-k overlap as the agreement rule.",
  },
];

const KIT_MODULES = [
  "normalize",
  "compare",
  "parsing",
  "bounds",
  "errors",
  "patterns",
  "perturb",
  "digest",
];

const DOCS = [
  { label: "Pattern catalog", path: "docs/pattern-catalog.md" },
  { label: "Decision guide", path: "docs/decision-guide.md" },
  { label: "Tightness testing", path: "docs/tightness-testing.md" },
  { label: "Anti-pattern gallery", path: "docs/anti-patterns.md" },
  { label: "Threat model", path: "docs/threat-model.md" },
  { label: "Contracts reference", path: "docs/contracts.md" },
];

const REPO_BLOB_URL =
  "https://github.com/habte-selassie27/Equivalence-Kit-/blob/main/";

export function HomeScreen() {
  const harmless = report.patterns.reduce((sum, item) => sum + item.harmlessAccepted, 0);
  const harmlessMax = report.patterns.reduce((sum, item) => sum + item.harmlessTotal, 0);
  const harmful = report.patterns.reduce((sum, item) => sum + item.harmfulRejected, 0);
  const harmfulMax = report.patterns.reduce((sum, item) => sum + item.harmfulTotal, 0);

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">EquivalenceKit</h1>
        <p className="panel-note">
          Tested equivalence and validator patterns for GenLayer intelligent contracts.
          The hard part of an intelligent contract is deciding what validators must
          agree on: rules that are too strict make honest validators disagree, and rules
          that are too loose let a validator agree with garbage. Every rule here ships
          with the test that proves how tight it is.
        </p>
        <p className="honesty">
          {harmless}/{harmlessMax} harmless variations accepted ·{" "}
          {harmful}/{harmfulMax} harmful variations rejected · pattern set P1–P6 ·{" "}
          equivalencekit {packageVersion}
        </p>
        <div className="row">
          <Link className="btn btn-primary" to="/guide">
            Choose a pattern
          </Link>
          <Link className="btn" to="/developing">
            Developer&apos;s guide
          </Link>
          <Link className="btn" to="/playground">
            Open the playground
          </Link>
        </div>
      </div>

      <div className="grid-3">
        <div className="panel">
          <h3>Primitive library</h3>
          <p className="panel-note">
            Pure Python with zero GenLayer imports: normalizers, comparators that return
            stable reason codes, guarded JSON parsing, error classification, and bounds.
            Fast to test; identical on every validator.
          </p>
          <p className="small mono">
            {KIT_MODULES.map((name) => `equivalencekit.${name}`).join(" · ")}
          </p>
        </div>
        <div className="panel">
          <h3>Reference contracts</h3>
          <p className="panel-note">
            Three complete intelligent contracts with real state machines, frozen
            rubrics, append-only history, and leader/validator logic wired to the
            patterns. Read them as worked examples, not demos.
          </p>
          <ul className="spec-list">
            {REFERENCE_CONTRACTS.map((contract) => (
              <li key={contract.file}>
                <a href={REPO_BLOB_URL + contract.file} target="_blank" rel="noreferrer">
                  {contract.label}
                </a>{" "}
                <span className="chip">{contract.pattern}</span>
                <span className="pattern-item-note">{contract.note}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Tooling</h3>
          <p className="panel-note">
            <code>ekit audit</code> scores a contract against the anti-pattern gallery,{" "}
            <code>ekit scaffold</code> starts a new contract from a pattern, and{" "}
            <code>ekit matrix</code> runs the acceptance cases for a custom spec.
            Vendoring inlines the primitives into a deployable file.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>How the agreement works</h2>
        <p className="panel-note">
          Same shape on every pattern: the leader asks the model for constrained JSON
          and parses it against a pattern spec — shapes, enums, ranges, and id
          universes — before any comparison. Validators re-derive from the same
          normalized inputs, compare field by field with documented comparators, and a
          mismatch comes back as a stable reason code, never as prose. Deterministic
          checks run before the model; invariants run after it.
        </p>
      </div>

      <div className="panel">
        <h2>The six patterns</h2>
        <p className="panel-note">
          Each pattern is a declarative spec with per-field comparators and invariants.
        </p>
        <div className="patterns-grid">
          {patterns.patterns.map((pattern) => (
            <Link
              key={pattern.id}
              className="pattern-item"
              to={`/patterns?pattern=${pattern.id}`}
            >
              <span className="pattern-item-id">{pattern.id}</span>
              <span className="pattern-item-name">{pattern.name}</span>
              <span className="pattern-item-note">{pattern.useWhen}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>What this cannot do</h2>
        <p className="honesty">
          It cannot detect a wrong decision that every validator shares, and it does not
          verify whether source content is true. It keeps disagreement about{" "}
          <em>how to read</em> evidence from masquerading as disagreement about{" "}
          <em>what the evidence says</em>.
        </p>
      </div>

      <div className="panel">
        <h2>Read the docs</h2>
        <ul className="spec-list">
          {DOCS.map((doc) => (
            <li key={doc.path}>
              <a href={REPO_BLOB_URL + doc.path} target="_blank" rel="noreferrer">
                {doc.label}
              </a>{" "}
              <span className="small mono">{doc.path}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
