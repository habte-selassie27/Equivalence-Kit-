import json

from helpers import assert_agreed, deploy_contract, transact_until_agreed

DETERMINISTIC_ONLY = [
    {
        "item_id": "hard_income",
        "text": "The evidence must mention income.",
        "kind": "DETERMINISTIC",
        "rule_kind": "EVIDENCE_CONTAINS",
        "rule_value": "never-present",
        "forbidden": ["ELIGIBLE"],
    }
]

LLM_RUBRIC = [
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
        # The rubric states the decision rule outright. A vague rubric leaves two verdicts
        # plausible, and P1 compares the verdict exactly: two honest validators that read
        # it differently then refuse the round. That is the rule working, but it is not a
        # rubric worth deploying.
        "text": (
            "The evidence is sufficient when it states a verified income figure. "
            "In that case the verdict is ELIGIBLE; otherwise it is INELIGIBLE."
        ),
        "kind": "INTERPRETIVE",
        "rule_kind": "NONE",
    },
]


def _deploy():
    contract, _address = deploy_contract("verdict_judge.py")
    return contract


def _assert_ok(receipt):
    """Validators must have agreed, not just the leader's VM having run."""

    assert_agreed(receipt)


def test_deterministic_consensus_and_reads():
    contract = _deploy()
    _assert_ok(
        contract.create_judgment(
            args=["Income eligibility", "ELIGIBLE,INELIGIBLE", json.dumps(DETERMINISTIC_ONLY)]
        ).transact()
    )
    _assert_ok(contract.submit_evidence(args=[0, "the document has no relevant figure"]).transact())
    _assert_ok(contract.evaluate(args=[0]).transact())

    record = json.loads(contract.get_judgment(args=[0]).call())
    assert record["status"] == "EVALUATED"
    assert record["rules"] == {"hard_income": ["ELIGIBLE"]}

    assessments = json.loads(contract.get_assessments(args=[0]).call())
    assert len(assessments) == 1
    assert assessments[0]["verdict"] == "INELIGIBLE"
    assert assessments[0]["band"] == "HIGH"
    assert assessments[0]["cited_item_ids"] == ["hard_income"]


def test_llm_consensus_challenge_and_re_evaluation():
    contract = _deploy()
    _assert_ok(
        contract.create_judgment(
            args=["Income eligibility", "ELIGIBLE,INELIGIBLE", json.dumps(LLM_RUBRIC)]
        ).transact()
    )
    _assert_ok(contract.submit_evidence(args=[0, "income is 5000 per year and verified."]).transact())
    # A live model is not unanimous; the rule refuses a round the validators disagree on
    # and leaves the state unchanged, so the caller may try again.
    _assert_ok(transact_until_agreed(contract, "evaluate", args=[0]))

    first = json.loads(contract.get_assessments(args=[0]).call())
    assert len(first) == 1
    assert first[0]["verdict"] in ("ELIGIBLE", "INELIGIBLE")
    assert first[0]["band"] in ("LOW", "MEDIUM", "HIGH")

    _assert_ok(contract.challenge(args=[0, "Please re-check the evidence."]).transact())
    _assert_ok(transact_until_agreed(contract, "re_evaluate", args=[0]))

    assessments = json.loads(contract.get_assessments(args=[0]).call())
    assert [item["round"] for item in assessments] == [1, 2]
    assert json.loads(contract.get_judgment(args=[0]).call())["status"] == "EVALUATED"

    _assert_ok(contract.close(args=[0]).transact())
    assert json.loads(contract.get_judgment(args=[0]).call())["status"] == "CLOSED"
