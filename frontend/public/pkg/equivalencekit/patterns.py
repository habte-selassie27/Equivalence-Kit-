"""Declarative equivalence patterns P1-P6.

A pattern is data: fields, normalizers, comparators, invariants, tolerance rationale,
failure behavior, and known limits. The same spec drives the reference contracts, the
acceptance matrices, and (later) the generated site data.

All comparators return stable reason codes. No pattern compares free text or digests.
"""

from __future__ import annotations

from .compare import (
    Comparison,
    consistent_with,
    enum_equal,
    facts_match,
    int_within_abs,
    int_within_bps,
    ordinal_within,
    subset_of,
    topk_overlap,
)
from .errors import KitError
from .normalize import (
    normalize_bool,
    normalize_entity_list,
    normalize_enum,
    normalize_int,
)

BANDS = ("LOW", "MEDIUM", "HIGH")
SOURCE_STATES = ("OK", "UNAVAILABLE")


def _fail(reason: str) -> Comparison:
    return Comparison(False, reason)


def _safe(fn, *args):
    try:
        return fn(*args), None
    except KitError:
        return None, True


def _field(name: str, result: Comparison) -> dict:
    return {"name": name, "ok": result.ok, "reason": result.reason}


def _finish(fields, not_compared=()) -> dict:
    reason = "OK"
    for field in fields:
        if not field["ok"]:
            reason = field["reason"]
            break
    return {
        "ok": reason == "OK",
        "reason": reason,
        "fields": list(fields),
        "not_compared": list(not_compared),
    }


def _schema_error(leader, validator, allowed) -> bool:
    return any(not isinstance(item, dict) or set(item) - set(allowed) for item in (leader, validator))


def compare_p1(leader, validator, context=None) -> dict:
    """Verdict + band + cited ids + invariant. Digest is not compared."""

    context = context or {}
    if _schema_error(leader, validator, ("verdict", "band", "cited_ids", "digest")):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    fields = []
    for name in ("verdict", "band"):
        if name not in leader or name not in validator:
            fields.append(_field(name, _fail("MISSING_FIELD")))
    if any(not field["ok"] for field in fields):
        return _finish(fields + [_field("cited_ids", _fail("MISSING_FIELD"))])

    verdicts = context.get("verdict_set", ("ELIGIBLE", "INELIGIBLE"))
    verdict_result = enum_equal(
        leader["verdict"], validator["verdict"], verdicts, context.get("enum_aliases")
    )
    fields.append(_field("verdict", verdict_result))

    band_result = ordinal_within(
        leader["band"], validator["band"], BANDS, context.get("max_band_steps", 1)
    )
    fields.append(_field("band", band_result))

    cited_leader = leader.get("cited_ids", [])
    cited_validator = validator.get("cited_ids", [])
    cited_result = subset_of(cited_leader, context.get("provided_ids", []))
    if cited_result.ok:
        cited_result = subset_of(cited_validator, context.get("provided_ids", []))
    fields.append(_field("cited_ids", cited_result))

    invariant = _fail("INVARIANT_VIOLATION")
    if verdict_result.ok:
        verdict = normalize_enum(leader["verdict"], verdicts, context.get("enum_aliases"))
        invariant = consistent_with(
            verdict,
            context.get("deterministic_checks", {}),
            context.get("forbidden", {}),
        )
    fields.append(_field("consistent_with", invariant))
    return _finish(fields, ("digest",))


