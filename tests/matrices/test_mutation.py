"""Mutation testing of the comparators: proof that the acceptance matrices catch bugs.

For each deterministic mutant (a one-token change to `equivalencekit/compare.py` that
mirrors a real bug class — a boundary drift, a polarity flip, a dropped check), the
mutated module is compiled into a fresh namespace, grafted over `models.patterns`, and
every acceptance-matrix case is re-run. The mutant must change at least one verdict:

* a boundary mutant must change a BOUNDARY case verdict,
* a polarity mutant must flip a MUST_REJECT into an accept or vice versa.

A mutant that survives means the matrix is too loose — a bug in the test tooling of the
kit itself, and this suite fails. Comparators are the consensus surface, so matrices
must not pass mutants silently.
"""

import json
import re
from pathlib import Path

import pytest

import equivalencekit.patterns as patterns
from equivalencekit.patterns import compare_pattern

REPO_ROOT = Path(__file__).parents[2]
COMPARE_SOURCE = (REPO_ROOT / "equivalencekit" / "compare.py").read_text()
MATRICES_DIR = REPO_ROOT / "tests" / "matrices"

#: name -> (unique anchor in compare.py, replacement)
MUTANTS = {
    "int_within_bps-edge-drift": (
        "if abs(left - right) * 10000 <= tolerance_bps * scale:",
        "if abs(left - right) * 10000 < tolerance_bps * scale:",
    ),
    "ordinal_within-boundary-drift": (
        "if distance > max_steps:",
        "if distance >= max_steps:",
    ),
    "int_within_abs-boundary-drift": (
        "if abs(left - right) > delta:",
        "if abs(left - right) >= delta:",
    ),
    "subset_of-dropped-check": (
        "if item not in universe:\n            return _fail(\"UNKNOWN_ID\")",
        "if False:\n            return _fail(\"UNKNOWN_ID\")",
    ),
    "enum_equal-polarity": (
        'if left != right:\n        return _fail("ENUM_MISMATCH")',
        'if left == right:\n        return _fail("ENUM_MISMATCH")',
    ),
}

#: The comparator names patterns.py imported — the only graft points needed.
PATCH_NAMES = (
    "consistent_with", "enum_equal", "facts_match", "int_within_abs",
    "int_within_bps", "ordinal_within", "subset_of", "topk_overlap",
)


def _matrix_cases() -> list[tuple[str, dict]]:
    cases: list[tuple[str, dict]] = []
    for matrix_path in sorted(MATRICES_DIR.glob("P*.json")):
        spec = json.loads(matrix_path.read_text())
        for case in spec["cases"]:
            cases.append((spec["pattern"], case))
    return cases


def _baseline() -> dict[tuple[str, str], tuple[bool, str]]:
    outcomes: dict[tuple[str, str], tuple[bool, str]] = {}
    for pattern_id, case in _matrix_cases():
        result = compare_pattern(pattern_id, case["leader"], case["validator"], case["context"])
        outcomes[(pattern_id, case["id"])] = (result["ok"], result["reason"])
    return outcomes


def _mutated_namespace(monkeypatch: pytest.MonkeyPatch, anchor: str, replacement: str):
    assert anchor in COMPARE_SOURCE, f"mutation anchor drifted: {anchor[:40]!r}"
    mutant_source = COMPARE_SOURCE.replace(anchor, replacement, 1)
    ast_parsable = re.sub(r"^from \.(\w+) import", r"from equivalencekit.\1 import",
                          mutant_source, flags=re.MULTILINE)
    namespace: dict = {"__name__": "equivalencekit.compare.mutant"}
    exec(compile(ast_parsable, "mutant_compare", "exec"), namespace)
    for name in PATCH_NAMES:
        monkeypatch.setattr(patterns, name, namespace[name], raising=True)
    return namespace


@pytest.mark.parametrize("name", sorted(MUTANTS))
def test_matrix_distinguishes_mutant(monkeypatch: pytest.MonkeyPatch, name: str):
    anchor, replacement = MUTANTS[name]
    baseline = _baseline()
    _mutated_namespace(monkeypatch, anchor, replacement)

    changed: list[str] = []
    for pattern_id, case in _matrix_cases():
        result = compare_pattern(pattern_id, case["leader"], case["validator"], case["context"])
        if (result["ok"], result["reason"]) != baseline[(pattern_id, case["id"])]:
            changed.append(f"{pattern_id}#{case['id']}")
    monkeypatch.undo()

    assert changed, f"mutant {name} survived: no acceptance-matrix case distinguishes it"


def test_mutants_describe_their_bug():
    # Each mutant must actually change the comparator's behaviour on plain inputs —
    # a mutation harness whose mutants are no-ops would prove nothing.
    from equivalencekit.compare import enum_equal, int_within_abs, int_within_bps, ordinal_within, subset_of

    assert not int_within_bps(10, 13, 100).ok            # 30000 > 100 * 13 — beyond tolerance
    assert int_within_bps(100, 101, 1000).ok             # 10000 <= 1000 * 101 — inside tolerance
    assert not ordinal_within("LOW", "HIGH", ("LOW", "MEDIUM", "HIGH"), max_steps=1).ok
    assert ordinal_within("LOW", "MEDIUM", ("LOW", "MEDIUM", "HIGH"), max_steps=1).ok
    assert not int_within_abs(10, 11, 0).ok
    assert int_within_abs(10, 11, 1).ok
    assert not subset_of(["c9"], ["c1"]).ok
    assert subset_of(["c1"], ["c1", "c2"]).ok
    assert not enum_equal("ELIGIBLE", "INELIGIBLE", ("ELIGIBLE",)).ok
    assert enum_equal("ELIGIBLE", " eligible ", ("ELIGIBLE",)).ok
