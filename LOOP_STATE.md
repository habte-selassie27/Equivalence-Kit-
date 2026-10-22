# EquivalenceKit — Loop State

## Current state

- Pass: 4
- Current milestone: M5 — pattern specs P1-P6, acceptance matrices, perturbation generators
- Last completed milestone: M4 — parsing with hostile-input tests
- Stall counter: 0
- Last scores: M1 done; M2 primitives 28 passed; M3 primitives 42 passed; M4 primitives 55 passed

## Tooling

All required tools present and verified: git, Python 3.10/3.12, pytest 9.1.1, genvm-lint
0.11.0, genlayer-test 0.1.2, genlayer CLI 0.39.2, docs access, Docker, StudioNet.
Direct mode and StudioNet deploy/write/read were proved with a probe contract.

## Verified-API ledger

| Item | Source | Status |
|---|---|---|
| Pinned header, `gl.Contract`, public decorators, `__init__` required | docs first-contract + StudioNet probe | VERIFIED |
| `DynArray`, `TreeMap`, `@allow_storage`, sized ints | docs storage | VERIFIED |
| No manual `DynArray()`/`TreeMap()` construction; zero-init fields | direct-mode probe | VERIFIED |
| `gl.vm.run_nondet_unsafe`, `gl.vm.Return.calldata`, bool validator | docs non-determinism | VERIFIED |
| `gl.nondet.exec_prompt(..., response_format="json")` | docs calling-llms | VERIFIED |
| `gl.nondet.web.get/request`, `.body`, `.status_code` | docs web-access | VERIFIED |
| `gl.vm.UserError`, `gl.storage.copy_to_memory`, sender address | docs | VERIFIED |
| `json`, `re` in runner; `unicodedata` compiled into cpython.wasm | runner archive | VERIFIED (runtime probe pending) |
| StudioNet integration via `gltest --network studionet` | probe | VERIFIED |

## Import strategy

Single-file deployment; no documented sibling imports. Contracts vendor the primitives via
`tools/vendor.py`; generated files are marked and equivalence-tested. Decision recorded in
docs/contracts.md.

## Open gaps

1. Runtime probe for `unicodedata` in GenVM (first contract using it on StudioNet).
2. Verify `gl.vm.UserError` exact behavior (M6/M7 direct + integration).
3. Nested `@allow_storage` / `TreeMap` in storage classes (M6).
4. P1-P6 specs, matrices and perturbation generators not started.

## Next step

M5: write `equivalencekit/patterns.py`, `perturb.py`, JSON matrix fixtures, and matrix tests.
