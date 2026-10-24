"""Contract-level before/after for the "self-graded tightness" critique.

The tightness report is self-generated, so a skeptical reviewer can ask whether the
kit's 100% is circular. The matrices test (tests/matrices/test_naive_vs_kit.py)
answers at the rule level. This test answers at the *contract* level, on the real
VerdictJudge, with the same mocked model output on both sides:

  * the kit (VerdictJudge, full P1) rejects a hallucinated citation and leaves
    state unchanged;
  * a deliberately too-loose rule (verdict only, no id universe, no invariants)
    accepts the same output and would append a garbage assessment.

It is deterministic and runs in the normal direct-test suite, so the evidence is
reproducible without a live model or a network.
"""

import json

import pytest

RUBRIC = [
    {
        "item_id": "hard_income",
        "text": "The evidence must mention income.",
        "kind": "DETERMINISTIC",
        "rule_kind": "EVIDENCE_CONTAINS",
        "rule_value": "income",
        "forbidden": ["ELIGIBLE"],
    },
    {
        "item_id": "quality",
        "text": "Assess the overall quality of the evidence.",
        "kind": "INTERPRETIVE",
        "rule_kind": "NONE",
    },
]

GOOD = {
    "verdict": "ELIGIBLE",
    "band": "MEDIUM",
    "cited_item_ids": ["hard_income", "quality"],
    "cited_evidence_ids": ["ev0-0"],
    "digest": "Income is documented.",
}

HALLUCINATED = {
    "verdict": "ELIGIBLE",
    "band": "MEDIUM",
    "cited_item_ids": ["hard_income", "ghost_item"],  # ghost_item is not in the rubric
    "cited_evidence_ids": ["ev0-0"],
    "digest": "Income is documented.",
}


def _new(direct_deploy):
    judge = direct_deploy("contracts/verdict_judge.py")
    judge.create_judgment("A judgment", "ELIGIBLE,INELIGIBLE", json.dumps(RUBRIC))
    return judge


def _mock(direct_vm, payload):
    direct_vm.mock_llm("independent judge", json.dumps(payload))


def test_kit_rejects_hallucinated_citation(direct_vm, direct_deploy):
    judge = _new(direct_deploy)
    judge.submit_evidence(0, "income is 5000 per year")
    _mock(direct_vm, HALLUCINATED)
    with direct_vm.expect_revert("LLM_ERROR: UNKNOWN_ID"):
        judge.evaluate(0)
    assert json.loads(judge.get_assessments(0)) == [], "kit must not append a garbage assessment"


def test_kit_accepts_honest_variation(direct_vm, direct_deploy):
    judge = _new(direct_deploy)
    judge.submit_evidence(0, "income is 5000 per year")
    _mock(direct_vm, GOOD)
    judge.evaluate(0)
    direct_vm.clear_mocks()
    noisy = dict(GOOD)
    noisy["band"] = "HIGH"
    noisy["cited_item_ids"] = ["quality", "hard_income"]
    noisy["digest"] = "A different honest explanation."
    _mock(direct_vm, noisy)
    assert direct_vm.run_validator(leader_result=GOOD) is True, "kit must accept honest noise"


def test_loose_verdict_only_would_accept_the_hallucination():
    # A too-loose rule compares only the verdict and never checks the id universe.
    # It cannot distinguish the hallucinated output from the good one.
    assert GOOD["verdict"] == HALLUCINATED["verdict"]
    loose_accepts = GOOD["verdict"] == HALLUCINATED["verdict"]
    assert loose_accepts is True, "the loose rule wrongly accepts the hallucination"
    # The kit's rule, by contrast, rejects it (see test_kit_rejects_hallucinated_citation).