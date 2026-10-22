"""StudioNet deployment evidence for the reference contracts.

Deploys VerdictJudge and WebFactAttestor to StudioNet, exercises each one with a real
read call and a real write transaction under real consensus, saves the contract schemas,
and records everything in `deployments/studionet.md`.

Run it explicitly:

    python3.12 -m pytest tests/deploy -v -s --network studionet

Why the genlayer-test client rather than `genlayer deploy` / `genlayer write` for the
write calls: the CLI's `--args` parser runs `JSON.parse` on every argument, and when the
value parses as an array or object it encodes it as a contract array/dict instead of a
string. The reference contracts take their rubric and fact rules as JSON *strings*, so the
CLI cannot pass them as `str` parameters. The genlayer-test client encodes a Python `str`
correctly, which is why the integration tests and this deployment script both use it.
The schema is still fetched with the documented `genlayer schema` command.
"""

import json
import subprocess
from pathlib import Path

from gltest import get_contract_factory
from gltest_cli.config.general import get_general_config

from helpers import assert_agreed, build_contract, transact_until_agreed, votes

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT = ROOT / "deployments" / "studionet.md"
EXPLORER = "https://explorer-studio.genlayer.com"

RUBRIC = [
    {
        "item_id": "hard_income",
        "text": "Evidence must mention income.",
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

FACT_RULES = [
    {"name": "has_heading", "kind": "BOOL_PRESENT_HEADING", "param": "Example Domain"},
    {
        "name": "mentions_documentation",
        "kind": "BOOL_CONTAINS_PHRASE",
        "param": "documentation examples",
    },
    {"name": "word_bucket", "kind": "BUCKET_WORD_COUNT", "edges": [10, 100]},
]

RANKING_RUBRIC = [
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

RANKING_EVIDENCE = (
    "Question: which vendors have the better uptime record? "
    "Acme reports 99.95 percent uptime for the last year. "
    "Globex reports 99.1 percent uptime for the last year. "
    "Initech reports 99.5 percent uptime but only over the last month. "
    "Umbrella reports no uptime figures at all."
)


def _rpc() -> str:
    return get_general_config().get_rpc_url()


def _network() -> str:
    return get_general_config().get_network_name()


def _schema(address: str) -> str:
    """Fetch the schema with the documented CLI command."""

    result = subprocess.run(
        ["genlayer", "schema", address, "--rpc", _rpc()],
        capture_output=True,
        text=True,
        check=False,
    )
    return (result.stdout or result.stderr).strip()


def _votes_block(receipt) -> str:
    vote_map = votes(receipt)
    if not vote_map:
        return "_no votes recorded_"
    return ", ".join(f"`{value}`" for value in vote_map.values())


def _tx(receipt) -> str:
    return receipt.get("hash", "")


def _record(lines, label, file, address, deploy_tx, deploy_receipt, steps, schema):
    lines.append(f"### {label}")
    lines.append("")
    lines.append("| Field | Value |")
    lines.append("|---|---|")
    lines.append(f"| Contract file | `{file}` |")
    lines.append(f"| Address | `{address}` |")
    lines.append(f"| Deploy tx | `{deploy_tx}` |")
    lines.append(f"| Explorer (address) | {EXPLORER}/address/{address} |")
    lines.append(f"| Explorer (deploy tx) | {EXPLORER}/tx/{deploy_tx} |")
    lines.append("")
    lines.append(f"Deploy votes: {_votes_block(deploy_receipt)}")
    lines.append("")
    for title, detail, receipt in steps:
        lines.append(f"#### {title}")
        lines.append("")
        lines.append(detail)
        lines.append("")
        if receipt is not None:
            lines.append(f"- tx: `{_tx(receipt)}`")
            lines.append(f"- explorer: {EXPLORER}/tx/{_tx(receipt)}")
            lines.append(f"- votes: {_votes_block(receipt)}")
            lines.append("")
    lines.append("#### Schema (saved from `genlayer schema <address>`)")
    lines.append("")
    lines.append("```json")
    lines.append(schema)
    lines.append("```")
    lines.append("")


def test_deploy_reference_contracts_to_studionet():
    network = _network()
    assert network == "studionet", f"expected studionet, got {network}"
    rpc = _rpc()

    lines = [
        "# EquivalenceKit — StudioNet deployments",
        "",
        "StudioNet is gasless; every deploy below is expected to cost **0 GEN**.",
        "",
        "Generated by `tests/deploy/test_studionet_deployment.py`. Regenerate rather than",
        "hand-edit.",
        "",
        f"- network: `{network}`",
        f"- rpc: `{rpc}`",
        f"- explorer: `{EXPLORER}`",
        "",
    ]

    # ---------------------------------------------------------------- VerdictJudge
    factory = get_contract_factory(contract_file_path="verdict_judge.py")
    deploy_receipt = factory.deploy_contract_tx(args=[])
    judge_address = deploy_receipt["data"]["contract_address"]

    judge = build_contract(judge_address)
    config_read = judge.get_config(args=[]).call()

    create_receipt = judge.create_judgment(
        args=["Income eligibility", "ELIGIBLE,INELIGIBLE", json.dumps(RUBRIC)]
    ).transact()
    assert_agreed(create_receipt)

    judgment_read = judge.get_judgment(args=[0]).call()

    evidence_receipt = judge.submit_evidence(
        args=[0, "income is 5000 per year and verified"]
    ).transact()
    assert_agreed(evidence_receipt)

    # The rubric's deterministic item passes, so the model is consulted and the whole
    # round runs through real LLM consensus.
    evaluate_receipt = transact_until_agreed(judge, "evaluate", args=[0])

    assessments_read = judge.get_assessments(args=[0]).call()
    judgment_after = judge.get_judgment(args=[0]).call()

    _record(
        lines,
        "VerdictJudge",
        "contracts/verdict_judge.py",
        judge_address,
        _tx(deploy_receipt),
        deploy_receipt,
        [
            (
                "First read call — `get_config`",
                "```json\n" + str(config_read) + "\n```",
                None,
            ),
            (
                "First write — `create_judgment`",
                "Freezes the verdict set and a two-item rubric (one deterministic, one "
                "interpretive).",
                create_receipt,
            ),
            (
                "Read back — `get_judgment(0)`",
                "```json\n" + str(judgment_read) + "\n```",
                None,
            ),
            (
                "Write — `submit_evidence`",
                "Appends one evidence reference.",
                evidence_receipt,
            ),
            (
                "Write — `evaluate`",
                "Runs the deterministic rubric check, then a P1 consensus round over the "
                "model's verdict. This is a real LLM consensus round.",
                evaluate_receipt,
            ),
            (
                "Read back — `get_assessments(0)`",
                "```json\n" + str(assessments_read) + "\n```",
                None,
            ),
            (
                "Read back — `get_judgment(0)` after evaluation",
                "```json\n" + str(judgment_after) + "\n```",
                None,
            ),
        ],
        _schema(judge_address),
    )

    # ------------------------------------------------------------ WebFactAttestor
    attestor_factory = get_contract_factory(contract_file_path="web_fact_attestor.py")
    attestor_receipt = attestor_factory.deploy_contract_tx(args=[])
    attestor_address = attestor_receipt["data"]["contract_address"]

    attestor = build_contract(attestor_address)
    attestor_config = attestor.get_config(args=[]).call()

    spec_receipt = attestor.create_spec(
        args=["https://example.com", json.dumps(FACT_RULES)]
    ).transact()
    assert_agreed(spec_receipt)

    spec_read = attestor.get_spec(args=[0]).call()

    # Live web fetch plus a real model-backed fact, under real consensus.
    attest_receipt = transact_until_agreed(attestor, "request_attestation", args=[0])

    latest_read = attestor.get_latest_attestation(args=[0]).call()
    attestations_read = attestor.get_attestations(args=[0]).call()

    _record(
        lines,
        "WebFactAttestor",
        "contracts/web_fact_attestor.py",
        attestor_address,
        _tx(attestor_receipt),
        attestor_receipt,
        [
            (
                "First read call — `get_config`",
                "```json\n" + str(attestor_config) + "\n```",
                None,
            ),
            (
                "First write — `create_spec`",
                "Freezes the URL and three fact rules (heading, phrase, word-count bucket).",
                spec_receipt,
            ),
            (
                "Read back — `get_spec(0)`",
                "```json\n" + str(spec_read) + "\n```",
                None,
            ),
            (
                "Write — `request_attestation`",
                "Fetches the live page, extracts the facts in code, and reaches P2 "
                "consensus. Validators re-fetch the page independently.",
                attest_receipt,
            ),
            (
                "Read back — `get_latest_attestation(0)`",
                "```json\n" + str(latest_read) + "\n```",
                None,
            ),
            (
                "Read back — `get_attestations(0)`",
                "```json\n" + str(attestations_read) + "\n```",
                None,
            ),
        ],
        _schema(attestor_address),
    )

    # ------------------------------------------------------------- RankingJudge
    ranker_factory = get_contract_factory(contract_file_path="ranking_judge.py")
    ranker_receipt = ranker_factory.deploy_contract_tx(args=[])
    ranker_address = ranker_receipt["data"]["contract_address"]

    ranker = build_contract(ranker_address)
    ranker_config = ranker.get_config(args=[]).call()

    create_ranking_receipt = ranker.create_ranking(
        args=[
            "Vendor ranking",
            "acme,globex,initech,umbrella",
            json.dumps(RANKING_RUBRIC),
            2,
            50,
            1,
        ]
    ).transact()
    assert_agreed(create_ranking_receipt)

    ranker_evidence_receipt = ranker.submit_evidence(
        args=[0, RANKING_EVIDENCE]
    ).transact()
    assert_agreed(ranker_evidence_receipt)

    ranker_evidence_read = ranker.get_evidence(args=[0]).call()

    # A real LLM consensus round over the P4 rule.
    rank_receipt = transact_until_agreed(ranker, "rank", args=[0])

    ranker_read = ranker.get_ranking(args=[0]).call()
    ranker_history = ranker.get_rankings(args=[0]).call()

    _record(
        lines,
        "RankingJudge",
        "contracts/ranking_judge.py",
        ranker_address,
        _tx(ranker_receipt),
        ranker_receipt,
        [
            (
                "First read call — `get_config`",
                "```json\n" + str(ranker_config) + "\n```",
                None,
            ),
            (
                "First write — `create_ranking`",
                "Freezes the candidate universe, the rubric, and the P4 parameters "
                "(top_k 2, overlap 66 percent, rank distance cap 1).",
                create_ranking_receipt,
            ),
            (
                "Write — `submit_evidence`",
                "Appends one evidence reference. The reference text is stored and shown to "
                "the model.",
                ranker_evidence_receipt,
            ),
            (
                "Read back — `get_evidence(0)`",
                "```json\n" + str(ranker_evidence_read) + "\n```",
                None,
            ),
            (
                "Write — `rank`",
                "A real LLM consensus round over the P4 rule: candidate universe check "
                "plus top-k overlap and the rank-distance cap.",
                rank_receipt,
            ),
            (
                "Read back — `get_ranking(0)`",
                "```json\n" + str(ranker_read) + "\n```",
                None,
            ),
            (
                "Read back — `get_rankings(0)`",
                "```json\n" + str(ranker_history) + "\n```",
                None,
            ),
        ],
        _schema(ranker_address),
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUTPUT}")