def compare_p2(leader, validator, context=None) -> dict:
    """Fact set with source-status as a first-class state."""

    context = context or {}
    if _schema_error(leader, validator, ("facts", "source_status")):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    if "source_status" not in leader or "source_status" not in validator:
        return _finish([_field("source_status", _fail("MISSING_FIELD"))])

    left_status, left_error = _safe(normalize_enum, leader["source_status"], SOURCE_STATES)
    right_status, right_error = _safe(normalize_enum, validator["source_status"], SOURCE_STATES)
    if left_error is not None or right_error is not None:
        return _finish([_field("source_status", _fail("UNKNOWN_ENUM"))])
    if left_status != right_status:
        return _finish([_field("source_status", _fail("SOURCE_MISMATCH"))])
    fields = [_field("source_status", Comparison(True, "OK"))]

    if not isinstance(leader.get("facts"), dict) or not isinstance(validator.get("facts"), dict):
        fields.append(_field("facts", _fail("FACT_MISMATCH")))
        return _finish(fields)

    if leader["source_status"] == "UNAVAILABLE" or validator["source_status"] == "UNAVAILABLE":
        invariant = _fail("INVARIANT_VIOLATION")
        if not leader["facts"] and not validator["facts"]:
            invariant = Comparison(True, "OK")
        fields.append(_field("unavailable_implies_empty", invariant))
        return _finish(fields)

    rules = context.get("rules")
    if not isinstance(rules, dict):
        raise ValueError("P2 context requires rules")
    fields.append(_field("facts", facts_match(leader["facts"], validator["facts"], rules)))
    return _finish(fields)


def compare_p3(leader, validator, context=None) -> dict:
    """Bounded number with integer tolerance and range invariants."""

    context = context or {}
    if _schema_error(leader, validator, ("value", "unit")):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    if "value" not in leader or "value" not in validator or "unit" not in leader or "unit" not in validator:
        return _finish([_field("schema", _fail("MISSING_FIELD"))])

    units = context.get("unit_set", ("UNIT",))
    unit_result = enum_equal(leader["unit"], validator["unit"], units)
    fields = [_field("unit", unit_result)]

    minimum = context.get("min")
    maximum = context.get("max")
    left, left_error = _safe(normalize_int, leader["value"], minimum, maximum)
    right, right_error = _safe(normalize_int, validator["value"], minimum, maximum)
    if left_error is not None or right_error is not None:
        reason = "OUT_OF_RANGE"
        try:
            normalize_int(leader["value"], minimum, maximum)
            normalize_int(validator["value"], minimum, maximum)
        except KitError as error:
            reason = error.reason
        fields.append(_field("value", _fail(reason)))
    else:
        mode = context.get("mode", "abs")
        if mode == "abs":
            fields.append(_field("value", int_within_abs(left, right, context.get("delta", 0))))
        elif mode == "bps":
            fields.append(
                _field("value", int_within_bps(left, right, context.get("tolerance_bps", 0)))
            )
        else:
            raise ValueError(f"unknown P3 mode: {mode!r}")
    return _finish(fields)


def compare_p4(leader, validator, context=None) -> dict:
    """Ranking with top-k overlap and an optional rank-distance cap."""

    context = context or {}
    if _schema_error(leader, validator, ("ranking",)):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    if "ranking" not in leader or "ranking" not in validator:
        return _finish([_field("ranking", _fail("MISSING_FIELD"))])

    candidates = context.get("candidates", [])
    universe = subset_of(leader["ranking"], candidates)
    if universe.ok:
        universe = subset_of(validator["ranking"], candidates)
    if not universe.ok:
        return _finish([_field("ranking", universe)])

    result = topk_overlap(
        leader["ranking"],
        validator["ranking"],
        context.get("k", 3),
        context.get("min_overlap_pct", 100),
        context.get("max_rank_distance"),
    )
    return _finish([_field("ranking", result)])


def compare_p5(leader, validator, context=None) -> dict:
    """Entity set equality or integer overlap threshold after text normalization."""

    context = context or {}
    if _schema_error(leader, validator, ("entities",)):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    if "entities" not in leader or "entities" not in validator:
        return _finish([_field("entities", _fail("MISSING_FIELD"))])

    left, left_error = _safe(normalize_entity_list, leader["entities"])
    right, right_error = _safe(normalize_entity_list, validator["entities"])
    if left_error is not None or right_error is not None:
        return _finish([_field("entities", _fail("WRONG_TYPE"))])

    mode = context.get("mode", "set_equal")
    if mode == "set_equal":
        result = Comparison(True, "OK") if left == right else _fail("SET_MISMATCH")
    elif mode == "overlap":
        threshold = context.get("threshold_pct", 50)
        if not isinstance(threshold, int) or isinstance(threshold, bool) or not 0 <= threshold <= 100:
            raise ValueError("threshold_pct must be an integer between 0 and 100")
        left_set, right_set = set(left), set(right)
        union = left_set | right_set
        if union and len(left_set & right_set) * 100 < threshold * len(union):
            result = _fail("OVERLAP_TOO_LOW")
        else:
            result = Comparison(True, "OK")
    else:
        raise ValueError(f"unknown P5 mode: {mode!r}")
    return _finish([_field("entities", result)])


