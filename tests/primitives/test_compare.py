import random

import pytest

from equivalencekit.compare import (
    OK,
    all_of,
    bucket_adjacent,
    consistent_with,
    enum_equal,
    facts_match,
    int_within_abs,
    int_within_bps,
    ordinal_within,
    overlap_at_least,
    set_equal,
    subset_of,
    topk_overlap,
)

BANDS = ("LOW", "MEDIUM", "HIGH")


def test_enum_equal_and_symmetry():
    assert enum_equal("yes", "YES", ("YES", "NO")).ok
    assert enum_equal("maybe", "YES", ("YES", "NO")).reason == "UNKNOWN_ENUM"
    assert enum_equal("YES", "NO", ("YES", "NO")).reason == "ENUM_MISMATCH"
    assert enum_equal("YES", "NO", ("YES", "NO")) == enum_equal("NO", "YES", ("YES", "NO"))


def test_ordinal_within_steps():
    assert ordinal_within("LOW", "LOW", BANDS, 0).ok
    assert ordinal_within("LOW", "MEDIUM", BANDS, 1).ok
    assert ordinal_within("MEDIUM", "HIGH", BANDS, 1).ok
    assert ordinal_within("LOW", "HIGH", BANDS, 1).reason == "STEP_TOO_FAR"
    assert ordinal_within("nope", "HIGH", BANDS, 1).reason == "UNKNOWN_ENUM"


def test_int_within_abs_edges_and_symmetry():
    assert int_within_abs(100, 105, 5).ok
    assert int_within_abs(100, 106, 5).reason == "ABS_DELTA_EXCEEDED"
    assert int_within_abs(106, 100, 5).reason == "ABS_DELTA_EXCEEDED"
    assert int_within_abs(100, 105, 5) == int_within_abs(105, 100, 5)


def test_int_within_bps_edges_zero_and_symmetry():
    # 1% of 101 is 1.01, so a delta of 1 is inside 100 bps.
    assert int_within_bps(100, 101, 100).ok
    assert int_within_bps(100, 102, 100).reason == "BPS_DELTA_EXCEEDED"
    assert int_within_bps(0, 0, 0).ok
    assert int_within_bps(0, 1, 9999).reason == "BPS_DELTA_EXCEEDED"
    assert int_within_bps(0, 1, 10000).ok
    assert int_within_bps(100, 101, 100) == int_within_bps(101, 100, 100)


def test_bucket_adjacent_edges():
    edges = (300, 1000)
    assert bucket_adjacent(0, 300, edges).ok
    assert bucket_adjacent(300, 301, edges).ok
    assert bucket_adjacent(301, 1000, edges).ok
    assert bucket_adjacent(300, 1001, edges).reason == "BUCKET_TOO_FAR"


def test_set_equal_is_order_independent():
    assert set_equal(["b", "a"], ["a", "b"]).ok
    assert set_equal(["b", "a"], ["a", "c"]).reason == "SET_MISMATCH"


def test_subset_of_is_directional_and_rejects_unknown_ids():
    assert subset_of(["a"], ["a", "b"]).ok
    assert subset_of(["a", "b"], ["a", "b"]).ok
    assert subset_of(["a", "z"], ["a", "b"]).reason == "UNKNOWN_ID"
    assert subset_of(["a", "b"], ["a"]).reason == "UNKNOWN_ID"
    assert subset_of([], ["a"]).ok


def test_overlap_at_least_threshold_edges():
    assert overlap_at_least(["a", "b"], ["b", "c"], 33).ok
    assert overlap_at_least(["a", "b"], ["b", "c"], 34).reason == "OVERLAP_TOO_LOW"
    assert overlap_at_least([], [], 100).ok


def test_topk_overlap_cutoff_and_rank_distance():
    assert topk_overlap(["a", "b", "c"], ["b", "a", "d"], 2, 100).ok
    assert topk_overlap(["a", "b", "c"], ["c", "d", "e"], 2, 50).reason == "TOPK_MISMATCH"
    assert topk_overlap(["a", "b", "c"], ["b", "a", "c"], 3, 100, 0).reason == "TOPK_MISMATCH"
    assert topk_overlap(["a", "b", "c"], ["b", "a", "c"], 3, 100, 1).ok
    assert topk_overlap(["a"], ["a", "b"], 2, 100).reason == "TOPK_MISMATCH"


def test_facts_match_per_rule_and_missing_extra():
    rules = {
        "has_price": {"kind": "bool"},
        "plan": {"kind": "enum", "allowed": ("FREE", "PRO", "ENTERPRISE")},
        "words": {"kind": "bucket", "edges": (300, 1000)},
        "count": {"kind": "int_abs", "delta": 2},
    }
    leader = {"has_price": "yes", "plan": "PRO", "words": 900, "count": 10}
    validator = {"has_price": True, "plan": "pro", "words": 1100, "count": 12}
    assert facts_match(leader, validator, rules).ok

    assert facts_match({**leader, "extra": 1}, validator, rules).reason == "FACT_EXTRA"
    missing = {key: value for key, value in validator.items() if key != "plan"}
    assert facts_match(leader, missing, rules).reason == "FACT_MISSING"
    assert (
        facts_match({**leader, "count": 10}, {**validator, "count": 13}, rules).reason
        == "FACT_MISMATCH"
    )


def test_consistent_with_rule_table():
    forbidden = {"hard_check": ("ELIGIBLE",), "soft_check": ()}
    assert consistent_with("ELIGIBLE", {"hard_check": True}, forbidden).ok
    assert consistent_with("ELIGIBLE", {"hard_check": False}, forbidden).reason == "INVARIANT_VIOLATION"
    assert consistent_with("INELIGIBLE", {"hard_check": False}, forbidden).ok
    assert consistent_with("ELIGIBLE", {"soft_check": False}, forbidden).ok
    assert consistent_with("ELIGIBLE", {"unknown": False}, forbidden).ok


def test_all_of_returns_first_failure():
    assert all_of([]).ok
    assert all_of([OK, OK]) == OK
    result = all_of([OK, enum_equal("YES", "NO", ("YES", "NO")), int_within_abs(1, 9, 0)])
    assert result.reason == "ENUM_MISMATCH"


def test_comparators_do_not_raise_on_random_valid_inputs():
    rng = random.Random(11)
    ids = ["a", "b", "c", "d"]
    for _ in range(200):
        left = rng.sample(ids, rng.randint(0, 4))
        right = rng.sample(ids, rng.randint(0, 4))
        set_equal(left, right)
        subset_of(left, ids)
        overlap_at_least(left, right, rng.randint(0, 100))
        topk_overlap(left, right, 1, rng.randint(0, 100)) if left and right else None
        int_within_bps(rng.randint(-1000, 1000), rng.randint(-1000, 1000), rng.randint(0, 10000))
        ordinal_within(rng.choice(BANDS), rng.choice(BANDS), BANDS, rng.randint(0, 2))


def test_bad_tolerance_parameters_are_programming_errors():
    with pytest.raises(ValueError):
        int_within_abs(1, 2, -1)
    with pytest.raises(ValueError):
        int_within_bps(1, 2, 10001)
    with pytest.raises(ValueError):
        overlap_at_least(["a"], ["a"], 101)
    with pytest.raises(ValueError):
        topk_overlap(["a"], ["a"], 0, 50)
