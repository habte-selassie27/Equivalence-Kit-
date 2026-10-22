"""Pure comparators.

Each comparator returns ``Comparison(ok, reason)`` with a stable reason code. Comparators
never read the clock, randomness, network, or environment, and never build free text from
their inputs. A pattern's rule is ``all_of`` over its field comparators plus invariants.
"""

from __future__ import annotations

from typing import NamedTuple

from .normalize import (
    bucketize,
    normalize_bool,
    normalize_enum,
    normalize_id_list,
    normalize_int,
    normalize_ranked_id_list,
    normalize_text,
)
from .errors import KitError


class Comparison(NamedTuple):
    ok: bool
    reason: str


OK = Comparison(True, "OK")


def _fail(reason: str) -> Comparison:
    return Comparison(False, reason)


def _safe(fn, *args):
    try:
        return fn(*args), None
    except KitError as error:
        return None, error


def enum_equal(leader, validator, allowed, aliases=None) -> Comparison:
    left, error = _safe(normalize_enum, leader, allowed, aliases)
    if error is not None:
        return _fail("UNKNOWN_ENUM")
    right, error = _safe(normalize_enum, validator, allowed, aliases)
    if error is not None:
        return _fail("UNKNOWN_ENUM")
    if left != right:
        return _fail("ENUM_MISMATCH")
    return OK


def ordinal_within(leader, validator, levels, max_steps: int = 1) -> Comparison:
    levels = tuple(levels)
    if max_steps < 0:
        raise ValueError("max_steps must be non-negative")
    left, error = _safe(normalize_enum, leader, levels)
    if error is not None:
        return _fail("UNKNOWN_ENUM")
    right, error = _safe(normalize_enum, validator, levels)
    if error is not None:
        return _fail("UNKNOWN_ENUM")
    distance = abs(levels.index(left) - levels.index(right))
    if distance > max_steps:
        return _fail("STEP_TOO_FAR")
    return OK


def int_within_abs(leader, validator, delta: int) -> Comparison:
    if delta < 0:
        raise ValueError("delta must be non-negative")
    left, error = _safe(normalize_int, leader)
    if error is not None:
        return _fail("WRONG_TYPE")
    right, error = _safe(normalize_int, validator)
    if error is not None:
        return _fail("WRONG_TYPE")
    if abs(left - right) > delta:
        return _fail("ABS_DELTA_EXCEEDED")
    return OK


def int_within_bps(leader, validator, tolerance_bps: int) -> Comparison:
    """Symmetric relative tolerance, compared by cross-multiplication (no division)."""

    if tolerance_bps < 0 or tolerance_bps > 10000:
        raise ValueError("tolerance_bps must be between 0 and 10000")
    left, error = _safe(normalize_int, leader)
    if error is not None:
        return _fail("WRONG_TYPE")
    right, error = _safe(normalize_int, validator)
    if error is not None:
        return _fail("WRONG_TYPE")
    if left == 0 and right == 0:
        return OK
    scale = max(abs(left), abs(right))
    if abs(left - right) * 10000 <= tolerance_bps * scale:
        return OK
    return _fail("BPS_DELTA_EXCEEDED")


def bucket_adjacent(leader, validator, edges) -> Comparison:
    left, error = _safe(bucketize, leader, edges)
    if error is not None:
        return _fail("WRONG_TYPE")
    right, error = _safe(bucketize, validator, edges)
    if error is not None:
        return _fail("WRONG_TYPE")
    if abs(left - right) > 1:
        return _fail("BUCKET_TOO_FAR")
    return OK


def set_equal(leader, validator) -> Comparison:
    left, error = _safe(normalize_id_list, leader)
    if error is not None:
        return _fail("UNKNOWN_ID")
    right, error = _safe(normalize_id_list, validator)
    if error is not None:
        return _fail("UNKNOWN_ID")
    if left != right:
        return _fail("SET_MISMATCH")
    return OK


def subset_of(cited, provided) -> Comparison:
    """Directional: every cited id must be present in the provided universe."""

    cited_ids, error = _safe(normalize_id_list, cited)
    if error is not None:
        return _fail("UNKNOWN_ID")
    provided_ids, error = _safe(normalize_id_list, provided)
    if error is not None:
        return _fail("UNKNOWN_ID")
    universe = set(provided_ids)
    for item in cited_ids:
        if item not in universe:
            return _fail("UNKNOWN_ID")
    return OK


