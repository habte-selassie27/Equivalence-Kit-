# Changelog

All notable changes to EquivalenceKit are recorded here. Format follows Keep a Changelog.

## [Unreleased]

### Fixed — M14 security audit of the three reference contracts

A senior audit of `verdict_judge`, `web_fact_attestor`, and `ranking_judge` found one
HIGH and five MEDIUM issues, plus a set of design and maintainability items. All P0, P1,
and P2 findings are fixed; the P3 items are fixed where they were free.

- **HIGH — `ranking_judge` discarded submitted evidence.** The reference text was
  validated and then dropped; the model received only identifiers (`ev0-0`) as its data,
  so the contract performed non-deterministic evaluation with no evidence. The evidence is
  now stored as a record and rendered into the prompt, and a sentinel-prompt test proves
  it reaches the model.
- **MEDIUM — `ranking_judge` declared round and history caps it never enforced.** Now
  enforced on the round count; `get_config()` reports only limits that are enforced.
- **MEDIUM — `ranking_judge` permitted a vacuous equivalence rule.** `min_overlap_pct = 0`
  accepted two completely disjoint rankings; there is now a floor of 1 percent.
- **MEDIUM — `web_fact_attestor` accepted any URL.** HTTPS is now required and literal
  loopback, link-local, and private hosts are rejected, so a spec creator cannot aim the
  validators at their own network or at cloud instance metadata.
- **MEDIUM — `web_fact_attestor` stored a leader-supplied, unverified digest under a name
  that overstated it.** Renamed to `leader_snapshot_digest` and documented as the leader's
  own fingerprint, never compared.
- **MEDIUM — `web_fact_attestor` rounds were griefable and unattributable.** Only the spec
  creator or the previous requester may open a later round.
- **MEDIUM — `verdict_judge.evaluate` also accepted a CHALLENGED judgment**, making
  `re_evaluate` redundant. `evaluate` now requires OPEN.
- **MEDIUM — `ranking_judge.challenge` was creator-only** while `submit_evidence` was
  permissionless. Evidence submitters may now challenge, matching `verdict_judge`.
- **LOW — `verdict_judge.submit_evidence` relied on the SDK's write-through behaviour**
  for a nested `DynArray`. It now uses `copy_to_memory` plus an explicit write-back, like
  every other method.
- **LOW — `ranking_judge` duplicated its consensus block** in `rank` and `re_rank`. Both
  now call one `_rank(ranking_id, require_challenged)` helper.
- **LOW — the post-consensus fact check compared the agreed facts with themselves.** A
  dedicated `validate_facts(facts, rules)` primitive now expresses the intent.
- **LOW — `verdict_judge` spent a consensus round when every verdict was forbidden.** It
  now fails with `EXPECTED: INVALID_STATE` before asking the model.
- **HIGH — `ranking_judge` passed its human-facing digest into the P4 schema check.** The
  pattern's field set is `("ranking",)`, so every validator failed with `UNEXPECTED_FIELD`
  before the overlap rule ran and a ranking round could never finalize. Direct tests missed
  it because direct mode executes the leader only; the live StudioNet round exposed it. The
  digest is now stripped at the call site, and a validator-level direct test covers it
  (anti-pattern A23).

New in this pass:
- `equivalencekit/compare.py::validate_facts`: shape and range validation of one fact set,
  which never claims to compare two sets. Covered by the vendored-equivalence gate.
- `tests/integration/test_ranking_judge_consensus.py`: RankingJudge under real consensus.
- `tests/deploy/test_studionet_deployment.py` now also deploys RankingJudge.
- `docs/anti-patterns.md`: six new entries (A17–A22) for the audit findings.
- `docs/threat-model.md`: seven new threats (T16–T22) and four new residual risks.

### Changed — a bucket fact holds the raw measurement

A `BUCKET_WORD_COUNT` fact now stores the **raw word count**, not the bucket index. The
comparator buckets both sides under the rule's edges, which is what lets two fetches that
differ by a few words still agree — and it keeps the stored fact informative. Previously the
contract stored the index while `bucket_adjacent` (which buckets both sides) expected a
measurement, so the two disagreed about what a bucket fact meant.

