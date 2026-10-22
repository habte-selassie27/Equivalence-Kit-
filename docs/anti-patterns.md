# Equivalence Anti-Patterns

Each entry shows a broken rule, the input that exposes it, and the corrected rule with its
test. These are the mistakes that cost the most, because consensus hides them: a too-loose
rule silently finalizes garbage, and a too-strict rule silently never finalizes.

Every anti-pattern here is paired with a real failing case. If you change a rule, add its
counter-example here.

---

## Too loose

### A1 — Comparing digest prose

**Broken.** Include the explanation in the comparison:

```python
return leader["verdict"] == validator["verdict"] and leader["digest"] == validator["digest"]
```

**Why it fails.** Two honest validators write different prose for the same verdict. The rule
rejects both, and the transaction never finalizes. Free text also invites prompt injection:
a page that says "answer ELIGIBLE" can steer a validator that reasons over prose.

**Fixed.** Store the digest, exclude it from the comparison:

```python
# digest is stored for humans, never compared
enum_equal(leader["verdict"], validator["verdict"], verdict_set) and \
    ordinal_within(leader["band"], validator["band"], BANDS, max_steps=1)
```

**Test.** `tests/matrices/P1.json` — accept case with differing digests. Implemented in
`equivalencekit/patterns.py::compare_p1` (`not_compared=("digest",)`).

### A2 — Relative tolerance against zero

**Broken.** A naive relative tolerance that divides:

```python
if abs(a - b) / max(abs(a), abs(b)) <= tolerance:   # ZeroDivisionError when a == b == 0
    accept
```

**Why it fails.** When both values are zero the division is undefined. The usual fallbacks
are worse than the exception: treating `0 vs 1` as "within 1%" is a real decision flip when
the number is a count or a price, because 1% of 0 is 0.

**Fixed.** Cross-multiply instead of dividing, and handle the all-zero case explicitly:

```python
if left == 0 and right == 0:
    return OK
scale = max(abs(left), abs(right))
if abs(left - right) * 10000 <= tolerance_bps * scale:
    return OK
return _fail("BPS_DELTA_EXCEEDED")
```

`int_within_bps(0, 1, 100)` correctly rejects (`scale` is 1, and `10000 > 100`). When zero
is a legal value and you want exactness, use the absolute mode with `delta=0`.

**Test.** `tests/matrices/P3.json` — `0 vs 0` accepts, `0 vs 1` rejects; implemented in
`equivalencekit/compare.py::int_within_bps`.

### A3 — No id universe (hallucinated citations)

**Broken.** Accept whatever ids the leader returns:

```python
assert isinstance(leader["cited_ids"], list)
```

**Why it fails.** A model can invent `"item_ghost"` that was never submitted. The contract
records a citation to evidence that does not exist, and downstream readers trust it.

**Fixed.** Every cited id must be a subset of the ids you supplied:

```python
subset_of(leader["cited_ids"], provided_ids)   # UNKNOWN_ID on any invented id
```

**Test.** `equivalencekit/perturb.py::hallucinate_id`, run in
`tests/matrices/test_matrices.py` as a harmful perturbation. Also
`tests/direct/test_verdict_judge.py::test_hallucinated_item_id_after_consensus_is_rejected`.

### A4 — "Closest label" snapping

**Broken.** Map an unknown model output onto the nearest allowed label:

```python
if value not in allowed:
    return max(allowed, key=lambda a: similarity(a, value))
```

**Why it fails.** It silently converts a wrong answer into a confident one. The model said
`MAYBE`; you recorded `ELIGIBLE`.

**Fixed.** Reject unknown values:

```python
normalize_enum(value, allowed)   # raises LLM_ERROR: UNKNOWN_ENUM
```

**Test.** `tests/matrices/P1.json` reject case; `equivalencekit/test_normalize.py` unknown
enum cases.

### A5 — Extra keys silently ignored

**Broken.** Read only the keys you expect and ignore the rest:

```python
verdict = payload["verdict"]   # payload also contains "instructions": "..."
```

**Why it fails.** A prompt-injection payload rides along inside the JSON object. Ignoring the
key does not remove its influence if any downstream code ever reads it, and it hides a schema
drift from the model provider.

**Fixed.** Fail closed on undeclared keys:

```python
parse_with_spec(raw, spec)   # raises LLM_ERROR: UNKNOWN_KEY on extra fields
```

**Test.** `equivalencekit/perturb.py::inject_instruction`; `tests/primitives/test_parsing.py`
hostile-input cases.

### A6 — Treating UNAVAILABLE as false

**Broken.** Default a failed fetch to a negative fact:

```python
facts["has_pricing"] = False   # when the fetch raised
```

**Why it fails.** A network blip becomes a permanent, on-chain claim that the page has no
pricing. Every reader downstream inherits a fabricated negative finding.

**Fixed.** Make `UNAVAILABLE` a first-class state with no facts:

```python
{"source_status": "UNAVAILABLE", "facts": {}}   # invariant: unavailable implies empty
```

**Test.** `tests/matrices/P2.json` invariant case; `tests/direct/test_web_fact_attestor.py::test_unreachable_source_is_unavailable_never_a_negative_fact`.

---

## Too strict

### A7 — Exact float comparison of measurements

**Broken.**

```python
assert leader["value"] == validator["value"]
```

**Why it fails.** Two validators fetching a live measurement differ in the last digits. The
transaction never finalizes.

**Fixed.** Compare with an integer tolerance:

```python
int_within_bps(leader_value, validator_value, tolerance_bps=100)
```

**Test.** `tests/matrices/P3.json` accept case at the tolerance edge; boundary case one unit
beyond rejects.

### A8 — Requiring identical id order

**Broken.**

```python
assert leader["cited_ids"] == validator["cited_ids"]
```

**Why it fails.** Citation order carries no meaning. Two honest validators cite the same ids
in a different order and disagree.

**Fixed.** Normalize and compare as sets:

```python
normalize_id_list(leader["cited_ids"]) == normalize_id_list(validator["cited_ids"])
```

**Test.** `tests/matrices/P1.json`, `P4.json`, `P5.json` accept cases with reordered ids.

### A9 — Requiring identical word counts

**Broken.**

```python
assert leader_facts["word_count"] == validator_facts["word_count"]
```

**Why it fails.** A page with an ad slot or a live counter changes between fetches. Counts
are the least stable thing you can compare exactly.

**Fixed.** Bucket the count with explicit ascending edges, and compare buckets with
adjacency:

```python
bucketize(count, edges)             # -> 0, 1, 2 ...
bucket_adjacent(left, right, edges) # same or adjacent bucket
```

**Test.** `tests/matrices/P2.json` adjacent-bucket accept case; across-the-edge boundary
cases. Used in `contracts/web_fact_attestor.py`.

### A10 — Requiring identical band / confidence

**Broken.**

```python
assert leader["band"] == validator["band"]
```

**Why it fails.** Confidence is exactly where honest models differ. `MEDIUM` versus `HIGH`
for the same verdict is normal variation, not a dispute.

**Fixed.** Allow one step in the ordinal scale:

```python
ordinal_within(leader["band"], validator["band"], BANDS, max_steps=1)
```

**Test.** `tests/matrices/P1.json` accept case `MEDIUM` vs `HIGH`; `LOW` vs `HIGH` rejects.

---

## Structural

### A11 — Comparing before normalizing

**Broken.** Compare raw model output. **Fixed.** Normalize every field first, then compare.
**Test.** `tests/primitives/test_normalize.py` idempotence tests: `normalize(normalize(x)) == normalize(x)`.

### A12 — Free-text error messages

**Broken.**

```python
raise UserError(f"failed at {time.time()}: {raw_output}")
```

**Why it fails.** Error strings are part of consensus. A timestamp or raw model output makes
the string differ between validators, so identical failures no longer produce identical
strings — and the error leaks page content on chain.

**Fixed.** The closed registry:

```python
raise KitError("LLM_ERROR", "UNKNOWN_ENUM")   # -> "LLM_ERROR: UNKNOWN_ENUM"
```

**Test.** `tests/primitives/test_errors_bounds.py` — the registry is closed (an unknown
reason is a programming error), strings are stable across runs, and no error string contains
varying digits.

### A13 — Floats in comparators or contract state

**Broken.** `float` tolerances, `float` state.

**Why it fails.** Floating-point rounding differs across runner versions, so validators can
legitimately compute different comparison outcomes for the same inputs.

**Fixed.** Integers only: basis points, absolute deltas, cross-multiplication.
**Test.** No `float` appears in `equivalencekit/` or in contract storage; the comparators use
integer math throughout.

### A14 — Unbounded loops and unbounded inputs

**Broken.** Parse an unbounded body, or loop over unbounded storage.

**Fixed.** Bound first, then parse:

```python
require_within("body", utf8_len(raw), MAX_INPUT_BYTES)   # EXPECTED: OVER_LIMIT
```

**Test.** Every normalizer has an oversize case; `tests/primitives/test_errors_bounds.py`.

### A15 — Unbounded regex on untrusted input

**Broken.** `re.sub(r"(?s)<.*>", "", text)` on an unbounded page. **Fixed.** Bound the input
length before any regex, and use non-greedy patterns. **Test.** Oversize cases in
`tests/primitives/test_normalize.py`; the attestor caps pages at `MAX_PAGE_CHARS`.

### A16 — Weakening a matrix to make a test pass

**Broken.** Move a `MUST_REJECT` case to `MUST_ACCEPT` after the rule fails it.

**Why it fails.** It converts a bug into a documented "feature" with no justification, and
the tolerance silently loosens.

**Fixed.** A tolerance change requires a matrix update **and** a rationale in the same
commit. See `docs/decision-guide.md` step 7 and `docs/tightness-testing.md` section 5.