def compare_p6(leader, validator, context=None) -> dict:
    """Boolean attestation with evidence subset and UNAVAILABLE as its own state."""

    context = context or {}
    if _schema_error(leader, validator, ("answer", "evidence_ids", "source_status")):
        return _finish([_field("schema", _fail("UNEXPECTED_FIELD"))])
    required = ("answer", "evidence_ids", "source_status")
    if any(name not in leader or name not in validator for name in required):
        return _finish([_field("schema", _fail("MISSING_FIELD"))])

    left_status, left_error = _safe(normalize_enum, leader["source_status"], SOURCE_STATES)
    right_status, right_error = _safe(normalize_enum, validator["source_status"], SOURCE_STATES)
    if left_error is not None or right_error is not None:
        return _finish([_field("source_status", _fail("UNKNOWN_ENUM"))])
    if left_status != right_status:
        return _finish([_field("source_status", _fail("SOURCE_MISMATCH"))])
    fields = [_field("source_status", Comparison(True, "OK"))]

    if left_status == "UNAVAILABLE":
        if not context.get("allow_unavailable", True):
            fields.append(_field("available", _fail("SOURCE_MISMATCH")))
            return _finish(fields)
        invariant = _fail("INVARIANT_VIOLATION")
        if not leader["evidence_ids"] and not validator["evidence_ids"]:
            invariant = Comparison(True, "OK")
        fields.append(_field("unavailable_implies_no_evidence", invariant))
        return _finish(fields)

    left_bool, left_bool_error = _safe(normalize_bool, leader["answer"])
    right_bool, right_bool_error = _safe(normalize_bool, validator["answer"])
    if left_bool_error is not None or right_bool_error is not None:
        fields.append(_field("answer", _fail("WRONG_TYPE")))
    elif left_bool != right_bool:
        fields.append(_field("answer", _fail("ENUM_MISMATCH")))
    else:
        fields.append(_field("answer", Comparison(True, "OK")))

    evidence_result = subset_of(leader["evidence_ids"], context.get("evidence_ids", []))
    if evidence_result.ok:
        evidence_result = subset_of(validator["evidence_ids"], context.get("evidence_ids", []))
    fields.append(_field("evidence_ids", evidence_result))
    return _finish(fields)


COMPARATORS = {
    "P1": compare_p1,
    "P2": compare_p2,
    "P3": compare_p3,
    "P4": compare_p4,
    "P5": compare_p5,
    "P6": compare_p6,
}


def compare_pattern(pattern_id: str, leader, validator, context=None) -> dict:
    if pattern_id not in COMPARATORS:
        raise ValueError(f"unknown pattern: {pattern_id!r}")
    return COMPARATORS[pattern_id](leader, validator, context)