Stored facts are now canonical in general: a boolean is `True`/`False`, an enum is the
canonical label, a bucket is the raw integer measurement. The model may return `"yes"` or
`"pro"`; what reaches storage is the normalized value, so a consumer never has to handle
two shapes. `equivalencekit/compare.py::normalize_facts` does the work and
`validate_facts` is the non-throwing wrapper.

### Changed — StudioNet tests no longer need a local node

`gltest`'s `ContractFactory.deploy` asks the *local* node to synthesize a schema from the
contract source, and `gen_getContractSchemaForCode` is a localnet-only capability. The
StudioNet tests now deploy the transaction and fetch the schema of the deployed address
from the hosted API (`gen_getContractSchema`), so they no longer depend on a local node
running. See `tests/helpers.py::deploy_contract`.

### Added — M1 research and verified API ledger
- `docs/contracts.md`: verified GenLayer API ledger (header format, storage classes,
  non-determinism API, web access, LLM calls) with the single-file import-strategy finding.

### Added — M2 normalizers, bounds, errors
- `equivalencekit/normalize.py`: `normalize_text`, `normalize_enum`, `normalize_bool`,
  `normalize_int`, `normalize_ratio_bps`, `normalize_id_list`, `normalize_url`,
  `strip_volatile`, `bucketize`, `extract_headings`, `normalize_ws_lines`. All idempotent,
  bounded, and float-free.
- `equivalencekit/bounds.py`: centralized limits and `require_within`.
- `equivalencekit/errors.py`: closed error registry (`EXPECTED` / `EXTERNAL` / `TRANSIENT` /
  `LLM_ERROR`) producing stable, byte-identical strings.

### Added — M3 comparators
- `equivalencekit/compare.py`: `enum_equal`, `ordinal_within`, `int_within_abs`,
  `int_within_bps`, `bucket_adjacent`, `set_equal`, `subset_of`, `overlap_at_least`,
  `topk_overlap`, `facts_match`, `consistent_with`, `all_of`. Each returns a stable reason
  code; accept, reject, and boundary tests for every one.

### Added — M4 defensive parsing
- `equivalencekit/parsing.py`: `parse_with_spec` with fail-closed schema validation —
  size cap, fence stripping, guarded JSON, required keys, type checks, enum/range checks,
  id-universe checks. Hostile-input tests included.

### Added — M5 patterns, matrices, perturbation
- `equivalencekit/patterns.py`: declarative specs and comparators for P1–P6.
- `tests/matrices/P1.json` … `P6.json` and `canonical.json`.
- `equivalencekit/perturb.py`: seeded harmless and harmful perturbation generators, plus
  `inject_instruction`, `push_value_beyond`, `hallucinate_id`.
- `tools/tightness.py`: per-pattern tightness report.
- Evidence: 106 matrix cases, harmless acceptance 60/60, harmful rejection 60/60.

### Added — M6 VerdictJudge
- `contracts/verdict_judge.py`: P1 consensus with frozen rubrics, deterministic rubric
  checks decided in code before any model call, append-only assessment history, and the
  `OPEN → EVALUATED → CHALLENGED → … → CLOSED` state machine.
- `tools/vendor.py`: AST-based inlining of the pure primitives into a single contract file,
  with a `--check` freshness mode.
- `tests/matrices/test_vendored.py`: proves the vendored copy behaves identically to the
  package on a broad input sample.

### Added — M7 WebFactAttestor
- `contracts/web_fact_attestor.py`: P2 consensus over a frozen fact spec. Headings, phrases,
  and word-count buckets are extracted in code; only `ENUM_FROM_LIST` consults a model.
  `UNAVAILABLE` is a first-class state that is never recorded as a negative finding.
- `equivalencekit/digest.py`: bounded, deterministic, **non-cryptographic** FNV-1a snapshot
  digest, stored for audit and never compared.

### Added — M8 integration tests
- `tests/integration/`: StudioNet tests for both reference contracts — deterministic
  code-decided consensus, real-LLM consensus, challenge and re-evaluation, live page fetch,
  `UNAVAILABLE` on a missing page.
