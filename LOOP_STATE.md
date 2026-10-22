# EquivalenceKit — Loop State

## Current state

- Pass: 5
- Current milestone: M6 — VerdictJudge contract (lint clean, direct tests green)
- Last completed milestone: M5 — patterns P1-P6, acceptance matrices, perturbation generators
- Stall counter: 0
- Last scores: 111 matrix+primitive tests passed; tightness 60/60 harmless accepted, 60/60 harmful rejected

## Tooling

git, Python 3.10/3.12, pytest 9.1.1, genvm-lint 0.11.0, genlayer-test 0.1.2, genlayer CLI
0.39.2, docs access, Docker, StudioNet all verified. Direct mode and StudioNet
deploy/write/read proved on a probe contract.

## Verified-API ledger (new findings this pass)

| Item | Source | Status |
|---|---|---|
| `run_nondet_unsafe(leader_fn, validator_fn)` wraps leader as `lambda _: leader_fn()`, so leader takes no args | SDK `genlayer/gl/vm.py` in pinned runner | VERIFIED |
| Returns `Lazy[T]`; consensus failure terminates the VM (no `None` sentinel) | SDK `genlayer/gl/vm.py` | VERIFIED |
| Validator receives `gl.vm.Result`; `gl.vm.Return.calldata`, `VMError`, `UserError` | SDK `genlayer/gl/vm.py` | VERIFIED |
| Direct mode runs the leader only and captures the validator; `direct_vm.run_validator(...)` replays it | gltest `direct/wasi_mock.py`, `direct/vm.py` | VERIFIED |
| `direct_vm.mock_llm(pattern, response)` and `mock_web(pattern, response)` | installed plugin | VERIFIED |
| Earlier ledger (header, storage, `__init__` required, web, StudioNet) | docs + probes | VERIFIED |

## Open gaps

1. Runtime probe for `unicodedata` in GenVM (first contract that uses it on StudioNet; M6/M7).
2. `gl.vm.UserError` exact behavior under direct + integration tests (M6).
3. Nested storage dataclasses / `DynArray` inside `@allow_storage` (M6).
4. vendor.py and equivalence test not written yet.

## Next step

M6: `tools/vendor.py`, `contracts/verdict_judge.py`, direct tests, lint.
