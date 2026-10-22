# Equivalence Decision Guide

This is the set of questions to answer **before** writing any non-deterministic GenLayer
logic. Work through them in order; the answers determine your pattern and your tolerance
parameters. Then write the acceptance matrix before you write the comparator — the matrix is
the specification.

## 1. Can validators reproduce the same normalized output?

If validators can reproduce *exactly* the same normalized output from the same inputs, plain
equality may be fine. If any free text, ordering noise, timestamps, model variance, or live
web data is involved, equality is wrong: honest validators will disagree and the transaction
will never reach consensus.

> EquivalenceKit never uses equality on free-form LLM text or raw web output.

## 2. What kind of output is it?

| Output | Pattern | Notes |
|---|---|---|
| A decision among labels, plus confidence | **P1** Verdict plus band | Compare the verdict exactly; allow one band step |
| A single yes/no about the world | **P6** Boolean attestation | Booleans have no tolerance; `UNAVAILABLE` is its own state |
| A structured fact set from a page/API | **P2** Fact set | One rule per fact; `UNAVAILABLE` implies no facts |
| One number with natural noise | **P3** Bounded number | Integer or basis-point tolerance; never floats |
| An ordered list of candidates | **P4** Ranking | Top-k overlap plus a candidate-universe check |
| An unordered set of entities | **P5** Entity set | Set equality or an integer overlap threshold |

## 3. Is it extracted from a live web page or API?

Add **P2** on top of whichever pattern fits the values. Bucket volatile values (counts,
dates), normalize headings with the documented alias table, and treat a failed fetch as
`UNAVAILABLE` — never as a negative finding.

See `contracts/web_fact_attestor.py` for a complete worked example.

## 4. What can the leader hallucinate?

The leader can invent ids, entities, and numbers. Constrain it:

- **Ids** → `subset_of(cited_ids, provided_ids)`: every cited id must come from the
  universe you supplied. This is the key anti-hallucination invariant.
- **Numbers** → range invariants inside `parse_with_spec` (`min`, `max`).
- **Enums** → reject unknown values with `UNKNOWN_ENUM`; never "snap to the closest label".

A comparator that cannot reject garbage is a bug. Every comparator ships with reject tests.

## 5. What must never change the decision?

Anything that must never change the decision belongs **in code, before the model is asked**,
and checked again **after** consensus as an invariant.

In `contracts/verdict_judge.py`, deterministic rubric items are decided in code first. If
they leave exactly one allowed verdict, the contract writes the assessment without calling
the model at all. Otherwise the model is consulted and `consistent_with` re-checks the result
against the deterministic checks, so a forbidden verdict can never be accepted.

## 6. What happens when the source is down?

Define `UNAVAILABLE` as its own first-class state with empty facts/evidence. Downstream
consumers treat it as "insufficient evidence", never as "the answer is no".

This distinction matters: a flaky page that one validator could not reach is not evidence
that the page lacks a heading.

## 7. How tight should the tolerance be?

Start strict, then loosen one parameter at a time:

1. Begin with the tightest plausible rule.
2. Collect real disagreements from actual runs (see `tests/integration/`).
3. Ask whether the disagreement was *honest variation* or *a wrong answer*.
4. Loosen the single parameter that would have accepted the honest variation.
5. **Update the acceptance matrix and the rationale in the same commit.** A tolerance change
   without a matrix update is not allowed.

Use the tightness harness to measure the result:

```bash
python3.12 tools/tightness.py
```

It reports, per pattern, the case counts and the harmless-accept / harmful-reject rates.
Both must be 100%.

## 8. How will you prove it?

Write the acceptance matrix **before** the contract. Three categories, every time:

- **MUST_ACCEPT** — honest variation: reordered ids, casing, whitespace, adjacent buckets,
  one-step band shifts, differing digest prose.
- **MUST_REJECT** — decision flips, unknown ids, out-of-range values, source-status mismatch,
  invariant violations.
- **BOUNDARY** — values exactly on every tolerance edge and one unit beyond.

The matrix lives in `tests/matrices/<PATTERN>.json` and runs against the primitives, the
vendored copy inside the contract, and the contract adapter.

## Worked examples in this repository

| Question | Where it is answered |
|---|---|
| Verdict + band + anti-hallucination + invariants | `contracts/verdict_judge.py` |
| Web fact extraction with `UNAVAILABLE` | `contracts/web_fact_attestor.py` |
| Acceptance matrices per pattern | `tests/matrices/P1.json` … `P6.json` |
| Perturbation (mutation) testing of the rules | `equivalencekit/perturb.py`, `tests/matrices/test_matrices.py` |
| Tightness report | `tools/tightness.py`, `docs/tightness-testing.md` |
| Broken rules paired with their fixes | `docs/anti-patterns.md` |