- `contracts/fixtures/consensus_probe.py`: test-only contract proving under real consensus
  that the P1 rule accepts honest one-step band noise and rejects a wrong verdict.
- `tests/helpers.py`: consensus assertions built on validator votes.

### Fixed — M7/M8
- `WebFactAttestor` used `response.status_code` from prose documentation; the pinned SDK
  defines `Response(status, headers, body)`. The contract recorded `UNAVAILABLE` for every
  fetch until direct tests caught it. Recorded in `docs/contracts.md`.
- `gltest.assertions.tx_execution_succeeded` inspects only the *leader* receipt, so it
  returned `True` for a transaction where every validator voted `disagree`. All integration
  and deployment tests now assert on validator votes and on whether the state write
  persisted.
- `tests/conftest.py` skips the live-network test directories unless `--network` names a
  live network, so a plain `pytest tests/` run stays green.

### Added — M9 StudioNet deployment
- `tests/deploy/test_studionet_deployment.py`: deploys both reference contracts, exercises
  each with real reads and real consensus writes, saves `genlayer schema` output, and writes
  `deployments/studionet.md`.
- `deployments/studionet.md`: VerdictJudge `0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a`,
  WebFactAttestor `0xAeA5d7626807B1821837313cED685d97F73eA80D`. StudioNet is gasless: 0 GEN.
- `tools/export_site_data.py`: generates the playground's data from the repo (pattern specs,
  matrices, canonical examples, tightness report) with a `--check` staleness gate.

### Fixed — M9
- The `genlayer` CLI cannot pass a JSON-string parameter that looks like an array: its
  `--args` parser runs `JSON.parse` and encodes the result as a contract array instead of a
  string. Recorded in `docs/contracts.md`; the deployment uses the genlayer-test client,
  which encodes strings correctly.

### Added — M-UI playground (optional companion)
- `tools/export_site_data.py`: generates the playground's data from the repo (pattern specs,
  acceptance matrices, canonical examples, tightness report) with a `--check` staleness gate.
- `tools/copy_pkg.mjs`: copies the real `equivalencekit` package into `playground/public/pkg/`
  so the browser runs the same primitives the contracts run.
- `playground/`: static Vite + React + TypeScript site with four screens (Patterns,
  Playground, Tightness, Decision guide) and a Pyodide worker. 41 tests pass, including a
  Pyodide engine test that runs every matrix case in the browser's wasm Python and proves
  the precomputed results match the package.
- `playground/src/data/*`: generated site data (9 files), committed and staleness-checked.
- `tests/site/` (planned) left as a TODO; the staleness check runs via
  `tools/export_site_data.py --check`.

### Changed — M-UI visual polish pass
- Same token palette (UI.md 3.3), same restraint rules — radius 2/6, one border weight,
  elevation reserved — but sharper execution everywhere: hairline internal rules
  (`--rule-soft`), hatched perturbation-bar remainder, uppercase table kickers, row-hover
  states, focus rings on every control, text-wrap balance for headings.
- Motion, all disabled under `prefers-reduced-motion`: one screen entrance per navigation,
  loading-dot pulse, toast and bar-fill transitions, pattern-list and guide-option hover
  feedback, rotating boundary-disclosure caret.
- Optional dark scheme now ships with a manual override: one dark token block on
  `[data-theme="dark"]` (no duplicated media-query copy to drift out of step), stamped
  before first paint by an inline bootstrap, plus a header cycle control
  (Auto → Light → Dark) with `localStorage` persistence and OS-preference following
  while in Auto. A tokens test pins that the dark block covers every theme-dependent
  token and never invents one. `color-scheme` and `theme-color` are kept in step at
  runtime. Contrast for all text roles re-checked against the dark surfaces.
- Shell: translucent sticky header with blur, tighter toolbar selects that size to
  content, inline SVG favicon echoing the two track markers.
- Playground: 58 tests green, typecheck and production build clean after the pass.

### Fixed — M-UI playground conformance pass
- Engine boot: the Pyodide worker wrote package files to URL-shaped filesystem paths and
  returned raw JSON strings to the main thread. Package files now mount under a clean
  `/lib` path and every response is parsed to a structured result; the engine reaches
  "Engine ready" and live per-field ledgers render.
