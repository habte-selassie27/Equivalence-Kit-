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

---

## Found by audit

These six were found by a security audit of the reference contracts, and each one is now
fixed in this repository. They are listed because the shape of the mistake is reusable.

### A17 — Collecting evidence and discarding it

**Broken.** Validate the submitted reference, then store only an identifier:

```python
evidence_id = f"ev{id}-{len(record.evidence_ids)}"
record.evidence_ids.append(evidence_id)      # ref is never stored
```

**Why it fails.** The model is then asked to judge something while receiving nothing but
`ev0-0` as its data. The contract performs non-deterministic evaluation with no evidence,
which is the failure the Intelligent Contract model exists to avoid — and the evidence
never appears in the history either, so no auditor can tell what was weighed. The tests
passed, because nothing asserted that the *prompt* contained the evidence.

**Fixed.** Store the reference and show it to the model, bounded and labelled:

```python
record.evidence.append(EvidenceRecord(evidence_id=evidence_id, ref=ref.strip(), submitted_by=sender))
# prompt:
evidence_lines.append("[" + item.evidence_id + "] " + clip_text(item.ref, MAX_REF))
```

**Test.** Submit a sentinel string and make the LLM mock match **only** when the sentinel
appears in the prompt. A successful round then proves the evidence reached the model.
`tests/direct/test_ranking_judge.py::test_submitted_evidence_reaches_the_model_and_the_record`.

---

### A18 — A tolerance that can be configured to zero

**Broken.** Let the caller choose the overlap threshold with no floor:

```python
if min_overlap_pct > 100:
    _revert("EXPECTED", "INVALID_ARGUMENT")     # 0 is accepted
```

**Why it fails.** At 0 the overlap check is vacuous: `topk_overlap(["a","b","c"],
["x","y","z"], 3, 0, None)` returns `OK`. Two completely contradictory rankings are
"equivalent", so the contract asserts nothing while still reporting a consensus result.

**Fixed.** Enforce a documented floor where the pattern is configured:

```python
if min_overlap_pct < MIN_OVERLAP_PCT or min_overlap_pct > 100:
    _revert("EXPECTED", "INVALID_ARGUMENT")     # MIN_OVERLAP_PCT = 1
```

**Test.** `create_ranking` with `min_overlap_pct=0` must revert.

---

### A19 — Limits that are declared but never enforced

**Broken.** Advertise a cap and never check it:

```python
MAX_ROUND = 8
...
"max_round": MAX_ROUND,          # reported by get_config()
...
record.ranking_history.append(...)   # no cap check anywhere
```

**Why it fails.** The state grows without bound, and — worse — the contract *lies* about its
own limits. An operator reading `get_config()` believes a cap exists.

**Fixed.** Check the cap where the state grows, and make `get_config()` report only limits
that are actually enforced.

**Test.** Drive the rounds to the cap and assert the next one reverts `OVER_LIMIT`, and
that the advertised number equals the enforced one.

---

### A20 — An unrestricted URL for a contract that fetches it

**Broken.** Accept any scheme and any host:

```python
if scheme not in ("http", "https") or not rest:
    _revert("EXPECTED", "INVALID_ARGUMENT")
```

**Why it fails.** Two problems. (a) Plain http: an on-path attacker serves identical bytes
to every validator, they all agree, and the attestation records a confidently false fact.
(b) Any host: the spec creator aims every validator at `127.0.0.1`, `10.0.0.0/8`, or
`169.254.169.254` — the last being cloud instance metadata — and the extracted result is
published on chain.

**Fixed.** Require HTTPS and reject literal loopback, link-local, and private hosts. The
check is literal because GenVM has no DNS resolution, and resolving would itself be a
non-deterministic operation.

**Test.** `create_spec` must reject `http://…`, `https://127.0.0.1/…`,
`https://169.254.169.254/…`, `https://10.0.0.1/…`, `https://localhost/…`.

---

### A21 — A digest that overstates what it proves

**Broken.** Store the leader's page digest under a name that implies agreement:

```python
"snapshot_digest": digest_hex(page)     # leader's own bytes, nobody checked
```

**Why it fails.** Each validator fetches independently and may see different bytes; only the
leader's value is kept. A reader who sees `snapshot_digest` concludes the attestation pins
specific page content. It does not — and the digest is FNV-1a, so it is not tamper-evident
either.

