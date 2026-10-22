# EquivalenceKit Pattern Catalog (P1–P6)

A **pattern** is declarative data, not code: fields, a normalizer per field, a comparator per
field, cross-field invariants, a tolerance rationale, failure behavior, known limits, and an
acceptance matrix. The same spec drives the reference contracts, the acceptance matrices in
`tests/matrices/`, and the perturbation generators in `equivalencekit/perturb.py`.

Machine-readable copies live in `equivalencekit/patterns.py` (`PATTERNS`), and the fixture
matrices live in `tests/matrices/P1.json` … `P6.json`.

## The rules every pattern obeys

1. **Decisions over prose.** Compared fields are enums, booleans, buckets, bounded integers,
   or id sets. Free text is stored for humans and never compared.
2. **Integers over floats.** Tolerances are basis points or absolute integers, computed with
   cross-multiplication, so every validator performs the identical comparison.
3. **Fail closed.** An unknown enum, missing key, out-of-range value, or unknown id rejects
   with a stable reason code. There is no "best effort" pass.
4. **Explainability.** Every comparator returns a stable `reason` code, so a test or a
   reviewer can see exactly why a case was accepted or rejected.
5. **UNAVAILABLE is a state.** A failed fetch is never recorded as a negative finding.

## Reason codes used by the comparators

| Reason | Meaning |
|---|---|
| `OK` | The field passed |
| `ENUM_MISMATCH` | Two enum values differ after normalization |
| `UNKNOWN_ENUM` | A value is outside the allowed enum set |
| `STEP_TOO_FAR` | Ordered levels are more than N steps apart |
| `ABS_DELTA_EXCEEDED` | Absolute difference exceeds the delta |
| `BPS_DELTA_EXCEEDED` | Relative difference exceeds the basis-point tolerance |
| `BUCKET_TOO_FAR` | Values fall in non-adjacent buckets |
| `SET_MISMATCH` | Normalized sets are unequal |
| `OVERLAP_TOO_LOW` | Set overlap is below the integer threshold |
| `TOPK_MISMATCH` | Top-k overlap or rank-distance cap failed |
| `UNKNOWN_ID` | An id is outside the provided universe |
| `MISSING_FIELD` | A required key is absent |
| `UNEXPECTED_FIELD` | An undeclared key is present (fail-closed schema) |
| `WRONG_TYPE` | A value has the wrong type |
| `OUT_OF_RANGE` | A value is outside the declared range |
| `SOURCE_MISMATCH` | Leader and validator disagree on source status |
| `INVARIANT_VIOLATION` | A cross-field invariant failed |
| `FACT_MISMATCH`, `FACT_EXTRA`, `FACT_MISSING` | Per-fact set comparison failures |

---

## P1 — Verdict plus band

**Use when:** a judgment comes with confidence — eligibility, compliance, support.

**Leader produces:**

```json
{
  "verdict": "ELIGIBLE",
  "band": "MEDIUM",
  "cited_ids": ["item_a", "item_c"],
  "digest": "free prose explaining the call; never compared"
}
```

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `verdict` | `normalize_enum(verdict_set)` | `enum_equal` | yes |
| `band` | `normalize_enum(BANDS)` | `ordinal_within(max_band_steps=1)` | yes |
| `cited_ids` | `normalize_id_list` | `subset_of(provided_ids)` | yes |
| `digest` | `clip_text` | none | **no** |

`BANDS = ("LOW", "MEDIUM", "HIGH")`.

**Invariants:** `consistent_with(verdict, deterministic_checks, forbidden)` — a verdict that
the deterministic rubric forbids can never be accepted, even if every validator proposed it.

**Tolerance rationale:** models disagree about *confidence* more than about the *decision*.
One band step absorbs that honest variation without letting a decision flip. Cited ids are
order-independent, so a validator may cite them in any order. The digest is prose and always
differs between validators, so it is stored but excluded from the comparison.

**Failure behavior:** `LLM_ERROR` with a reason code; no assessment is appended and state is
unchanged.

**Why not `strict_eq`:** band ordering, id ordering, and digest wording vary honestly.
`strict_eq` on this output would reject honest validators.

**Known limits:** cannot detect a wrong verdict shared by every validator. The invariant only
guards verdicts that the *deterministic* rubric can forbid.