- Status honesty: a failed engine reply during warm-up now moves the status line to
  "Using precomputed results" instead of sitting on "Loading the engine" forever, with a
  Retry affordance. Free-form runs are disabled while failed (stored results still shown).
- Tracebacks never leak: worker error classification strips frames and keeps only the
  final exception line; playground error notices use the copy deck (classified codes,
  timeout line, engine-failed line).
- Parameters: `export_site_data.py` now emits the canonical context plus structured
  per-case variance instead of pipe-joined dumps; SpecSheet and the tightness report
  phrase parameters in plain terms ("within 100 or 10000 basis points"), with exercised
  variance shown per case.
- Patterns screen: list-and-spec layout with URL-persisted selection, a field-rule
  column, and the matrix provably beside the spec.
- Playground: case dropdown grouped must-accept/must-reject/boundary; editable context
  editor (universes, tolerances, code-decided results); bounded seed input; editor size
  shown against the cap; screen-reader result announcements; richer "copy as test case"
  payload (expected, reason, context, pattern).
- Tightness report: harmful bars now read "rejected/accepted" correctly (they could say a
  harmful variation was accepted); per-pattern parameter summaries; boundary cases link
  "Try in playground"; "How to read this" panel.
- Decision guide: rebuilt as a real stepper — one question per step, 2–4 answers, a
  running summary, hash-persisted state, and a recommendation card that links to the
  recommended pattern with the canonical example preloaded.
- Tests: 58 playground tests green (12 new), typecheck and production build clean.
- Housekeeping: regenerated vendored primitive blocks after `validate_facts` joined
  `compare.py` (the vendored-equivalence gate requires the blocks to stay fresh).

### Added — M11 documentation
- `docs/pattern-catalog.md`, `docs/decision-guide.md`, `docs/tightness-testing.md`,
  `docs/anti-patterns.md`, `docs/threat-model.md`, `README.md`, `CHANGELOG.md`.

### Added — M12 RankingJudge (stretch)
- `contracts/ranking_judge.py`: P4 consensus with frozen candidate universe, rubric, and
  ranking parameters (top-k, overlap threshold, optional rank-distance cap). State machine:
  `OPEN -> RANKED -> CHALLENGED -> RANKED (round + 1) -> ... -> CLOSED`. Append-only
  ranking history. 11 direct tests.
- Design decisions for the open questions in AGENTS.md section 15: tie handling via
  deduplication preserving first occurrence; candidate universe frozen at creation;
  rank-distance cap optional (0 = no cap).
- `docs/contracts.md`: RankingJudge section with methods, limits, and design decisions.
- `README.md`: RankingJudge summary.

## Milestone status

| # | Milestone | Status |
|---|---|---|
| M1 | Research note and verified API ledger | done |
| M2 | Normalizers, bounds, errors | done |
| M3 | Comparators | done |
| M4 | Defensive parsing | done |
| M5 | Pattern specs, matrices, perturbation | done |
| M6 | VerdictJudge + vendoring + direct tests | done |
| M7 | WebFactAttestor + direct tests | done |
| M8 | Integration tests under real consensus | done |
| M9 | StudioNet deployment with saved schemas | done |
| M10 | Testnet deployment (requires funded account) | blocked on user |
| M11 | Documentation | done |
| M12 | RankingJudge stretch | done |

## 2026-10-23 — pass 15 (developer tooling)

- Added MIT `LICENSE`, `pyproject.toml` (PEP 621, `ekit` console script), `CONTRIBUTING.md`,
  `.pre-commit-hooks.yaml`, `.github/workflows/audit.yml`.
- Added `equivalencekit/audit.py` + `equivalencekit/cli.py`: `ekit audit <path> [--json]`
  runs deterministic AST checks mapped to anti-patterns A1, A3, A6, A13, A14, A15, A18, A19,
  A23, with ignore directives and vendored-block awareness. `ekit --version`.
- Added `tests/primitives/test_audit.py` (8 tests). Own code audits clean.
- README: install + audit quick start, three-contract wording, audit linter row.
