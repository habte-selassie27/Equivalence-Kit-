"""Before/after: a naive rule vs. the kit's P1 rule.

The numbers in the tightness report are self-generated, so a strict reviewer can
ask: "how do I know the kit is better than the thing I would have written myself?"
This test is the answer: it runs the same two inputs through a naive rule and
through the kit's P1 rule, and prints which one a builder would actually get.

Two inputs are used:

* HONEST — the leader and the validator agree on the decision, but differ in every
  way a real model does: cited ids in a different order, band shifted one step,
  digest rewritten.
* HARMFUL — the validator agrees on the verdict but cites an id that is not in the
  provided universe (the classic hallucination).

The naive rules are the ones builders actually write first:
  - `naive_strict_equal`: the two outputs must be byte-identical.
  - `naive_verdict_only`: the two verdicts must agree, nothing else checked.
"""

from __future__ import annotations

import json
from pathlib import Path

from equivalencekit.patterns import compare_p1

CANONICAL = json.loads((Path(__file__).parent / "canonical.json").read_text())["P1"]
LEADER = CANONICAL["output"]
CONTEXT = CANONICAL["context"]
PROVIDED = CONTEXT["provided_ids"]


def _honest_validator() -> dict:
    return {
        "verdict": "eligible".upper(),
        "band": "HIGH",
        "cited_ids": ["b", "a"],
        "digest": "completely different wording, same decision",
    }


def _harmful_validator() -> dict:
    return {
        "verdict": "ELIGIBLE",
        "band": "MEDIUM",
        "cited_ids": ["a", "z"],  # "z" is not in the provided universe
        "digest": LEADER["digest"],
    }


def naive_strict_equal(leader, validator) -> bool:
    return leader == validator


def naive_verdict_only(leader, validator) -> bool:
    return leader.get("verdict") == validator.get("verdict")


def test_honest_variation_naive_rejects_kit_accepts():
    honest = _honest_validator()
    assert not naive_strict_equal(LEADER, honest), "naive strict-eq should reject honest variation"
    result = compare_p1(LEADER, honest, CONTEXT)
    assert result["ok"], f"kit P1 should accept honest variation: {result}"
    assert result["reason"] == "OK"


def test_harmful_hallucination_naive_verdict_only_accepts_kit_rejects():
    harmful = _harmful_validator()
    assert naive_verdict_only(LEADER, harmful), "naive verdict-only should (wrongly) accept the hallucination"
    result = compare_p1(LEADER, harmful, CONTEXT)
    assert not result["ok"], "kit P1 must reject the hallucinated id"
    assert result["reason"] == "UNKNOWN_ID"
    # The failing field is cited_ids, not the verdict.
    cited = next(f for f in result["fields"] if f["name"] == "cited_ids")
    assert cited["ok"] is False


def test_naive_vs_kit_report():
    honest = _honest_validator()
    harmful = _harmful_validator()
    print("\nNAIVE VS KIT (P1)")
    print("  input                 naive_strict_equal  naive_verdict_only  kit P1")
    print(f"  honest variation      {naive_strict_equal(LEADER, honest)!s:<20} {naive_verdict_only(LEADER, honest)!s:<19} {compare_p1(LEADER, honest, CONTEXT)['ok']}")
    print(f"  hallucinated id       {naive_strict_equal(LEADER, harmful)!s:<20} {naive_verdict_only(LEADER, harmful)!s:<19} {compare_p1(LEADER, harmful, CONTEXT)['ok']}")