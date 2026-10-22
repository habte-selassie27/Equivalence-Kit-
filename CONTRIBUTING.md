# Contributing to EquivalenceKit

## Adding a pattern

1. Add the spec to `equivalencekit/patterns.py` and the filled template to
   `docs/pattern-catalog.md`.
2. Add an acceptance matrix under `tests/matrices/` with MUST_ACCEPT, MUST_REJECT, and
   BOUNDARY cases.
3. Add perturbation coverage; `tools/tightness.py` must still report 100/100.
4. If a new primitive is needed, add it to the pure package (no GenLayer imports) with
   valid/malformed/boundary/idempotence/property tests.

## Adding a contract

1. Start from `tools/vendor.py` output so primitives are inlined.
2. Run `genvm-lint check contracts/<file>.py --json` after every change.
3. Add direct tests using `direct_vm.run_validator` for the validator path, not just the
   leader path.
4. Add an integration test under `tests/integration/`.

## Code rules

- No floats in comparators or contract state; use integers and basis points.
- No GenLayer imports in `equivalencekit/`.
- Every comparator returns a reason code; every error uses the closed registry.
- `ekit audit contracts/` must stay clean.

## Before opening a PR

```bash
python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
python3.12 tools/vendor.py --check
python3.12 tools/tightness.py
ekit audit contracts/
```
