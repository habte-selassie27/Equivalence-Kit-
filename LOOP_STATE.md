# EquivalenceKit — Loop State

## Current state

- Pass: 6
- Current milestone: M7 — WebFactAttestor contract (lint clean, direct tests green)
- Last completed milestone: M6 — VerdictJudge contract + vendored primitives + direct tests
- Stall counter: 0
- Last scores: 210 tests passed (55 primitives, 106 matrix cases, 13 direct, 31 vendored,
  plus meta tests); lint clean; tightness 60/60 harmless accepted, 60/60 harmful rejected

## Tooling

git, Python 3.10/3.12, pytest 9.1.1, genvm-lint 0.11.0, genlayer-test 0.1.2, genlayer CLI
0.39.2, docs access, Docker, StudioNet all verified. Direct mode and StudioNet
deploy/write/read proved on a probe contract.

## Verified-API ledger (new findings this pass)

| Item | Source | Status |
|---|---|---|
| `run_nondet_unsafe` returns the decoded value directly (`_lazy_api` wraps `.get()`) | installed pinned SDK | VERIFIED |
| Direct mode runs the leader only; `run_validator` replays the captured validator | gltest direct plugin | VERIFIED |
| `DynArray()` and `DynArray[T]()` are not constructible; storage records take plain lists for `DynArray` fields | probe + direct tests | VERIFIED |
| Nested `@allow_storage` records with `DynArray` fields survive append + `copy_to_memory` | VerdictJudge direct tests | VERIFIED |
| `gl.vm.UserError` messages reach `expect_revert` unchanged | VerdictJudge direct tests | VERIFIED |
| `@dataclass` needs `from dataclasses import dataclass` in contracts | lint + direct tests | VERIFIED |
| Earlier ledger (header, storage, `__init__` required, web, StudioNet) | docs + probes | VERIFIED |

## Latest evidence

```text
$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
210 passed in 0.63s

$ genvm-lint check contracts/verdict_judge.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"VerdictJudge","methods":10,...}}

$ python3.12 tools/tightness.py
Harmless acceptance: 60/60
Harmful rejection: 60/60
```

## Open gaps

1. Runtime probe for `unicodedata` in GenVM on StudioNet (M9; lint already accepts it).
2. WebFactAttestor not written yet (M7).
3. Integration tests under real consensus not written yet (M8).
4. `initialize_consensus` / leader rotation behavior under sustained disagreement not tested
   on StudioNet (M8/M9).
5. Shipper/site is out of scope; UI.md section 19 only after M11.

## Next step

M7: `contracts/web_fact_attestor.py` using P2, mocked web/LLM direct tests, lint.
