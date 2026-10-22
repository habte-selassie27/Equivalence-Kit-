# Tightness Testing

Equivalence rules are the most dangerous part of a GenLayer contract because their failure
modes are silent:

- A rule that is **too loose** lets validators agree on garbage. Consensus succeeds, and the
  wrong answer is finalized permanently.
- A rule that is **too strict** makes honest validators disagree. The transaction never
  finalizes, or rotates leaders until it fails.

Both failures look like "the system works" from the outside: no exception, no revert. The
only way to know which one you have is to test the rule directly.

**Tightness testing** is that test. It proves what a rule accepts and rejects, so you can
tune it deliberately instead of guessing.

## 1. Acceptance matrices

Every pattern ships a fixture in `tests/matrices/<PATTERN>.json`. Each case is a tuple of
`(leader_output, validator_output, expected, reason_code)` in three categories:

| Category | What it covers | Required rate |
|---|---|---|
| `MUST_ACCEPT` | Honest variation: reordered ids, casing, whitespace, adjacent buckets, one-step band shift, differing digest prose | 100% accepted |
| `MUST_REJECT` | Decision flips, unknown ids, out-of-range values, source-status mismatch, invariant violations | 100% rejected |
| `BOUNDARY` | Values exactly on every tolerance edge and one unit beyond | 100% as specified |

The same matrix runs against three targets, so the deployed rule cannot drift from the
documented one:

1. the pure primitives (`equivalencekit/`),
2. the **vendored** copy inlined into the contract (`tests/matrices/test_vendored.py`),
3. the contract adapter in direct mode (`tests/direct/`).

## 2. Perturbation generators (mutation testing for equivalence)

A hand-written matrix can miss cases. `equivalencekit/perturb.py` generates variants
systematically: take a valid output, perturb it, and require the rule to react correctly.

**Harmless perturbations** (the rule must still accept — 100% acceptance required):

| Perturbation | Generator |
|---|---|
| Reorder ids | `harmless_variation` |
| Change casing / whitespace | `harmless_variation` |
| Swap bool for a bool token (`true` → `"yes"`) | `harmless_variation` |
| Move a value within tolerance | `harmless_variation` |
| Reorder facts / entities | `harmless_variation` |
| Change digest prose | `harmless_variation` |
| Add a duplicate entity | `harmless_variation` |

**Harmful perturbations** (the rule must reject — 100% rejection required):

| Perturbation | Generator |
|---|---|
| Flip an enum or boolean | `harmful_variation` |
| Push a value far past tolerance | `harmful_variation`, `push_value_beyond` |
| Cite an id that was never provided | `hallucinate_id` |
| Add a hallucinated fact | `harmful_variation` |
| Inject instructions into the output | `inject_instruction` |

Any miss is a bug in the rule or in the test.

## 3. The report

```bash
python3.12 tools/tightness.py
```

Real output from this repository (2026-10-22):

```text
EquivalenceKit tightness report
===============================
P1: cases=16 (accept=6, reject=6, boundary=4)
    harmless accepted 10/10; harmful rejected 10/10
P2: cases=18 (accept=6, reject=6, boundary=6)
    harmless accepted 10/10; harmful rejected 10/10
P3: cases=18 (accept=6, reject=6, boundary=6)
    harmless accepted 10/10; harmful rejected 10/10
P4: cases=18 (accept=6, reject=6, boundary=6)
    harmless accepted 10/10; harmful rejected 10/10
P5: cases=18 (accept=6, reject=6, boundary=6)
    harmless accepted 10/10; harmful rejected 10/10
P6: cases=18 (accept=6, reject=6, boundary=6)
    harmless accepted 10/10; harmful rejected 10/10
Total: 106 matrix cases
Harmless acceptance: 60/60
Harmful rejection: 60/60
```

**Harmless acceptance: 60/60 (100%). Harmful rejection: 60/60 (100%).** Both must hold for
every pattern. A single miss is a defect, not a tuning knob.

## 4. Reading the numbers

| Observation | Diagnosis | Action |
|---|---|---|
| Harmless acceptance < 100% | Rule is **too strict** | Honest validators would disagree. Loosen the one responsible parameter and update the matrix. |
| Harmful rejection < 100% | Rule is **too loose** | Validators would agree on garbage. Tighten the rule; do not touch the matrix to make it pass. |
| Both 100% but a real run disagrees | The perturbations do not model reality | Add a perturbation that reproduces the real disagreement. |

## 5. Rules

- **Never weaken a matrix to make a test pass.** If a case fails, the rule is wrong (or the
  case is documenting a real bug). Investigate, then change one of them deliberately.
- A tolerance change without a matrix update is a rejected change.
- A comparator without reject tests is not shippable.
- Keep the perturbation generators deterministic (seeded `random.Random`), so a failure
  reproduces exactly.

## 6. What this cannot prove

Tightness testing proves the rule behaves as specified on the cases you generate. It cannot
prove that the specification itself is correct, and it cannot catch a wrong answer that
*every* validator shares. That is a property of the underlying model and data, not of the
comparison — see `docs/threat-model.md`.
