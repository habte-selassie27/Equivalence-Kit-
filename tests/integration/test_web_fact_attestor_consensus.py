import json

from gltest import get_contract_factory

from helpers import assert_agreed

STABLE_RULES = [
    {"name": "has_heading", "kind": "BOOL_PRESENT_HEADING", "param": "Example Domain"},
    {
        "name": "mentions_documentation",
        "kind": "BOOL_CONTAINS_PHRASE",
        "param": "documentation examples",
    },
    {
        "name": "mentions_permission",
        "kind": "BOOL_CONTAINS_PHRASE",
        "param": "without needing permission",
    },
    {"name": "word_bucket", "kind": "BUCKET_WORD_COUNT", "edges": [10, 100]},
    {
        "name": "purpose",
        "kind": "ENUM_FROM_LIST",
        "allowed": ["DOCUMENTATION", "COMMERCE", "SOCIAL"],
    },
]

MISSING_RULES = [
    {"name": "has_heading", "kind": "BOOL_PRESENT_HEADING", "param": "Example Domain"},
]


def _deploy():
    factory = get_contract_factory(contract_file_path="web_fact_attestor.py")
    return factory.deploy(args=[])


def _assert_ok(receipt):
    """Validators must have agreed, not just the leader's VM having run."""

    assert_agreed(receipt)


def test_real_page_consensus_unavailable_and_challenge_round_trip():
    contract = _deploy()

    _assert_ok(
        contract.create_spec(
            args=["https://Example.COM/#section", json.dumps(STABLE_RULES)]
        ).transact()
    )
    spec = json.loads(contract.get_spec(args=[0]).call())
    assert spec["url"] == "https://example.com/"
    assert [rule["name"] for rule in spec["rules"]] == [
        "has_heading",
        "mentions_documentation",
        "mentions_permission",
        "word_bucket",
        "purpose",
    ]

    _assert_ok(contract.request_attestation(args=[0]).transact())
    latest = json.loads(contract.get_latest_attestation(args=[0]).call())
    assert latest["source_status"] == "OK"
    # The live page currently has no heading; a missing heading is a fact, not a failure.
    assert latest["facts"]["has_heading"] is False
    assert latest["facts"]["mentions_documentation"] is True
    assert latest["facts"]["mentions_permission"] is True
    assert latest["facts"]["word_bucket"] in (0, 1, 2)
    assert latest["facts"]["purpose"] in ("DOCUMENTATION", "COMMERCE", "SOCIAL")
    assert len(latest["snapshot_digest"]) == 8
    assert latest["status"] == "ACTIVE"
    assert latest["round"] == 1

    _assert_ok(contract.challenge_attestation(args=[0, "Re-fetch the live page."]).transact())
    assert json.loads(contract.get_latest_attestation(args=[0]).call())["status"] == "CHALLENGED"
    _assert_ok(contract.request_attestation(args=[0]).transact())
    history = json.loads(contract.get_attestations(args=[0]).call())
    assert [item["round"] for item in history] == [1, 2]
    assert history[1]["source_status"] == "OK"

    _assert_ok(
        contract.create_spec(
            args=[
                "https://example.com/definitely-missing-equivalencekit-page",
                json.dumps(MISSING_RULES),
            ]
        ).transact()
    )
    _assert_ok(contract.request_attestation(args=[1]).transact())
    missing = json.loads(contract.get_latest_attestation(args=[1]).call())
    assert missing["source_status"] == "UNAVAILABLE"
    assert missing["facts"] == {}
    assert missing["snapshot_digest"] == ""
    assert missing["status"] == "ACTIVE"