### Acceptance matrix (`tests/matrices/P1.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `ELIGIBLE`/`MEDIUM` | `eligible`/`MEDIUM` | accept (casing) |
| accept | `ELIGIBLE`/`MEDIUM` | `ELIGIBLE`/`HIGH` | accept (one band step) |
| accept | `cited_ids: [a, c]` | `cited_ids: [c, a]` | accept (order) |
| accept | digest `"short"` | digest `"entirely different prose"` | accept (not compared) |
| reject | `ELIGIBLE` | `INELIGIBLE` | reject `ENUM_MISMATCH` |
| reject | `MEDIUM` | `LOW` with `max_band_steps=1` | reject `STEP_TOO_FAR` |
| reject | `cited_ids: [a]` | `cited_ids: [a, ghost]` | reject `UNKNOWN_ID` |
| reject | verdict `ELIGIBLE` after `hard_income` failed | — | reject `INVARIANT_VIOLATION` |
| boundary | band `LOW` vs `HIGH` (2 steps) | | reject at `max_band_steps=1` |
| boundary | empty `cited_ids` | | accept if the spec allows it |

---

## P2 — Fact set

**Use when:** extracting a fixed set of structured facts from a web page or API.

**Leader produces:**

```json
{
  "source_status": "OK",
  "facts": {"has_pricing": true, "word_bucket": 1, "purpose": "DOCUMENTATION"}
}
```

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `source_status` | `normalize_enum(SOURCE_STATES)` | `enum_equal` | yes |
| `facts` | per-fact | `facts_match(rules)` | yes |

`SOURCE_STATES = ("OK", "UNAVAILABLE")`. Each fact carries its own rule: `bool` exact,
`enum` exact, `bucket` adjacent, or `int` within a tolerance.

**Invariants:** `UNAVAILABLE` implies the fact set is empty. A source that cannot be read
produces no facts — it never produces `false` facts.

**Tolerance rationale:** dates and counts are bucketed so that legitimate variation at a
boundary does not flip a decision; headings are matched by normalized key plus the documented
alias table. Booleans have no tolerance: a boolean either holds or it does not.

**Failure behavior:** `EXTERNAL` with `SOURCE_UNREACHABLE`; downstream treats this as
insufficient evidence, never as a negative finding.

**Why not `strict_eq`:** page markup, heading case, word counts, and fetch order vary between
validators of the same page.

**Known limits:** does not verify that the page content is *true* — only that validators read
the same facts.

### Acceptance matrix (`tests/matrices/P2.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `{"b": true, "n": 1}` | `{"b": "yes", "n": 1}` | accept (bool token) |
| accept | `word_bucket: 0` | `word_bucket: 1` | accept (adjacent bucket) |
| accept | `source_status: "OK"` | `"ok"` | accept (casing) |
| reject | `{"b": true}` | `{"b": false}` | reject `FACT_MISMATCH` |
| reject | `{"b": true}` | `{"b": true, "extra": 1}` | reject `FACT_EXTRA` |
| reject | `source_status: "OK"` | `"UNAVAILABLE"` | reject `SOURCE_MISMATCH` |
| reject | `{"b": false}` under `UNAVAILABLE` | | reject `INVARIANT_VIOLATION` |
| boundary | count exactly on a bucket edge | | accept in both runs |
| boundary | count across a bucket edge | | accept if adjacent |

---

## P3 — Bounded number

**Use when:** a score, count, price, or measurement has natural noise.

**Leader produces:** `{"value": 4200, "unit": "USD"}`

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `unit` | `normalize_enum(unit_set)` | `enum_equal` | yes |
| `value` | `normalize_int(min, max)` | `int_within_abs` or `int_within_bps` | yes |

**Invariants:** `value` inside `[min, max]`; zero is handled explicitly (a relative tolerance
against zero is exactly zero, so use the absolute mode when zero is a legal value).

**Tolerance rationale:** the tolerance is derived from observed variation and recorded as
integer basis points, never a float. Cross-multiplication keeps the comparison identical on
every validator.

**Failure behavior:** `LLM_ERROR OUT_OF_RANGE` or `WRONG_TYPE`; state unchanged.

**Known limits:** a biased source that shifts every validator in the same direction is not
detected by the tolerance alone.

### Acceptance matrix (`tests/matrices/P3.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `value: 100` | `value: 101` with `tolerance_bps=100` | accept |
| reject | `value: 100` | `value: 102` with `tolerance_bps=100` | reject `BPS_DELTA_EXCEEDED` |
| accept | `0` vs `0` | | accept |
| reject | `0` vs `1` | | reject (zero is exact) |
| boundary | value exactly at the tolerance edge | | accept |
| boundary | value one unit beyond the edge | | reject |

---

