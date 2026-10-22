# EquivalenceKit — Loop State

## Current state

- Pass: 8
- Current milestone: M8 (integration tests, blocked mid-run) — next actionable is M9 StudioNet
  deployment with saved schemas, or finish M8 when integration runs are wanted again
- Last completed milestone: M11 — full documentation set
- Stall counter: 0
- Last scores: 230 tests passed (58 primitives, 146 matrices+direct+vendored, 26 direct);
  3 contracts lint clean; vendor fresh; tightness 60/60 harmless accepted, 60/60 harmful
  rejected

## Tooling

git, Python 3.10/3.12, pytest 9.1.1, genvm-lint 0.11.0, genlayer-test 0.1.2, genlayer CLI
0.39.2, docs access, Docker, StudioNet all verified. Direct mode and StudioNet
deploy/write/read proved on a probe contract.

## Verified-API ledger (new findings this pass)

| Item | Source | Status |
|---|---|---|
| Web response is `Response(status, headers, body)`, not `.status_code` | installed pinned SDK; direct tests caught the docs mismatch | VERIFIED |
| StudioNet real consensus: accept case = 3 "agree" votes, status 5 (ACCEPTED); reject case = 3 "disagree" votes, status 6 (UNDETERMINED), leader state write rolled back | raw receipts from `tests/integration/test_consensus_probe.py` | VERIFIED |
| `gltest.assertions.tx_execution_succeeded` inspects ONLY the leader receipt — it returns True even when every validator disagrees. Use validator votes + persisted state instead. | receipt comparison, accept vs reject | VERIFIED |
| `get_contract_factory(contract_file_path=...)` is relative to the contracts dir, so `fixtures/consensus_probe.py` works; `contracts/fixtures/...` does not | integration run | VERIFIED |
| Real-LLM consensus and challenge/re-evaluation reach agreement on StudioNet (~76s) | `test_llm_consensus_challenge_and_re_evaluation` | VERIFIED |
| Live `example.com` has no `<h1>` and says "documentation examples", not "illustrative examples" | live fetch during M8 | VERIFIED |
| Earlier ledger (header, storage, `__init__` required, web, LLM, direct mode) | docs + probes + tests | VERIFIED |

## Latest evidence

```text
$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
230 passed in 1.05s

$ genvm-lint check contracts/{verdict_judge,web_fact_attestor,fixtures/consensus_probe}.py
all ok:true

$ python3.12 tools/vendor.py --check
vendor fresh

$ python3.12 tools/tightness.py
Harmless acceptance: 60/60
Harmful rejection: 60/60

StudioNet (2026-10-22):
  test_deterministic_consensus_and_reads .............. PASSED (36s)
  test_llm_consensus_challenge_and_re_evaluation ...... PASSED (76s)
  test_real_page_consensus_unavailable_and_challenge_round_trip ... PASSED (74s)
```

## Completed this pass

- M11 docs: `docs/pattern-catalog.md`, `docs/decision-guide.md`,
  `docs/tightness-testing.md`, `docs/anti-patterns.md` (16 anti-patterns, each paired with
  the input that exposes it and the fix), `docs/threat-model.md` (15 threats + explicit
  "cannot defend" section), `README.md`, `CHANGELOG.md`, `.env.example`.
- `contracts/fixtures/consensus_probe.py` + `tests/integration/test_consensus_probe.py`.
- `tests/integration/helpers.py` with `assert_agreed` / `assert_rejected` / `assert_undetermined`
  built on validator votes.
- Fixed all three integration test files to assert on consensus votes instead of the
  leader-only `tx_execution_succeeded`.

## Open gaps

1. M8 integration suite not fully re-run since the assertions were rewritten (the run was
   interrupted at the user's request; individual tests had already passed).
2. Integration tests fail when run without `--network studionet` — they need a marker or
   skip guard so a default local run does not report 4 failures.
3. `unicodedata` at GenVM runtime is now confirmed indirectly: `normalize_text` runs in the
   code-decided StudioNet path and in live page extraction.
4. M9 StudioNet deployment addresses and saved schemas not recorded yet.
5. M10 testnet deployment is a hard stop until the user funds an account at the faucet.
6. M12 RankingJudge stretch only after M8/M9.

## Next step

Either finish M8 (re-run the full integration suite with the new vote-based assertions, and
add a `--network studionet` skip guard so local runs stay green), or start M9: deploy both
reference contracts to StudioNet, save `genlayer schema` output to `deployments/`, and record
addresses and explorer links.
