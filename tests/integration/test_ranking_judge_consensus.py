"""RankingJudge under real consensus on StudioNet.

Exercises the P4 path end to end: a frozen candidate universe, submitted evidence that
actually reaches the model, a real LLM consensus round, and a challenge/re-rank cycle.
"""

import json

from helpers import assert_agreed, deploy_contract, transact_until_agreed

RUBRIC = [
    {
        "item_id": "relevance",
        "text": "Rank by how directly the evidence answers the question.",
        "kind": "INTERPRETIVE",
        "rule_kind": "NONE",
    },
    {
        "item_id": "freshness",
        "text": "Prefer the more recent evidence.",
        "kind": "INTERPRETIVE",
        "rule_kind": "NONE",
    },
]

EVIDENCE = (
    "Question: which vendors have the better uptime record? "
    "Acme reports 99.95 percent uptime for the last year. "
    "Globex reports 99.1 percent uptime for the last year. "
    "Initech reports 99.5 percent uptime but only over the last month. "
    "Acme published its figures two weeks ago; Globex published six months ago."
)

# Four candidates with top-k 2. The overlap threshold of 50 percent means the two
# validators' top-2 must share at least one candidate: demanding that both top-2 sets
# match exactly is not achievable when two independent model runs order four close
# candidates, and a rule no honest run can satisfy is a rule that never finalizes.
CANDIDATES = ["acme", "globex", "initech", "umbrella"]
TOP_K = 2
MIN_OVERLAP_PCT = 50
MAX_RANK_DISTANCE = 1


def _deploy():
    contract, _address = deploy_contract("ranking_judge.py")
    return contract


def test_ranking_consensus_and_re_rank():
    contract = _deploy()

    contract.create_ranking(
        args=[
            "Vendor ranking",
            ",".join(CANDIDATES),
            json.dumps(RUBRIC),
            TOP_K,
            MIN_OVERLAP_PCT,
            MAX_RANK_DISTANCE,
        ]
    ).transact()

    spec = json.loads(contract.get_ranking(args=[0]).call())
    assert spec["candidates"] == CANDIDATES
    assert spec["status"] == "OPEN"
    assert spec["evidence"] == []

    contract.submit_evidence(args=[0, EVIDENCE]).transact()

    # The evidence text is stored, not just an identifier.
    evidence = json.loads(contract.get_evidence(args=[0]).call())
    assert len(evidence) == 1
    assert evidence[0]["ref"] == EVIDENCE

    receipt = transact_until_agreed(contract, "rank", args=[0])
    assert_agreed(receipt)

    record = json.loads(contract.get_ranking(args=[0]).call())
    assert record["status"] == "RANKED"
    assert record["round_count"] == 1

    history = [json.loads(item) for item in json.loads(contract.get_rankings(args=[0]).call())]
    assert len(history) == 1
    ranking = history[0]["ranking"]

    # Every ranked id is inside the frozen candidate universe, and the ranking is
    # non-empty and deduplicated.
    assert ranking
    assert len(set(ranking)) == len(ranking)
    assert set(ranking) <= set(CANDIDATES)

    # A challenge opens the next round.
    contract.challenge(args=[0, "Please re-rank with the freshness weight."]).transact()
    assert json.loads(contract.get_ranking(args=[0]).call())["status"] == "CHALLENGED"

    receipt = transact_until_agreed(contract, "re_rank", args=[0])
    assert_agreed(receipt)

    history = [json.loads(item) for item in json.loads(contract.get_rankings(args=[0]).call())]
    assert [item["round"] for item in history] == [1, 2]
    assert json.loads(contract.get_ranking(args=[0]).call())["status"] == "RANKED"
