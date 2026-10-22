import json

from gltest import get_contract_factory

from helpers import assert_agreed

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
        "text": "Assess whether the evidence is sufficient and relevant.",
        "kind": "INTERPRETIVE",
        "rule_kind": "NONE",
    },
]


def _deploy():
    factory = get_contract_factory(contract_file_path="verdict_judge.py")
    return factory.deploy(args=[])


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
    _assert_ok(contract.evaluate(args=[0]).transact())

    first = json.loads(contract.get_assessments(args=[0]).call())
    assert len(first) == 1
    assert first[0]["verdict"] in ("ELIGIBLE", "INELIGIBLE")
    assert first[0]["band"] in ("LOW", "MEDIUM", "HIGH")

    _assert_ok(contract.challenge(args=[0, "Please re-check the evidence."]).transact())
    _assert_ok(contract.re_evaluate(args=[0]).transact())

    assessments = json.loads(contract.get_assessments(args=[0]).call())
    assert [item["round"] for item in assessments] == [1, 2]
    assert json.loads(contract.get_judgment(args=[0]).call())["status"] == "EVALUATED"

    _assert_ok(contract.close(args=[0]).transact())
    assert json.loads(contract.get_judgment(args=[0]).call())["status"] == "CLOSED"