**Fixed.** Name it for what it is and say so in the field, the docstring, and the docs:

```python
leader_snapshot_digest: str   # the leader's own fingerprint; never compared
```

---

### A22 — A griefable, unattributable round

**Broken.** Let anyone open the next round of a bounded series:

```python
@gl.public.write
def request_attestation(self, spec_id: u32) -> u32:   # no sender check
    ...
    if latest.status != STATUS_CHALLENGED and latest.source_status != SOURCE_UNAVAILABLE:
        _revert("EXPECTED", "INVALID_STATE")
```

**Why it fails.** After a challenge, any address can open the next round, which is then
recorded under *their* address. Repeating this exhausts the spec's round budget and stops
the legitimate record from advancing.

**Fixed.** Attribute the round: only the spec creator or the previous requester may open it.

**Test.** A third party must get `EXPECTED: NOT_AUTHORIZED`; the creator must succeed.

---

### A23 — Feeding a human-facing field into a strict schema check

**Broken.** The pattern comparator takes exactly the fields it compares, and the contract
hands it everything the model returned:

```python
left  = {"ranking": [...], "digest": "b is best"}
right = {"ranking": [...], "digest": "a different explanation"}
compare_p4(left, right, context)      # -> UNEXPECTED_FIELD
```

**Why it fails.** `compare_p4` validates its input against the P4 field set, `("ranking",)`,
because an unexpected field usually means the model returned a different shape than the one
the rule was written for. `digest` is deliberately *outside* that set — it is a human-facing
explanation and is never compared. So the schema check fails **before** the overlap rule is
evaluated, every validator disagrees, and the transaction can never finalize.

What makes this one dangerous is how it hides: direct tests execute the **leader** by
default, so the contract's own test suite saw a successful ranking round and reported green.
Only a real consensus round — where validators actually run — exposed it.

**Fixed.** Strip the non-compared field at the call site, so the exclusion is explicit:

```python
result = compare_p4(
    {"ranking": left["ranking"]},
    {"ranking": right["ranking"]},
    context,
)
```

**Test.** A validated-directly test that exercises the *validator*, not just the leader:
`tests/direct/test_ranking_judge.py::test_validator_accepts_honest_ranking_and_rejects_bad_ones`
asserts an honest ranking with a **different digest** is accepted, and that a decision flip,
an invented candidate, and a malformed shape are all rejected. Compare
`tests/direct/test_web_fact_attestor.py`, which strips the digest before `compare_p2` for the
same reason.

**The general rule.** Every caller that compares via a pattern comparator must pass exactly
the pattern's compared fields. If a field is not compared, strip it at the call site — never
widen the pattern's schema to accommodate it.

---

### A24 — strict_eq on model or web output

**Broken.** Wrap a non-deterministic source in the strict equality principle, where every
validator must produce byte-identical output:

```python
json_result = gl.eq_principle.strict_eq(fetch_price_and_winner_task)
```

**Why it fails.** `strict_eq` is the right tool for values the code decides (a checksum, a
counter) — there every validator computes the identical bytes. Feed it a prompt that asks a
model to read a page and return a price with decimals and a winning side in prose, and two
honest validators will differ by one character: different quote marks, `"65,001.42"` versus
`"65001.42"`, a trailing newline. The rule is always false, the transaction never finalizes,
and nothing in the error path explains why. Found in the wild: pm-kit's
`crypto_prediction_market.py` and `stock_prediction_market.py` (see docs/case-study.md).

**Fixed.** Decide what validators agree **on**, then use an equivalence rule for it:

```python
# code decides the allowed sides; the model only picks inside them
enum_equal(winner, winner, (side_a, side_b))                 # decision: exact
int_within_bps(price_a, price_b, tolerance_bps)              # price: inclusive band
```

**Test.** `tests/primitives/test_audit.py::test_a24_flags_strict_eq_on_nondeterminism`
flags the snippet above and does not flag a `strict_eq` on a code-computed value.

**Audit heuristic.** `ekit audit` reports every `strict_eq` occurrence as a reason to
look. A `strict_eq` that wraps code-decided values is legitimate — the finding only asks
you to confirm which one this is.