def overlap_at_least(leader, validator, threshold_pct: int) -> Comparison:
    if threshold_pct < 0 or threshold_pct > 100:
        raise ValueError("threshold_pct must be between 0 and 100")
    left, error = _safe(normalize_id_list, leader)
    if error is not None:
        return _fail("UNKNOWN_ID")
    right, error = _safe(normalize_id_list, validator)
    if error is not None:
        return _fail("UNKNOWN_ID")
    left_set, right_set = set(left), set(right)
    union = left_set | right_set
    if not union:
        return OK
    if len(left_set & right_set) * 100 < threshold_pct * len(union):
        return _fail("OVERLAP_TOO_LOW")
    return OK


def topk_overlap(
    leader,
    validator,
    k: int,
    min_overlap_pct: int,
    max_rank_distance=None,
) -> Comparison:
    if k <= 0:
        raise ValueError("k must be positive")
    if min_overlap_pct < 0 or min_overlap_pct > 100:
        raise ValueError("min_overlap_pct must be between 0 and 100")
    left, error = _safe(normalize_ranked_id_list, leader)
    if error is not None:
        return _fail("UNKNOWN_ID")
    right, error = _safe(normalize_ranked_id_list, validator)
    if error is not None:
        return _fail("UNKNOWN_ID")

    if len(left) < k or len(right) < k:
        return _fail("TOPK_MISMATCH")

    left_top, right_top = left[:k], right[:k]
    if len(set(left_top) & set(right_top)) * 100 < min_overlap_pct * k:
        return _fail("TOPK_MISMATCH")

    if max_rank_distance is not None:
        if max_rank_distance < 0:
            raise ValueError("max_rank_distance must be non-negative")
        right_index = {item: index for index, item in enumerate(right_top)}
        for index, item in enumerate(left_top):
            if item in right_index and abs(index - right_index[item]) > max_rank_distance:
                return _fail("TOPK_MISMATCH")
    return OK


def facts_match(leader, validator, rules) -> Comparison:
    """Compare a fact dict, one rule per required fact. Extra or missing facts reject."""

    if not isinstance(leader, dict) or not isinstance(validator, dict):
        return _fail("FACT_MISMATCH")
    required = set(rules)
    if set(leader) - required or set(validator) - required:
        return _fail("FACT_EXTRA")
    if required - set(leader) or required - set(validator):
        return _fail("FACT_MISSING")

    for name in sorted(required):
        rule = rules[name]
        left, right = leader[name], validator[name]
        kind = rule.get("kind")
        if kind == "bool":
            try:
                if normalize_bool(left) != normalize_bool(right):
                    return _fail("FACT_MISMATCH")
            except KitError:
                return _fail("FACT_MISMATCH")
        elif kind == "enum":
            result = enum_equal(left, right, rule["allowed"], rule.get("aliases"))
            if not result.ok:
                return _fail("FACT_MISMATCH")
        elif kind == "bucket":
            result = bucket_adjacent(left, right, tuple(rule["edges"]))
            if not result.ok:
                return _fail("FACT_MISMATCH")
        elif kind == "int_abs":
            result = int_within_abs(left, right, int(rule["delta"]))
            if not result.ok:
                return _fail("FACT_MISMATCH")
        elif kind == "int_bps":
            result = int_within_bps(left, right, int(rule["tolerance_bps"]))
            if not result.ok:
                return _fail("FACT_MISMATCH")
        elif kind == "text":
            try:
                if normalize_text(left) != normalize_text(right):
                    return _fail("FACT_MISMATCH")
            except KitError:
                return _fail("FACT_MISMATCH")
        else:
            raise ValueError(f"unknown fact rule kind: {kind!r}")
    return OK


def consistent_with(verdict, checks, forbidden) -> Comparison:
    """Rule-table invariant: a failed check forbids listed verdicts.

    ``checks`` maps item id -> bool. ``forbidden`` maps item id -> iterable of verdicts
    that must not be returned when that item failed. Items with no rule are a passthrough.
    """

    if not isinstance(checks, dict):
        return _fail("INVARIANT_VIOLATION")
    for item_id, passed in checks.items():
        if passed:
            continue
        banned = forbidden.get(item_id, ())
        if verdict in banned:
            return _fail("INVARIANT_VIOLATION")
    return OK


def all_of(results) -> Comparison:
    for result in results:
        if not result.ok:
            return result
    return OK
