# AGENTS.md — EquivalenceKit (Reusable GenLayer Equivalence and Validator Patterns)

> Audience: any coding agent (Claude Code, Cursor, Codex, Copilot, etc.)
> Base: the GenLayer Build Skill (Score-Max Edition), specialized for EquivalenceKit.
> Target: GenLayer builder program, category "Intelligent Contracts" (standalone primitives
> that are useful, reusable, and educational for other builders).
> Rule zero: if this file and the official GenLayer docs disagree, the docs win.

---

## 0. AGENT PROMPT (GENLAYER BASE CONTEXT)

You are a coding agent implementing a GenLayer project. Treat GenLayer as a
blockchain/protocol for trustless adjudication, not as a synonym for Intelligent Contracts.
Intelligent Contracts are one core product: Python contracts executed in GenVM that can use
LLMs, live web/API data, and unstructured inputs, then settle outcomes on-chain through
GenLayer's AI-validator consensus.

Context:
- AI-validator consensus resolves transactions that require judgment, not only deterministic
  execution.
- Consensus model: Optimistic Democracy. A leader proposes a result, independent validators
  evaluate it, accepted results enter an appeal/finality process, finalized outcomes are
  permanent.
- Two layers: GenLayer Chain (EVM-compatible L2: accounts, balances) and GenVM (executes
  Intelligent Contracts).
- Intelligent Contracts are Python, extend `gl.Contract`, run in GenVM, and can process
  natural language, fetch live web data, analyze unstructured content, and use images or other
  evidence through LLM calls.
- Validators agree on MEANING, not exact bytes.
- Do not model GenLayer as a normal deterministic EVM chain. Design explicit validation and
  equivalence rules for every LLM, web, image, or other non-deterministic result.

Official agent context first:
- Skills: https://skills.genlayer.com/
- Claude Code: `/plugin marketplace add genlayerlabs/skills`
- Then: `/plugin install genlayer-dev@genlayerlabs`
- Use `genlayernode` only for validator-node operation.

Skills:
- write-contract: before and during contract work (storage, runners, equivalence choice,
  validator patterns, LLM resilience, web access, cross-contract calls, anti-patterns).
- genvm-lint: after EVERY contract change. `genvm-lint check contracts/<file>.py --json`
- direct-tests: fast in-memory tests with mocked web/LLM. `pytest tests/direct/ -v`
- integration-tests: consensus, real web/LLM, Studio, GLSim, StudioNet, Bradbury.
  `gltest tests/integration/ -v -s`
- genlayer-cli: networks, accounts, deploy, calls, writes, schemas, receipts, traces.

MCP (when supported):
- `claude mcp add genlayer-docs --transport sse https://docs-mcp.genlayer.com/sse`
- `claude mcp add genlayer npx -- -y genlayer-mcp`
- Verify APIs and SDK methods via docs MCP before writing code. No MCP? Use
  https://docs.genlayer.com/full-documentation.txt and
  https://sdk.genlayer.com/main/_static/ai/api.txt

Packages: `npm install -g genlayer` (CLI), `pip install genvm-linter`,
`pip install genlayer-test` (or `[sim]`).

Build workflow: classify the task; prefer starters; Python with a pinned GenVM `Depends`
header (never `latest` or runner aliases); choose the equivalence strategy BEFORE writing
non-deterministic logic; GenLayer storage types only (TreeMap, DynArray, allow_storage
dataclasses, sized ints for money; never raw dict/list); defensive LLM handling with
deterministic prefixes EXPECTED, EXTERNAL, TRANSIENT, LLM_ERROR; gates in order: lint,
direct tests, integration tests, deploy/debug loop.

Network rules:
- `genlayer network set` for built-in networks; never override RPC manually.
- StudioNet is gasless; 0 GEN is expected.
- Bradbury and Asimov need funded accounts. Faucet: https://testnet-faucet.genlayer.foundation/
  (browser-based, cannot be fully automated).
- Debug failed txs: `genlayer receipt <txHash> --stdout --stderr`, then
  `genlayer schema <address>`, `genlayer code <address>`, then read calls.

Deliverables: smallest complete implementation that passes lint and tests; if anything is
unavailable, say exactly what is blocked and the next step; never leave GenLayer APIs
guessed.

---

## 1. PROJECT IDENTITY

**Name:** EquivalenceKit
**One-liner:** A tested kit of equivalence and validator patterns for GenLayer contracts:
pure normalization and comparison primitives, defensive LLM-output parsing, and reference
contracts that show how to choose and tune equivalence rules, with tests that prove what
each rule accepts and rejects.

**The problem it solves**
- The hardest part of a GenLayer contract is deciding what validators must agree on.
- Rules that are too strict make honest validators disagree; rules that are too loose let a
  validator agree with garbage.
- Builders reinvent normalizers, tolerance bands, and parsers, and rarely test how tight
  their rules really are.

**What it is**
- A pure-Python primitives package with zero GenLayer dependencies (fast to test anywhere).
- A small set of reference Intelligent Contracts that use those primitives with real
  consensus logic.
- A pattern catalog and a "tightness testing" method (acceptance matrices) other builders
  can copy.

**What it is NOT**
- Not a hello-world, a thin LLM wrapper, a format-only validator, or a boilerplate fork.
- Not a frontend app.
- Not a replacement for reading the official Equivalence Principle docs.

---

## 2. PRIME DIRECTIVES

1. GenLayer is a blockchain/protocol for trustless adjudication; Intelligent Contracts are
   one core product.
2. NEVER guess a GenLayer API, import, decorator, or CLI flag. Verify first.
3. NEVER model GenLayer as a normal deterministic EVM chain.
4. Every pattern ships with a written equivalence design AND an acceptance matrix of inputs
   that MUST be accepted and inputs that MUST be rejected.