## P4 — Ranking

**Use when:** ordering candidates against a rubric.

**Leader produces:** `{"ranking": ["b", "a", "c"]}`

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `ranking` | `normalize_ranked_id_list` | `topk_overlap(k, min_overlap_pct, max_rank_distance)` | yes |

**Invariants:** every ranked id is inside the frozen candidate universe (`subset_of`).

**Tolerance rationale:** near-ties legitimately swap inside the top-k. The overlap threshold
and the optional rank-distance cap are explicit integers so the rule is tunable and provable.

**Failure behavior:** `LLM_ERROR UNKNOWN_ID` or `TOPK_MISMATCH`; state unchanged.

**Known limits:** a shared bias in candidate *selection* is invisible — the rule only grades
the ordering it is given.

### Acceptance matrix (`tests/matrices/P4.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `[a, b, c]` | `[b, a, c]` with `min_overlap_pct=66` | accept |
| reject | `[a, b, c]` | `[a, b, c]` with `min_overlap_pct=100` and a swap | reject `TOPK_MISMATCH` |
| reject | `[a, b, zz]` | | reject `UNKNOWN_ID` (universe check) |
| boundary | exactly at the overlap threshold | | accept |
| boundary | one rank crossing the cutoff | | reject |

---

## P5 — Entity set

**Use when:** extracting entities, names, or ids where order does not matter.

**Leader produces:** `{"entities": ["Acme Corp", "globex"]}`

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `entities` | `normalize_entity_list` | `set_equal` or `overlap_at_least(threshold_pct)` | yes |

**Invariants:** duplicates are removed and entities are folded before comparison.

**Tolerance rationale:** casing, whitespace, ordering, and duplicates are pure noise. The
overlap threshold is an explicit integer percentage computed with cross-multiplication.

**Known limits:** aliases not listed in the domain's alias table count as different entities.
Extend the table deliberately, with matching matrix cases.

### Acceptance matrix (`tests/matrices/P5.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `["a", "b"]` | `["B", "A ", "a"]` | accept (order/case/dupes) |
| reject | `["a", "b"]` | `["a"]` under `set_equal` | reject `SET_MISMATCH` |
| reject | `["a"]` | `["a", "intruder"]` under `overlap` | reject `OVERLAP_TOO_LOW` |
| boundary | single missing entity at the threshold edge | | reject |

---

## P6 — Boolean attestation

**Use when:** a single yes/no about the world, with evidence ids.

**Leader produces:**

```json
{
  "source_status": "OK",
  "answer": true,
  "evidence_ids": ["doc_1"]
}
```

| Field | Normalizer | Comparator | Compared |
|---|---|---|---|
| `source_status` | `normalize_enum(SOURCE_STATES)` | `enum_equal` | yes |
| `answer` | `normalize_bool` | exact boolean | yes |
| `evidence_ids` | `normalize_id_list` | `subset_of(evidence_universe)` | yes |

**Invariants:** `UNAVAILABLE` is never treated as `false`, and `UNAVAILABLE` implies no
evidence ids. Set `allow_unavailable=False` when the pattern must reject a downed source
entirely.

**Tolerance rationale:** a boolean has no tolerance. Only the source state may vary, and it is
its own first-class state.

**Known limits:** cannot detect a shared wrong belief about the world.

### Acceptance matrix (`tests/matrices/P6.json`)

| Category | Leader | Validator | Expected |
|---|---|---|---|
| accept | `answer: true` | `answer: "yes"` | accept (bool token) |
| accept | `UNAVAILABLE` + `[]` | `UNAVAILABLE` + `[]` | accept |
| reject | `answer: true` | `answer: false` | reject `ENUM_MISMATCH` |
| reject | `answer: true` | `source_status: "UNAVAILABLE"` | reject `SOURCE_MISMATCH` |
| reject | `evidence_ids: ["ghost"]` | | reject `UNKNOWN_ID` |
| boundary | `UNAVAILABLE` with non-empty evidence | | reject `INVARIANT_VIOLATION` |

---

## Decision tree

```
Free text or model prose?  -> store it, never compare it (digest / clip_text)
Decision among labels?     -> P1 (with confidence band) or P6 (plain boolean)
Structured extraction?     -> P2 (with per-fact rules)
One number with noise?     -> P3 (integer or basis-point tolerance)
Ordered candidates?        -> P4 (top-k overlap + universe check)
Unordered entities?        -> P5 (set equality or overlap threshold)
Source can be down?        -> any pattern + UNAVAILABLE as its own state
```
