import json
from pathlib import Path

import pytest

from equivalencekit.patterns import compare_pattern
from equivalencekit.perturb import (
    hallucinate_id,
    harmful_variation,
    harmless_variation,
    inject_instruction,
    push_value_beyond,
)

FIXTURE_DIR = Path(__file__).parent
PATTERN_IDS = ("P1", "P2", "P3", "P4", "P5", "P6")
CANONICAL = json.loads((FIXTURE_DIR / "canonical.json").read_text())


def _load_cases():
    cases = []
    for pattern_id in PATTERN_IDS:
        path = FIXTURE_DIR / f"{pattern_id}.json"
        data = json.loads(path.read_text())
        assert data["pattern"] == pattern_id
        for case in data["cases"]:
            cases.append(pytest.param(case, id=f"{pattern_id}-{case['id']}-{case['category']}"))
    return cases


@pytest.mark.parametrize("case", _load_cases())
def test_acceptance_matrix_case(case):
    result = compare_pattern(case["pattern"] if "pattern" in case else case["id"][:2], case["leader"], case["validator"], case["context"])
    expected_ok = case["expected"] == "ACCEPT"
    assert result["ok"] is expected_ok, f"{case['id']}: {result}"
    if not expected_ok:
        assert result["reason"] == case["reason"], f"{case['id']}: {result}"


def test_every_pattern_has_complete_categories():
    report = {}
    for pattern_id in PATTERN_IDS:
        data = json.loads((FIXTURE_DIR / f"{pattern_id}.json").read_text())
        counts = {"MUST_ACCEPT": 0, "MUST_REJECT": 0, "BOUNDARY": 0}
        for case in data["cases"]:
            counts[case["category"]] += 1
        assert counts["MUST_ACCEPT"] >= 4, (pattern_id, counts)
        assert counts["MUST_REJECT"] >= 4, (pattern_id, counts)
        assert counts["BOUNDARY"] >= 4, (pattern_id, counts)
        report[pattern_id] = counts

    print("\nTIGHTNESS REPORT (matrices)")
    for pattern_id in PATTERN_IDS:
        counts = report[pattern_id]
        print(
            f"  {pattern_id}: accept={counts['MUST_ACCEPT']} "
            f"reject={counts['MUST_REJECT']} boundary={counts['BOUNDARY']}"
        )


def test_harmless_perturbations_are_all_accepted():
    for pattern_id, canonical in CANONICAL.items():
        for seed in range(10):
            variant = harmless_variation(pattern_id, canonical["output"], seed)
            result = compare_pattern(pattern_id, canonical["output"], variant, canonical["context"])
            assert result["ok"], f"{pattern_id} seed={seed}: {result}"


def test_harmful_perturbations_are_all_rejected():
    for pattern_id, canonical in CANONICAL.items():
        for seed in range(10):
            variant = harmful_variation(pattern_id, canonical["output"], seed)
            result = compare_pattern(pattern_id, canonical["output"], variant, canonical["context"])
            assert not result["ok"], f"{pattern_id} seed={seed}: {result}"


def test_hostile_leader_attacks_are_rejected():
    p1 = compare_pattern(
        "P1",
        inject_instruction(CANONICAL["P1"]["output"]),
        CANONICAL["P1"]["output"],
        CANONICAL["P1"]["context"],
    )
    assert not p1["ok"] and p1["reason"] == "UNEXPECTED_FIELD"

    p3 = compare_pattern(
        "P3",
        push_value_beyond(CANONICAL["P3"]["output"]),
        CANONICAL["P3"]["output"],
        CANONICAL["P3"]["context"],
    )
    assert not p3["ok"] and p3["reason"] == "OUT_OF_RANGE"

    p6 = compare_pattern(
        "P6",
        hallucinate_id(CANONICAL["P6"]["output"]),
        CANONICAL["P6"]["output"],
        CANONICAL["P6"]["context"],
    )
    assert not p6["ok"] and p6["reason"] == "UNKNOWN_ID"


def test_honest_validator_noise_still_agrees():
    # Three additional honest-noise shapes a real validator can produce.
    p1 = compare_pattern(
        "P1",
        {"verdict": "ELIGIBLE", "band": "LOW", "cited_ids": ["b", "a"]},
        {"verdict": "eligible", "band": "MEDIUM", "cited_ids": ["a", "b"], "digest": "other"},
        CANONICAL["P1"]["context"],
    )
    assert p1["ok"], p1

    p2 = compare_pattern(
        "P2",
        {"source_status": "OK", "facts": {"has_pricing": True, "plan": "PRO", "word_bucket": 300, "heading_count": 4}},
        {"source_status": "ok", "facts": {"heading_count": 5, "word_bucket": 301, "plan": "pro", "has_pricing": "yes"}},
        CANONICAL["P2"]["context"],
    )
    assert p2["ok"], p2

    p6 = compare_pattern(
        "P6",
        {"answer": True, "evidence_ids": ["e2", "e1"], "source_status": "OK"},
        {"answer": "yes", "evidence_ids": ["e1", "e2"], "source_status": "ok"},
        CANONICAL["P6"]["context"],
    )
    assert p6["ok"], p6