5. Primitives are pure, deterministic, bounded, and free of floats where precision matters
   (use integers, basis points, and explicit rounding).
6. Compare DECISIONS, never explanations.
7. A comparator that cannot reject garbage is a bug. Every comparator needs reject tests.
8. Primitives never import GenLayer modules; the adapter layer does (section 16).
9. Reference contracts must have real state design and consensus logic, not toy demos.
10. Smallest complete implementation. Depth and correctness beat feature count.
11. Evidence beats claims: tests, receipts, explorer links. Never fabricate any of them.
12. Never commit secrets. If blocked, state exactly what and give the next step.

---

## 3. CATEGORY FIT

Reviewers look for: real GenLayer consensus logic, clear state design, thoughtful validators
or equivalence checks, a use case that matters beyond a demo, readable source, a clear
purpose statement, an explanation of how consensus is used, and enough docs or tests to
understand the primitive.

The category rejects: basic examples, hello-world, simple storage, thin LLM wrappers,
format-only validators, boilerplate forks, generic "AI decides X" demos.

| Risk | EquivalenceKit answer |
|---|---|
| Basic example | Reference contracts have real state and lifecycle; the kit is infrastructure |
| Thin LLM wrapper | Primitives are deterministic; LLM output is parsed and bounded, never trusted |
| Format-only validator | Comparators check decisions, invariants, and consistency, not just shape |
| Generic "AI decides X" | The subject IS how validators agree; no domain decisions are outsourced |
| Not reusable | Pure primitives plus a pattern catalog any contract can adopt |
| Unproven rules | Acceptance matrices and boundary tests show exactly what each rule allows |

If a change moves the project toward the left column, do not make it.

---

## 4. SCOPE

In scope
- Pure primitives: normalizers, comparators, parsers, error helpers, bounds helpers
- Pattern catalog with filled equivalence designs
- Reference contracts: VerdictJudge, WebFactAttestor (v1); RankingJudge (stretch)
- Tightness testing methodology and tests (acceptance matrices, boundary and mutation tests)
- Decision guide: which equivalence strategy to choose
- Docs, deployment, and an evidence pack

Out of scope
- Any frontend or application UI
- Domain-specific adjudication (disputes, markets, governance)
- Token logic, payments, escrow
- Re-implementing GenLayer's own equivalence mechanisms; the kit uses them via verified APIs

---

## 5. SOURCES OF TRUTH (IN ORDER)

1. Skills: https://skills.genlayer.com/
2. Docs MCP: https://docs-mcp.genlayer.com/sse
3. Full docs: https://docs.genlayer.com/full-documentation.txt
4. SDK ref (agents): https://sdk.genlayer.com/main/_static/ai/api.txt
5. SDK ref: https://sdk.genlayer.com/main/
6. Equivalence Principle (primary reference for this project):
   https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
7. Developer docs: https://docs.genlayer.com/developers
8. Test API: https://docs.genlayer.com/api-references/genlayer-test
9. Builder portal: https://portal.genlayer.foundation/builders/resources

Read the Equivalence Principle page and the write-contract skill in full before designing
any adapter. Everything in this file that looks like GenLayer code is CONCEPTUAL.

---

## 6. STARTERS (STUDY, CREDIT, DO NOT FORK)

