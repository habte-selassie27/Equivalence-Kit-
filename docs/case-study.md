# Case study: auditing real GenLayer contracts

`ekit audit` against the anti-pattern gallery is a heuristic scan — findings are reasons
to look, not verdicts. This page shows what the scanner finds on real, public GenLayer
contracts, and closes two loops this run created: the scan found a hole in itself
(missing the most expensive anti-pattern of all), and the hole is now fixed with a test.

## Method

Four public contract files, fetched raw, audited locally with the commands shown. No
code was modified, committed, or executed to produce findings.

| Repository | File | License | Pinned commit | Findings |
|---|---|---|---|---|
| [courtofinternet/pm-kit](https://github.com/courtofinternet/pm-kit) | `bridge/service/intelligent-oracles/crypto_prediction_market.py` | MIT | `208ca03` | A3, **A24** |
| [courtofinternet/pm-kit](https://github.com/courtofinternet/pm-kit) | `bridge/service/intelligent-oracles/stock_prediction_market.py` | MIT | `208ca03` | A3, **A24** |
| [courtofinternet/pm-kit](https://github.com/courtofinternet/pm-kit) | `bridge/intelligent-contracts/BridgeSender.py` | MIT | `208ca03` | none |
| [tommycet/proofworks-genlayer](https://github.com/tommycet/proofworks-genlayer) | `contracts/proofworks_escrow.py` | none | `b7d886c` | A3 (heuristic, see below) |

Repro:

```bash
curl -sfL https://raw.githubusercontent.com/courtofinternet/pm-kit/208ca03/bridge/service/intelligent-oracles/crypto_prediction_market.py
ekit audit crypto_prediction_market.py
```

Output for both pm-kit prediction markets (`BridgeSender.py` below them):

```
crypto_prediction_market.py: 2 finding(s)
     1  A3  model-facing code with no subset_of call; model-supplied ids must be checked against the provided universe
    79  A24  gl.eq_principle.strict_eq(...) demands byte-identical validator output; fine on code-decided values, never on model or web results — use an equivalence rule instead

total: 2 finding(s)
```

## What the findings mean there

### pm-kit: A24 — the exact failure mode A24 was written for

Line 79 of both prediction markets:

```python
json_result = gl.eq_principle.strict_eq(fetch_price_and_winner_task)
```

The prompt asks the model to read a live price page and return `{"price": 65000.50,
"winner": "<side>"}`. `strict_eq` requires every validator's output to be byte-identical.
Two honest validators reading the same page can differ by one character — `"65001.42"`
versus `"65,001.42"`, a quote style, a trailing newline — and then the equality is false
and the resolution can deadlock instead of finalizing. This is not a heuristic warning
about a hypothetical: it is the documented too-strict failure (a rule that never
finalizes) sitting on the market's resolution path, where a deadlock means an unresolved
market and an unresolved bridge message.

### pm-kit: A3 — a model-chosen side is stored unvalidated

Three lines later the parsed winner is stored with no universe check:

```python
result_data = json.loads(clean_result)
winner_value = result_data["winner"]
self.winning_side = winner_value
```

If the model reports a side that is not `side_a` or `side_b`, the contract stores an
invalid decision and — reading further — bridges it. The fix is the kit's core
anti-hallucination invariant (`subset_of`): an enum over `(side_a, side_b)` decided
before anything is stored, so a hallucinated `"Side C"` fails closed instead of paying
out.

Also visible in the same file but outside the gallery's reach today: the price is parsed
from JSON floats and multiplied — float-style arithmetic on value that becomes money
(`u256(int(price_value * 100))`). The audit checks float *literals* and explicit `float()`
calls (A13), not type flows inferred from `json.loads`. A documented limitation — see the
gap analysis at the end.

### proofworks: A3 — heuristic hit, protective code exists

The escrow flags A3 only because the file contains `gl.nondet.exec_prompt` without the
kit's `subset_of` helper. Reading the file shows the protection exists in another shape:
model output is normalized defensively (`_normalize_evaluation_result` validates keys and
types), and the decision string is gated by `_status_for_decision`, which raises on any
value outside the fixed four-decision universe. So this finding is the scanner being
single-file and name-blind: it cannot know `_status_for_decision` is a universe check.
This is the intended balance — findings are reasons to look. One of the four findings
here needed manual context to clear; the other three did not.

## The gap this run found — and fixed

Both market findings were already useful, but they undersold the problem: the audit had
**no rule at all** for `strict_eq` on model or web output — the most consequential line in
the file. Anti-pattern A24 did not exist when the scan first ran; the markets would only
have tripped the weaker A3 heuristic. This run added it:

- `equivalencekit/audit.py` now walks every `strict_eq` attribute access and reports A24
  with a message that distinguishes the legitimate case (code-decided values) from the
  failure case (model or web results).
- `docs/anti-patterns.md` gained the A24 entry with the broken/fixed pairs.
- `tests/primitives/test_audit.py::test_a24_flags_strict_eq_on_nondeterminism` pins the
  pm-kit shape, and `test_a24_is_a_reason_to_look_not_a_ban` documents the legit-use path
  with an `# ekit: ignore A24` escape hatch.

Re-running the two prediction markets after the fix produces exactly the output quoted
above — A24 at line 79, both files.

## Friendly issue draft (pm-kit, MIT)

> Hi — while reading `crypto_prediction_market.py` (and its stock sibling) I noticed the
> resolution path does `gl.eq_principle.strict_eq(fetch_price_and_winner_task)` (line 79)
> on a prompt that returns a live price and a prose winner side. With `strict_eq`, every
> validator must return byte-identical output; honest validators reading the same page can
> differ by punctuation or number formatting, which can deadlock resolution instead of
> finalizing the market. Separately, `winner_value = result_data["winner"]` is stored (and
> bridged) without checking it is one of `side_a` / `side_b`, so a model hallucination
> could store an invalid decision. A small hardening would be: pick the winner with an
> equivalence over the two allowed sides, and compare the price inside a tolerance band
> (e.g. basis points) instead of byte-equality. I maintain EquivalenceKit
> (https://github.com/habte-selassie27/equivalence-kit), which has these as ready-made
> primitives (`enum_equal`, `int_within_bps`) — happy to draft a patch if useful.

*(Posting is deliberately left to the project owner: it touches another maintainer's
repo. The draft asks before proposing.)*

## Limitations, stated plainly

- The gallery is a static, single-file heuristic. It sees what patterns exist, not what
  the code does when executed; it cannot certify absence of bugs on a clean bill
  (`BridgeSender.py`).
- It cannot see multi-file context (proofworks' universe check lives in the same file
  here, but phase logic elsewhere may not be visible).
- No false-negative estimate: the scanner has no ground-truth labeling of these repos.
- The case study does not run anyone's contracts, and this repository does not commit
  third-party code (pm-kit is MIT; proofworks has no license file, so only the quoted
  lines above are reproduced).
