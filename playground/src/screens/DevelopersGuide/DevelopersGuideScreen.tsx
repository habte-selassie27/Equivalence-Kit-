import { Link } from "react-router-dom";
import { packageVersion, patterns } from "../../data/load";

/**
 * Screen — Developer's guide.
 *
 * How to install the kit, choose a pattern, wire it into a GenLayer contract, vendor
 * the primitives, and run the verification gates. Every command and file name here
 * mirrors the shipped repository — nothing documented that the repo does not ship.
 */

const REPO_CLONE_URL = "https://github.com/habte-selassie27/Equivalence-Kit-.git";

const REPO_BLOB_URL = REPO_CLONE_URL.replace(".git", "") + "/blob/main/";

const CONTRACT_BY_PATTERN: Record<string, string> = {
  P1: "contracts/verdict_judge.py",
  P2: "contracts/web_fact_attestor.py",
  P4: "contracts/ranking_judge.py",
};

export function DevelopersGuideScreen() {
  return (
    <div className="stack">
      <div className="panel">
        <h1 className="panel-title">Developer&apos;s guide</h1>
        <p className="panel-note">
          From source tree to a deployed intelligent contract: install, choose a
          pattern, wire the leader and validator paths, vendor primitives for GenVM,
          and run the gates. Current release: equivalencekit {packageVersion}.
        </p>
      </div>

      <div className="panel">
        <h3>1 · Install from the source tree</h3>
        <p className="panel-note">
          Pure Python (requires Python &ge; 3.10 in the package metadata). Development
          tooling and the test suite are pinned to Python 3.12 — the vendoring and
          export tools emit interpreter-specific code formatting, so their gates check
          under the pinned interpreter.
        </p>
        <pre>
          <code>
            {`git clone ${REPO_CLONE_URL}
cd Equivalence-Kit-
pip install -e .          # pure Python; no GenLayer imports involved
ekit --version            # console entry point: ekit`}
          </code>
        </pre>
      </div>

      <div className="panel">
        <h3>2 · Choose a pattern</h3>
        <p className="panel-note">
          Pick the pattern by the shape of the output you need to agree on, not by
          domain. The interactive{" "}
          <Link to="/guide">decision guide</Link> asks the same questions the catalog
          asks; the answers select a pattern.
        </p>
        <ul className="spec-list">
          {patterns.patterns.map((pattern) => (
            <li key={pattern.id}>
              <Link to={`/patterns?pattern=${pattern.id}`}>
                <span className="pattern-item-id">{pattern.id}</span>{" "}
                {pattern.name}
              </Link>{" "}
              <span className="pattern-item-note">{pattern.useWhen}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3>3 · Use the primitives</h3>
        <p className="panel-note">
          Import from the package — nothing touches GenLayer, the clock, or the
          network, so every validator computes the identical result from identical
          inputs:
        </p>
        <pre>
          <code>{`from equivalencekit import compare, normalize, parsing, errors

# comparator result: ok + a stable reason code
result = compare.all_of([
    compare.enum_equal(a.verdict, b.verdict),
    compare.ordinal_within(a.band, b.band, 1),
])
# failures raise classified errors, never free text:
#   EXPECTED · EXTERNAL · TRANSIENT · LLM_ERROR`}</code>
        </pre>
        <p className="panel-note">
          The error registry is closed: <code>errors.make_error</code> refuses an
          unknown reason code, and identical failures produce identical strings on
          every validator — asserted by test.
        </p>
      </div>

      <div className="panel">
        <h3>4 · Wire it into a contract</h3>
        <p className="panel-note">
          The three reference contracts are worked examples of the same recipe:
        </p>
        <ul className="spec-list">
          {patterns.patterns
            .filter((pattern) => pattern.id in CONTRACT_BY_PATTERN)
            .map((pattern) => (
              <li key={pattern.id}>
                <a
                  href={REPO_BLOB_URL + CONTRACT_BY_PATTERN[pattern.id]}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pattern.name} → {CONTRACT_BY_PATTERN[pattern.id]}
                </a>{" "}
                <span className="pattern-item-note">
                  full state machine, rubric handling, challenge lifecycle
                </span>
              </li>
            ))}
        </ul>
        <p className="panel-note">
          The recipe: freeze the rubric and rules at creation; run code-decided checks
          before the model; ask the model for constrained JSON and parse it with
          <code> parsing.parse_with_spec</code>; normalize and clip free text; pass
          only bounded inputs to the comparators; treat unreachable sources as
          <code> UNAVAILABLE</code>, a first-class state, never as a negative fact;
          append records, never overwrite.
        </p>
      </div>

      <div className="panel">
        <h3>5 · Vendor the primitives into the contract file</h3>
        <p className="panel-note">
          A deployed GenLayer contract cannot import a sibling module, so the
          primitives are inlined into each contract file. Never edit the inlined block
          by hand — regenerate it and let the freshness gate prove the two copies
          behave identically.
        </p>
        <pre>
          <code>{`python3.12 tools/vendor.py            # regenerate vendored blocks
python3.12 tools/vendor.py --check    # gate: blocks match the package`}</code>
        </pre>
        <p className="panel-note">
          Note the pinned interpreter: the generator emits interpreter-specific
          formatting, and <code>tests/matrices/test_vendored.py</code> polls the gate
          under <code>/usr/bin/python3.12</code>.
        </p>
      </div>

      <div className="panel">
        <h3>6 · Verify before you ship</h3>
        <pre>
          <code>{`# primitives + matrices + contracts under real consensus
python3.12 -m pytest tests/primitives tests/matrices tests/direct -q

# contract lint, after every contract change
genvm-lint check contracts/verdict_judge.py --json

# anti-pattern audit (also runs on every push via CI)
ekit audit contracts --json

# full consensus runs
gltest tests/integration/ -v -s`}</code>
        </pre>
        <p className="panel-note">
          Deployment follows the documented GenLayer flow: set the network with{" "}
          <code>genlayer network set</code> (never a hand-rolled RPC), deploy on the
          gasless StudioNet first, then read the <code>genlayer receipt</code> with{" "}
          <code>--stdout --stderr</code> for a failed test, then <code>genlayer schema</code>.
        </p>
      </div>

      <div className="panel">
        <h3>7 · Know the limits</h3>
        <p className="honesty">
          The kit proves that validators who read the evidence <em>carefully</em> agree
          on the decision. It cannot detect a wrong decision that every validator
          shares, and it does not verify whether source content is true. Divergence
          about interpretation is what the tolerances absorb — see the{" "}
          <Link to="/tightness">tightness report</Link> for how each rule is calibrated.
        </p>
      </div>
    </div>
  );
}