| Starter | Use for |
|---|---|
| GenLayer Gym (https://gym.genlayer.foundation/) | Web-access sources, benchmarks, evaluation patterns |
| Intelligent Oracle (https://www.intelligentoracle.com/) | Real-world examples of consensus checks to learn from |
| Prediction Market Kit (https://github.com/courtofinternet/pm-kit) | Outcome-resolution patterns to extract primitives from |
| Project Boilerplate (https://github.com/genlayerlabs/genlayer-project-boilerplate) | Contract project structure |

Study how each handles agreement; extract general primitives; credit them in the README.

---

## 7. REPOSITORY LAYOUT

```
equivalencekit/
  AGENTS.md
  README.md
  CHANGELOG.md
  equivalencekit/              # pure-Python primitives, NO genlayer imports
    __init__.py
    normalize.py
    compare.py
    parsing.py
    errors.py
    bounds.py
    patterns.py                # declarative pattern specs and acceptance matrices
  contracts/
    verdict_judge.py           # reference contract 1
    web_fact_attestor.py       # reference contract 2
    ranking_judge.py           # stretch
  tools/
    vendor.py                  # inlines primitives into a single contract file (section 16)
  docs/
    pattern-catalog.md
    decision-guide.md
    tightness-testing.md
    anti-patterns.md
    contracts.md
    threat-model.md
  tests/
    primitives/                # pure tests, no GenLayer needed
    direct/                    # contract-level tests with mocked web/LLM
    integration/               # real consensus
    matrices/                  # acceptance matrix fixtures per pattern
  deployments/
    studionet.md
    testnet.md
  .env.example
  .gitignore
  requirements.txt
```

---

## 8. DESIGN PRINCIPLES OF THE KIT

1. **Pure core, thin adapter.** Primitives know nothing about GenLayer. The adapter layer
   wires them into leader/validator functions using verified APIs.
2. **Decisions over prose.** Comparators operate on constrained fields: enums, booleans,
   buckets, bounded integers, id sets.
3. **Integers over floats.** Tolerances use integer math (basis points, cross-multiplication)
   so every validator computes the identical comparison.
4. **Declarative specs.** A pattern is data: fields, normalizers, comparator per field,
   invariants. The same spec drives the contract, the docs, and the tests.
5. **Fail closed.** Unknown enum, missing key, out-of-range value, or oversize input
   rejects with a classified error; it never "best-effort" passes.
6. **Bounded everything.** Every list, string, and loop has a documented limit.
7. **Explainability.** Every comparator returns a reason code (stable string), so tests and
   docs can show why something was accepted or rejected.
8. **Symmetry and order independence** where the semantics demand it (sets, id lists,
   evidence order), proven by tests.

---

## 9. PRIMITIVES: NORMALIZERS (equivalencekit/normalize.py)

All normalizers are pure, deterministic, bounded, and idempotent (normalize(normalize(x))
equals normalize(x); tested).

| Function | Purpose | Rules |
|---|---|---|
| normalize_text | Canonical text for comparison keys | Unicode NFKC, lowercase, collapse whitespace, trim, length cap |
| normalize_enum | Map model output to an allowed enum | Case/whitespace/punctuation tolerant, explicit alias table, reject unknowns |
| normalize_bool | Strict boolean from known tokens | Documented token sets only; ambiguous input rejects |
| normalize_int | Integer from int or numeric string | Range checked; no float coercion of non-integral values |
| normalize_ratio_bps | Ratio as integer basis points | Explicit rounding mode (half up); range checked |
| normalize_id_list | Canonical id list | Dedupe, sort, per-id charset and length limits, size cap |
| normalize_url | Canonical URL key | Lowercase scheme/host, strip fragment and tracking params (documented list), no credentials |
| strip_volatile | Remove volatile fields | Drop documented keys (timestamps, counters, request ids) recursively |
| bucketize | Value to bucket label | Ascending integer boundaries; explicit inclusive edges; tested at every boundary |
| extract_headings | Heading texts from page text or simple markup | Deterministic parser; normalized heading keys; alias table |
| normalize_ws_lines | Whitespace-stable multi-line text | For digests only; never for consensus decisions |

Rules
- No regex that can backtrack catastrophically; bound input length first.
- Document every alias table and tracking-parameter list in docs/pattern-catalog.md.
- Every normalizer has: valid cases, malformed cases, boundary cases, idempotence test,
  and a property test on random bounded input (no exceptions other than the documented one).

---

## 10. PRIMITIVES: COMPARATORS (equivalencekit/compare.py)

Each comparator returns a result with `ok` (bool) and a stable `reason` code.

| Function | Purpose | Rules |
|---|---|---|
| enum_equal | Exact enum match after normalization | Both values must be in the allowed set |
| ordinal_within | Ordered levels within N steps | Levels given as an ordered tuple (for example LOW, MEDIUM, HIGH); N small and explicit |
| int_within_abs | Integers within an absolute delta | Delta explicit; symmetric |
| int_within_bps | Integers within a relative tolerance in bps | Cross-multiplication, no division, no floats; handles zero explicitly |
| bucket_adjacent | Same or adjacent bucket | Uses bucketize; adjacency only (documented) |
| set_equal | Id sets equal after normalization | Order independent |
| subset_of | Cited ids within the provided universe | Rejects any unknown id; the key anti-hallucination invariant |
| overlap_at_least | Set overlap threshold | Integer form: intersection times 100 compared with threshold times union size |
| topk_overlap | Ranked list agreement | Top-k set overlap plus optional rank-distance cap |
| facts_match | Per-fact comparison for a fact set | Rule per fact (bool exact, enum exact, bucket adjacent, int within) |
| consistent_with | Invariant: result vs deterministic results | Example: no "eligible" verdict after a hard-failed check; rule table driven |
| all_of | Combine comparator results | Returns the first failing reason code |

Rules
- Comparators are symmetric where mathematically expected (tested) and document where they
  are not (for example subset_of is directional).
- Comparators never read the clock, randomness, network, or environment.
- Comparators return reason codes, never free text built from inputs (stable across
  validators).
- A pattern's equivalence rule is `all_of(...)` over its per-field comparators plus
  its invariants.

---

## 11. PRIMITIVES: PARSING, ERRORS, BOUNDS

### 11.1 Parsing (equivalencekit/parsing.py)
| Function | Purpose |
|---|---|
| strip_fences | Remove markdown fences and surrounding commentary |
| extract_json_object | Find and parse the first top-level JSON object in guarded fashion |
| parse_with_spec | Validate keys, aliases, types, enums, ranges, id universes against a pattern spec |
| clip_text | Bound free-text fields (digests) deterministically |

`parse_with_spec` steps: size cap, fence strip, guarded parse, top-level object check,
required keys with documented aliases, type checks, enum normalization (reject unknown),
range checks, id subset check, text clipping. Any failure raises a classified error.

### 11.2 Errors (equivalencekit/errors.py)
Deterministic prefixes so validators agree on failures:

| Prefix | Meaning | Example reason codes |
|---|---|---|
| EXPECTED | Normal caller or logic error | NOT_AUTHORIZED, INVALID_STATE, OVER_LIMIT |
| EXTERNAL | External source failed | SOURCE_UNREACHABLE, SOURCE_EMPTY |
| TRANSIENT | Retryable | UPSTREAM_TIMEOUT, RATE_LIMITED |
| LLM_ERROR | Model output unusable | BAD_JSON, MISSING_KEY, UNKNOWN_ENUM, UNKNOWN_ID, OUT_OF_RANGE |

- `make_error(prefix, reason_code)` builds the string `PREFIX: reason text` from a fixed
  registry. No timestamps, random ids, raw model output, or raw web content.
- The registry is closed: an unknown reason code is a programming error (tested).

### 11.3 Bounds (equivalencekit/bounds.py)
- Central constants and helpers for max lengths, max list sizes, and max input bytes.
- `require_within(name, value, limit)` raises EXPECTED: OVER_LIMIT.
- Every primitive that loops or recurses consumes these limits.

---

## 12. PATTERN CATALOG (equivalencekit/patterns.py AND docs/pattern-catalog.md)

A pattern is a declarative spec: fields, normalizers, per-field comparators, invariants,
failure behavior, and an acceptance matrix. Each pattern below must ship with all of them.

### 12.1 Pattern table
| Id | Name | Use when | Compared fields |
|---|---|---|---|
| P1 | Verdict plus band | A judgment with confidence (eligibility, compliance, support) | verdict enum exact; band within one step; cited ids subset; invariants |
| P2 | Fact set | Extracting structured facts from a web page or API | each fact by its rule (bool exact, enum exact, bucket adjacent) |
| P3 | Bounded number | A score, price bucket, or count with natural noise | int within abs or bps tolerance; range invariants |
| P4 | Ranking | Ordering candidates | top-k set overlap; optional rank distance cap |
| P5 | Entity set | Extracting a list of entities or ids | set equality or overlap threshold after normalization |
| P6 | Boolean attestation | A single yes/no about the world | bool exact; evidence id subset; unavailable-source handling |

### 12.2 Pattern spec template (fill for EVERY pattern)
```
PATTERN ID / NAME:
USE WHEN:
LEADER PRODUCES: (fields and types)
NORMALIZATION: (function per field)
COMPARATORS: (function per field, with parameters)
INVARIANTS: (cross-field and external consistency rules)
TOLERANCE RATIONALE: (why these parameters)
FAILURE MODES: (invalid output, unreachable source, disagreement)
FAILURE BEHAVIOR: (classified error, state unchanged)
WHY NOT strict_eq:
ACCEPTANCE MATRIX: (must-accept, must-reject, boundary cases)
KNOWN LIMITS: (what this rule cannot catch)
```

### 12.3 P1 filled: Verdict plus band
```
LEADER PRODUCES: {verdict: enum, band: LOW|MEDIUM|HIGH, cited_ids: [id], digest: text}
NORMALIZATION: normalize_enum(verdict), normalize_enum(band), normalize_id_list(cited_ids),
               clip_text(digest)
COMPARATORS: enum_equal(verdict); ordinal_within(band, 1); subset_of(cited_ids, provided_ids)
INVARIANTS: consistent_with(verdict, deterministic_results) via a rule table
TOLERANCE RATIONALE: models disagree on confidence more than on the decision; one step
                     absorbs that without letting a decision flip through
FAILURES: bad JSON, unknown enum, hallucinated id
FAILURE BEHAVIOR: LLM_ERROR with a reason code; state unchanged
KNOWN LIMITS: cannot detect a consistently wrong verdict shared by all validators
ACCEPTANCE MATRIX (examples)
  accept: same verdict, band MEDIUM vs HIGH
  accept: same verdict, cited ids in a different order
  reject: different verdict
  reject: band LOW vs HIGH
  reject: cited id not in the provided universe
  reject: verdict ELIGIBLE after a hard-failed deterministic check
  boundary: empty cited ids (allowed only if the spec says so)
```

### 12.4 P2 filled: Fact set
```
LEADER PRODUCES: {facts: {name: value}, source_status: OK|UNAVAILABLE}
NORMALIZATION: strip_volatile, normalize_text on keys, per-fact normalizers
COMPARATORS: facts_match with a rule per fact; enum_equal(source_status)
INVARIANTS: UNAVAILABLE implies no fact values (or all marked unknown)
TOLERANCE RATIONALE: dates and counts are bucketed; headings matched by normalized key
                     plus alias table
FAILURE BEHAVIOR: EXTERNAL with SOURCE_UNREACHABLE; downstream treats as insufficient
                  evidence, never as a negative finding
ACCEPTANCE MATRIX (examples)
  accept: same booleans, word count in adjacent buckets
  accept: heading text differing only by case and whitespace
  reject: one required heading present vs absent
  reject: source OK vs UNAVAILABLE
  boundary: count exactly on a bucket edge in both runs, and across the edge
```

### 12.5 P3 filled: Bounded number
```
LEADER PRODUCES: {value: int, unit: enum}
COMPARATORS: enum_equal(unit); int_within_bps(value, tolerance_bps) or int_within_abs
INVARIANTS: value inside [min, max]; zero handled explicitly
TOLERANCE RATIONALE: tolerance derived from observed variation, recorded in the docs
ACCEPTANCE MATRIX: values at exactly the tolerance edge accept; one unit beyond rejects;
                   zero versus nonzero handled per spec; negative rejected if disallowed
```

### 12.6 P4, P5, P6 (same template, short form)
- P4 Ranking: normalize ids; topk_overlap with k and threshold; reject on any id outside
  the candidate universe; acceptance matrix covers swaps inside top-k (accept) and
  entities crossing the cutoff (reject beyond the threshold).
- P5 Entity set: normalize_text per entity, dedupe; set_equal or overlap_at_least with an
  integer threshold; document alias handling; acceptance matrix covers duplicates,
  casing, and a single missing entity at the boundary.
- P6 Boolean attestation: bool exact; evidence ids subset; UNAVAILABLE handled as its own
  state, never as false; acceptance matrix covers the unavailable-versus-false trap.

---

## 13. REFERENCE CONTRACT 1: VerdictJudge

### 13.1 Purpose
A generic judgment primitive. A registrant defines a question and a frozen rubric of
criteria with a verdict enum; anyone submits evidence references; the contract runs a P1
consensus evaluation and stores an append-only assessment history.

It is NOT a domain app; it demonstrates how to build a reusable judge with real state,
roles, and lifecycle.

### 13.2 Domain model (conceptual; confirm storage types in the SDK reference)
```
Judgment
  judgment_id, creator, title (bounded)
  verdict_set        : frozen list of allowed verdict labels (bounded)
  rubric             : frozen list of RubricItem {item_id, text, kind: DETERMINISTIC|INTERPRETIVE}
  deterministic_rules: table mapping failed deterministic items to forbidden verdicts
  status             : OPEN | EVALUATED | CHALLENGED | CLOSED
  evidence           : append-only list of EvidenceRef {evidence_id, ref, submitted_by}
  assessments        : append-only list of Assessment
Assessment
  round, verdict, band, cited_item_ids, cited_evidence_ids, digest (not compared), flags
```

### 13.3 Methods (names are suggestions)
| Write method | Purpose | Access |
|---|---|---|
| create_judgment | Freeze verdict set, rubric, and rules | creator |
| submit_evidence | Append an evidence reference | creator or designated submitters |
| evaluate | Deterministic checks first, then P1 consensus | anyone |
| challenge | Contest the latest assessment (reason, optional evidence) | participants |
| re_evaluate | New round after a challenge | anyone |
| close | Close after the window with no pending challenge | anyone |

| View method | Returns |
|---|---|
| get_judgment, get_evidence, get_assessments, get_config | Records and history |

### 13.4 State machine
OPEN -> EVALUATED -> CHALLENGED -> EVALUATED (re-evaluated, round + 1) -> ... -> CLOSED.
Any other transition fails with EXPECTED: INVALID_STATE. Assessments are append-only.

### 13.5 Equivalence (P1 applied)
- Leader asks the model for constrained JSON and parses with `parse_with_spec`.
- Validators independently derive their own result from the same normalized inputs.
- Accept when: verdict equal, band within one step, cited ids subsets, `consistent_with`
  holds against the code-decided rubric results.
- Digest text is excluded from comparison.
- Failure: LLM_ERROR or EXTERNAL; no assessment appended; status unchanged.

### 13.6 Why it is more than a wrapper
- Deterministic rubric items are decided in code and can forbid verdicts the LLM may not
  return.
- The comparator enforces invariants, not just matching output.
- Full lifecycle with challenges and history.

---

## 14. REFERENCE CONTRACT 2: WebFactAttestor

### 14.1 Purpose
Attest a small, fixed set of facts about a web page at a point in time, with consensus on
the facts (P2) and a record that other contracts can read as evidence.

### 14.2 Domain model (conceptual)
```
FactSpec (frozen at creation)
  spec_id, creator, url_pattern or exact URL, facts: list of FactRule
FactRule
  name, kind: BOOL_PRESENT_HEADING | BOOL_CONTAINS_PHRASE | BUCKET_WORD_COUNT | ENUM_FROM_LIST
  params (bounded), comparator rule (derived from kind)
Attestation
  attestation_id, spec_id, requested_by, facts (normalized), source_status OK|UNAVAILABLE,
  snapshot_digest (if a verified deterministic digest facility exists), round, flags
```

### 14.3 Methods
| Write method | Purpose | Access |
|---|---|---|
| create_spec | Freeze URL and fact rules | creator |
| request_attestation | Fetch, extract, reach consensus, append an attestation | anyone (rate bounded) |
| challenge_attestation | Contest with a reason; allows a new attestation round | participants |

| View method | Returns |
|---|---|
| get_spec, get_attestations, get_latest_attestation | Records and history |

### 14.4 Equivalence (P2 applied)
- Leader fetches and extracts the fixed fact list by code (heading parsing, phrase
  presence, word-count bucket); the LLM is used only for ENUM_FROM_LIST facts if needed.
- Validators re-fetch independently and extract the same facts.
- Accept when every fact matches by its rule and source_status matches.
- UNAVAILABLE is a first-class result: it is recorded as such and never as a negative
  fact.

### 14.5 Why it matters
- Other contracts (for example commitment trackers) can use attestations as evidence
  insurance against pages that change after submission.
- It demonstrates the web-evidence recipe end to end with bucketed tolerance.

---

## 15. STRETCH: RankingJudge (ONLY AFTER v1 IS DONE AND DOCUMENTED)

- Purpose: rank candidates against a rubric with P4 consensus (top-k overlap).
- Open design questions to answer in docs before coding: tie handling, candidate universe
  freezing, and whether rank distance is capped.
- Do not start it until M8 is complete.

---

## 16. ADAPTER LAYER AND IMPORT STRATEGY

The riskiest unknown: whether a deployed contract can import a local helper module.

Decision procedure
1. Read write-contract and the SDK reference on contract structure, imports, and runner
   dependencies. Record the finding in docs/contracts.md.
2. If local module imports are supported: contracts import `equivalencekit`.
3. If not: `tools/vendor.py` inlines the needed primitives into a single generated contract
   file. The generated file is committed, clearly marked "generated, do not edit", and
   covered by a test that proves the vendored functions behave identically to the package
   (same acceptance matrices run against both).
4. Either way the primitives package must remain free of GenLayer imports.

Adapter responsibilities
- Wrap primitives in verified leader and validator functions using verified GenLayer APIs.
- Keep state mutation outside the non-deterministic block unless write-contract shows a
  safe pattern.
- Pass only normalized, bounded inputs into comparators.
- Convert comparator reason codes into the classified error registry.

Verify before use: how custom leader and validator functions are declared, how validators
return agreement, how web fetch and LLM calls are made, and which standard-library
modules are available in GenVM. Never assume.

---

## 17. TIGHTNESS TESTING (THE CORE EDUCATIONAL ASSET)

Goal: prove what a rule accepts and rejects, so builders can tune it deliberately.

### 17.1 Acceptance matrix
For every pattern, a fixture file lists cases as (leader_output, validator_output, expected,
reason_code). Categories:
- MUST_ACCEPT: honest variation (reordered ids, casing, whitespace, adjacent bucket,
  one-step band, digest differences)
- MUST_REJECT: decision flips, unknown ids, out-of-range values, source-status mismatch,
  invariant violations
- BOUNDARY: values exactly on every tolerance edge and one unit beyond

The same matrix runs against the primitives, the vendored copy (if any), and the contract
adapter in direct tests.

### 17.2 Perturbation generators (mutation testing for equivalence)
Deterministic functions that take a valid output and produce variants:
- harmless: shuffle ids, change case, add whitespace, change digest text, shift a value
  within tolerance
- harmful: flip the enum, add an unknown id, push a value past tolerance, drop a required
  key, add a forbidden verdict
Run every generator across every pattern. Metrics to report:
- Harmless acceptance rate: must be 100 percent.
- Harmful rejection rate: must be 100 percent.
Any miss is a bug in the rule or the test.

### 17.3 Looseness and strictness report
A test helper prints, per pattern, the tolerance parameters, the number of must-accept and
must-reject cases, and the boundary cases it covers. Include this output in docs/
tightness-testing.md as evidence.

### 17.4 Integration check
Using `genlayer-test` (verify the API), run the reference contracts under real consensus
with: a clean case, an honestly noisy case, and a clearly bad leader output that must be
rejected. Keep the printed output (`-s`) as evidence.

---

## 18. DECISION GUIDE (docs/decision-guide.md)

Walk the builder through these questions in order:
1. Can validators reproduce exactly the same normalized output from the same inputs? If yes,
   strict_eq may be acceptable. If any free text, ordering noise, timestamps, or model
   variance is involved, no.
2. Is the output a decision (enum, boolean), a number, a set, or a ranking? Pick P1, P6,
   P3, P5, or P4.
3. Is it extracted from a web page or API? Add P2 and bucket volatile values.
4. What can the leader hallucinate (ids, entities, numbers)? Add `subset_of` and range
   invariants.
5. What must never change the decision? Put it in code before the model, and add
   `consistent_with` after.
6. What happens when the source is down? Define UNAVAILABLE as its own state.
7. How tight should tolerance be? Start strict, collect disagreements from real runs,
   loosen one parameter at a time, and record the change with the matrix update.
8. How will you prove it? Write the acceptance matrix before the contract.

---

## 19. CLASSIFIED ERRORS AND RULES

- All primitives and contracts use the closed error registry (section 11.2).
- Format: prefix, then a short stable reason. No timestamps, random ids, raw model output,
  or raw web content.
- Identical failures must produce identical strings on every validator (tested by running
  the same failing input twice and comparing).
- A test asserts that no error string contains digits that vary run to run.

---

## 20. LIMITS AND BOUNDS

| Item | Bound |
|---|---|
| input bytes to any parser | fixed max |
| text fields (titles, reasons) | fixed max |
| digest length | 280 chars, never compared |
| ids per list, id length, id charset | fixed max, fixed charset |
| rubric items per judgment | fixed max |
| facts per spec | fixed max |
| evidence refs per judgment | fixed max |
| challenge rounds, challenge window | fixed max / config value |
| bucket boundaries per bucketizer | fixed max |

Reject over-limit input with EXPECTED: OVER_LIMIT. No unbounded loops over storage.

---

## 21. STORAGE DESIGN RULES

- GenLayer storage types only: TreeMap for keyed records, DynArray for append-only lists,
  dataclasses with allow_storage, sized integers for counters and thresholds.
- Confirm exact names and import paths in the SDK reference.
- Rubrics, verdict sets, and fact rules are frozen at creation.
- Evidence and assessments are append-only; never overwrite history.
- Store references and short digests, not raw pages. No secrets.
- No floats anywhere in contract state or comparisons.

---

## 22. QUALITY GATES

```
1. pytest tests/primitives/ -v                          # pure primitives, no GenLayer
2. genvm-lint check contracts/<file>.py --json          # after EVERY contract change
3. pytest tests/direct/ -v                              # contracts with mocked web/LLM
4. gltest tests/integration/ -v -s                      # real consensus
5. genlayer deploy / schema / call / write / receipt    # deploy and debug loop
```
- Never say "done" until the required gates pass. Paste real, trimmed output.
- If vendoring is used, also run the vendored-equivalence test (section 16).

---

## 23. TEST PLAN

### 23.1 Primitive tests (tests/primitives, pure Python)

Normalizers
- [ ] each normalizer: valid, malformed, boundary, oversize inputs
- [ ] idempotence: normalize(normalize(x)) equals normalize(x)
- [ ] normalize_enum: casing, whitespace, punctuation, alias hits, unknown rejected
- [ ] normalize_bool: documented tokens only; ambiguous rejected
- [ ] normalize_int / normalize_ratio_bps: ranges, rounding mode, no silent float coercion
- [ ] normalize_id_list: dedupe, sort, charset, length and size caps
- [ ] normalize_url: scheme/host casing, fragment and tracking params stripped, credentials rejected
- [ ] strip_volatile: nested keys removed, non-volatile preserved
- [ ] bucketize: every boundary, one below, one above; inclusive edge semantics documented
- [ ] extract_headings: noise, nesting, aliases, duplicate headings, empty input

Comparators
- [ ] every comparator: accept, reject, and boundary cases with exact reason codes
- [ ] symmetry tests where expected; documented asymmetry where not (subset_of)
- [ ] ordinal_within: 0, 1, and 2 step distances
- [ ] int_within_bps: exactly at tolerance, one beyond, zero values, negative handling
- [ ] set_equal / overlap_at_least / topk_overlap: duplicates, order, threshold edges
- [ ] facts_match: per-fact rule dispatch, missing fact, extra fact
- [ ] consistent_with: every row of the rule table, including no-rule passthrough
- [ ] all_of: returns the first failing reason code deterministically

Parsing and errors
- [ ] parse_with_spec: valid; fenced; commentary around JSON; truncated; wrong types
- [ ] missing key, alias hit, unknown enum, out-of-range, unknown id, oversize input
- [ ] hostile strings inside JSON (instructions, control characters) are inert
- [ ] error registry closed; unknown reason code is a programming error
- [ ] error strings stable across repeated runs and free of varying digits

Property tests
- [ ] random bounded inputs never raise anything but documented classified errors
- [ ] comparators never raise on any pair of normalized valid outputs

### 23.2 Matrix tests (tests/matrices)
- [ ] every pattern has a fixture with MUST_ACCEPT, MUST_REJECT, and BOUNDARY cases
- [ ] harmless perturbation acceptance rate is 100 percent for every pattern
- [ ] harmful perturbation rejection rate is 100 percent for every pattern
- [ ] the same matrices run against the vendored copy (if used) and the adapter

### 23.3 Direct contract tests (tests/direct, mocked web and LLM)

VerdictJudge
- [ ] create_judgment freezes the verdict set, rubric, and rules; no edit path exists
- [ ] bounds enforced; unauthorized callers rejected on every restricted method
- [ ] deterministic rubric items decided in code; the LLM is not called when code decides
- [ ] forbidden verdict after a failed deterministic item is rejected
- [ ] LLM parsing failures leave state unchanged with LLM_ERROR
- [ ] state machine: every valid transition succeeds, every invalid one raises EXPECTED
- [ ] challenges append rounds; history never overwritten; window and round limits enforced

WebFactAttestor
- [ ] create_spec freezes the URL and fact rules
- [ ] heading, phrase, word-bucket, and enum facts extracted correctly on mocked pages
- [ ] unreachable source gives UNAVAILABLE, never a negative fact
- [ ] changed layout and noisy markup produce stable facts
- [ ] rate bounds and challenge rules enforced

Security
- [ ] hostile page text or evidence cannot change code-decided results
- [ ] cited ids outside the provided universe always rejected

### 23.4 Integration tests (tests/integration, real consensus)
- [ ] deploy both reference contracts
- [ ] VerdictJudge: clean case reaches agreement
- [ ] VerdictJudge: honestly noisy validator output (band shifted one step) still agrees
- [ ] VerdictJudge: clearly bad leader output (wrong enum, unknown id) is rejected
- [ ] WebFactAttestor: stable page agrees; unreachable page yields UNAVAILABLE
- [ ] challenge and re-evaluation round trip
- [ ] read calls reflect written state; save `-s` output as evidence

Keep real LLM calls few; use short, unambiguous inputs.

---

## 24. THREAT MODEL (docs/threat-model.md)

| Threat | Defense |
|---|---|
| Leader hallucinates ids or entities | subset_of against the provided universe |
| Leader returns an out-of-range value | range invariants in parse_with_spec |
| Prompt injection inside evidence or pages | DATA wrapping, schema validation, code-decided items first |
| Validators agree on garbage (rule too loose) | invariants plus harmful-perturbation tests |
| Honest validators disagree (rule too strict) | tolerance rationale plus harmless-perturbation tests |
| Source flakiness blamed as a negative finding | UNAVAILABLE as its own state |
| Evidence ordering bias | order-independent comparators, tested |
| Tolerance drift over time | parameters recorded in specs and docs, changes tied to matrix updates |
| Vendored copy diverging from the package | vendored-equivalence test |

State plainly in the docs what the kit cannot do: it cannot detect a wrong decision that
every validator makes, and it does not verify that source content is true.

---

## 25. DOCUMENTATION DELIVERABLES

| File | Must contain |
|---|---|
| README.md | Problem, who it is for, what is in the kit, quick start (install, run primitive tests, lint, direct tests), reference contract summaries, deployment links, limitations, credits |
| docs/pattern-catalog.md | P1-P6 filled with the template in section 12.2, alias tables, parameter rationale |
| docs/decision-guide.md | The questions in section 18 with examples |
| docs/tightness-testing.md | Acceptance matrices, perturbation generators, the looseness and strictness report output |
| docs/anti-patterns.md | A gallery of bad rules (too loose, too strict) each paired with a failing test and the fix |
| docs/contracts.md | VerdictJudge and WebFactAttestor: purpose, state, methods, how consensus is used, import strategy finding |
| docs/threat-model.md | Section 24 expanded |
| Contract docstrings | Purpose, why GenLayer, each public method (inputs, outputs, errors), a WHY comment at every equivalence choice |

The anti-pattern gallery is the most reader-valuable file: show the broken rule, the input
that exposes it, and the corrected rule.

---

## 26. DEPLOYMENT AND NETWORKS

- `genlayer network set` for built-in networks; never override RPC manually.
- StudioNet is gasless; deploy there first (0 GEN is expected).
- Bradbury and Asimov need funded accounts; the faucet is browser-based, so ask the user to
  claim, then continue.

Flow: all gates green; set the network; deploy each reference contract; record addresses;
`genlayer schema <address>` saved to deployments/; read call; write call;
`genlayer receipt <txHash> --stdout --stderr`; locate each tx in the explorer.

Deployment record (fill every time, per contract):
```
NETWORK / CONTRACT FILE / ADDRESS / DEPLOY TX / EXPLORER LINK
SCHEMA SAVED AT / FIRST READ RESULT / FIRST WRITE TX / RECEIPT STATUS / DATE
```
Debug a failed tx in order: receipt with stdout and stderr, schema, code, read calls, then
reproduce in a direct test before changing code.

---

## 27. SUBMISSION CHECKLIST (INTELLIGENT CONTRACTS CATEGORY)

- [ ] Standalone contracts and a pure primitives package; no frontend
- [ ] Readable source with docstrings and a clear purpose statement
- [ ] Explanation of how consensus is used (docs/contracts.md and the pattern catalog)
- [ ] Custom leader and validator logic with invariant checks, not format-only checks
- [ ] Clear state design and state machines for the reference contracts
- [ ] Acceptance matrices and perturbation tests prove tightness and looseness
- [ ] Anti-pattern gallery with failing tests
- [ ] Direct tests with mocked web and LLM; integration tests exercising consensus
- [ ] Deployed on a public network with explorer links; schemas saved
- [ ] Reusable beyond a demo: other builders can adopt primitives and patterns directly
- [ ] No thin-wrapper, hello-world, simple-storage, or boilerplate-fork patterns
- [ ] Import strategy decision documented (direct import or vendored build)
- [ ] If it grows into a full app, submit under Projects; a major update to an accepted
      project goes under Milestones

---

## 28. ANTI-PATTERNS (FOR THIS REPOSITORY)

NEVER:
1. Import GenLayer modules inside the primitives package.
2. Use floats in comparators, tolerances, or contract state.
3. Compare explanations, digests, or free text in consensus.
4. Ship a comparator without reject tests and boundary tests.
5. Loosen a tolerance without updating the acceptance matrix and the rationale.
6. Treat an unreachable source as a negative fact.
7. Let a model-supplied id, entity, or number through without universe and range checks.
8. Return error strings containing timestamps, random ids, raw model output, or raw page text.
9. Edit a vendored generated file by hand.
10. Make the reference contracts toy demos with no real state or lifecycle.
11. Use strict_eq on free-form LLM text.
12. Use raw dict/list in storage or an unpinned Depends header.
13. Guess GenLayer API names, import paths, or standard-library availability in GenVM.
14. Skip genvm-lint after a contract change, or claim success without running the gates.
15. Invent explorer links, hashes, or test output.

---

## 29. MILESTONES AND SESSION WORKFLOW

| # | Milestone | Evidence |
|---|---|---|
| M1 | Research note: equivalence docs, import strategy finding, verified leader/validator API shape | docs/contracts.md |
| M2 | Normalizers, bounds, errors with full primitive tests | pytest output |
| M3 | Comparators with accept, reject, boundary tests | pytest output |
| M4 | Parsing (`parse_with_spec`) with hostile-input tests | pytest output |
| M5 | Pattern specs P1-P6 and acceptance matrices; perturbation generators | matrix test output |
| M6 | VerdictJudge contract; lint clean; direct tests green | lint and pytest output |
| M7 | WebFactAttestor contract; lint clean; direct tests green | lint and pytest output |
| M8 | Integration tests under real consensus for both contracts | gltest output |
| M9 | Deployed on StudioNet; schemas saved | addresses, schemas |
| M10 | Deployed on Bradbury or Asimov; explorer links | explorer links |
| M11 | Docs: catalog, decision guide, tightness report, anti-pattern gallery, README | docs reviewed |
| M12 | Stretch: RankingJudge (only after M11) | tests and docs |

Each session:
1. Classify the task; pick ONE milestone; confirm tools and network; verify unfamiliar APIs.
2. Write the acceptance matrix BEFORE the comparator or contract change it covers.
3. Load write-contract before contract work; lint after every contract change.
4. Commit small; update docs in the same session as code.
5. End: run required gates, record deployment details, update milestone status, append to
   CHANGELOG.md, produce the final report, leave the repo runnable.

```
## <date>
DONE: / PROOF: / NEXT: / BLOCKED:
```

Blocked states: say what is blocked, why, and the exact next command or manual step (no
testnet GEN: user claims at the faucet; no LLM provider: user sets the key in `.env`; MCP
unreachable: use the full docs text and SDK reference; unknown API: query docs, never
guess).

---

## 30. FINAL REPORT FORMAT

```
SUMMARY: <2 sentences>
MILESTONE: <id and status>
CHANGED: <files>
GATES: primitives / lint / direct / integration results
TIGHTNESS: <harmless acceptance rate, harmful rejection rate, patterns covered>
EQUIVALENCE DESIGN: <short paragraph on what changed or was confirmed>
DEPLOYMENT: <network, addresses, explorer links, or not deployed>
PROOF: <test output, tx links>
BLOCKED: <exact blocker and next command or manual step>
UNVERIFIED ASSUMPTIONS: <none for GenLayer APIs>
NEXT: <single next step>
```
No marketing language, no invented links or hashes, state failures plainly.

---

## 31. FINAL CHECKLIST

- [ ] Every GenLayer API and GenVM library availability verified, none guessed
- [ ] Primitives pure: no GenLayer imports, no floats, no clock, no randomness
- [ ] Every normalizer idempotent and bounded; every comparator returns a reason code
- [ ] Every pattern has a filled spec and an acceptance matrix
- [ ] Harmless perturbations 100 percent accepted; harmful perturbations 100 percent rejected
- [ ] Closed error registry; stable error strings across validators
- [ ] Pinned Depends header; GenLayer storage types and sized integers only
- [ ] Reference contracts have real state machines, frozen rubrics/specs, append-only history
- [ ] Deterministic checks run before the LLM; invariants enforced after
- [ ] UNAVAILABLE handled as its own state, never as a negative finding
- [ ] Import strategy documented; vendored-equivalence test passes if vendoring is used
- [ ] genvm-lint clean; primitive, matrix, direct, and integration tests pass
- [ ] Deployed via `genlayer network set`; schemas saved; explorer links recorded
- [ ] README, catalog, decision guide, tightness report, anti-pattern gallery complete
- [ ] No secrets committed; changelog entry and final report written

---

End of AGENTS.md. When in doubt: verify, test the edges, document, prove.
