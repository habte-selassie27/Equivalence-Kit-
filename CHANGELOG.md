# Changelog

All notable changes to EquivalenceKit are recorded here. Format follows Keep a Changelog.

## [Unreleased]

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