PATTERNS = {
    "P1": {
        "id": "P1",
        "name": "Verdict plus band",
        "use_when": "A judgment comes with confidence: eligibility, compliance, support.",
        "fields": [
            {"name": "verdict", "normalizer": "normalize_enum", "comparator": "enum_equal", "compared": True},
            {"name": "band", "normalizer": "normalize_enum", "comparator": "ordinal_within(1)", "compared": True},
            {"name": "cited_ids", "normalizer": "normalize_id_list", "comparator": "subset_of(universe)", "compared": True},
            {"name": "digest", "normalizer": "clip_text", "comparator": "none", "compared": False},
        ],
        "invariants": ["consistent_with(verdict, deterministic_checks, forbidden)"],
        "tolerance_rationale": "Models disagree on confidence more than on the decision; one band step absorbs that without allowing a decision flip.",
        "failure_behavior": "LLM_ERROR with a reason code; state unchanged.",
        "why_not_strict_eq": "One band step and id ordering vary honestly between validators; digest prose always differs.",
        "known_limits": ["Cannot detect a consistently wrong verdict shared by every validator."],
    },
    "P2": {
        "id": "P2",
        "name": "Fact set",
        "use_when": "Extracting a fixed set of structured facts from a web page or API.",
        "fields": [
            {"name": "source_status", "normalizer": "normalize_enum", "comparator": "enum_equal", "compared": True},
            {"name": "facts", "normalizer": "per-fact", "comparator": "facts_match(rules)", "compared": True},
        ],
        "invariants": ["UNAVAILABLE implies no fact values"],
        "tolerance_rationale": "Counts and dates are bucketed; headings use normalized keys and a documented alias table.",
        "failure_behavior": "EXTERNAL with SOURCE_UNREACHABLE; downstream treats it as insufficient evidence, never a negative finding.",
        "why_not_strict_eq": "Page markup, heading case, counts and fetch order vary between validators.",
        "known_limits": ["Does not verify that the page content is true."],
    },
    "P3": {
        "id": "P3",
        "name": "Bounded number",
        "use_when": "A score, count, price or measurement has natural noise.",
        "fields": [
            {"name": "unit", "normalizer": "normalize_enum", "comparator": "enum_equal", "compared": True},
            {"name": "value", "normalizer": "normalize_int", "comparator": "int_within_abs or int_within_bps", "compared": True},
        ],
        "invariants": ["value inside [min, max]", "zero handled explicitly"],
        "tolerance_rationale": "Tolerance comes from observed variation and is recorded as integer basis points.",
        "failure_behavior": "LLM_ERROR OUT_OF_RANGE or WRONG_TYPE; state unchanged.",
        "why_not_strict_eq": "Independent measurement and model runs differ by small integer amounts.",
        "known_limits": ["A biased source that shifts every validator is not detected."],
    },
    "P4": {
        "id": "P4",
        "name": "Ranking",
        "use_when": "Ordering candidates by a rubric.",
        "fields": [
            {"name": "ranking", "normalizer": "normalize_ranked_id_list", "comparator": "topk_overlap(k, threshold, rank cap)", "compared": True},
        ],
        "invariants": ["every ranked id is in the candidate universe"],
        "tolerance_rationale": "Near-ties swap inside the top-k; the overlap threshold and rank cap are explicit integers.",
        "failure_behavior": "LLM_ERROR UNKNOWN_ID or TOPK_MISMATCH; state unchanged.",
        "why_not_strict_eq": "Near-ties and tail order legitimately vary between model runs.",
        "known_limits": ["A shared bias in candidate selection is invisible to the rule."],
    },
    "P5": {
        "id": "P5",
        "name": "Entity set",
        "use_when": "Extracting entities, names or ids where order does not matter.",
        "fields": [
            {"name": "entities", "normalizer": "normalize_entity_list", "comparator": "set_equal or overlap_at_least", "compared": True},
        ],
        "invariants": ["duplicates are removed before comparison"],
        "tolerance_rationale": "Casing, whitespace and duplicates are noise; the overlap threshold is an explicit integer percentage.",
        "failure_behavior": "LLM_ERROR WRONG_TYPE; state unchanged.",
        "why_not_strict_eq": "Order, casing and duplicates vary without changing the extracted set.",
        "known_limits": ["Aliases not listed in the domain's alias table count as different entities."],
    },
    "P6": {
        "id": "P6",
        "name": "Boolean attestation",
        "use_when": "A single yes/no about the world, with evidence ids.",
        "fields": [
            {"name": "source_status", "normalizer": "normalize_enum", "comparator": "enum_equal", "compared": True},
            {"name": "answer", "normalizer": "normalize_bool", "comparator": "exact boolean", "compared": True},
            {"name": "evidence_ids", "normalizer": "normalize_id_list", "comparator": "subset_of(universe)", "compared": True},
        ],
        "invariants": ["UNAVAILABLE is never treated as false"],
        "tolerance_rationale": "A boolean has no tolerance; only the source state may vary, and it is its own state.",
        "failure_behavior": "EXTERNAL SOURCE_UNREACHABLE or LLM_ERROR; state unchanged.",
        "why_not_strict_eq": "The source may be down for one validator; that is not a negative finding.",
        "known_limits": ["Cannot detect a shared wrong belief about the world."],
    },
}
