"""Vendored-equivalence gate (AGENTS section 16).

The deployed contracts cannot import sibling modules, so the primitives are inlined by
``tools/vendor.py``. This test proves two things:

1. The committed block is fresh (regenerating it changes nothing).
2. For a broad sample of inputs, the vendored functions return exactly the same value or
   raise exactly the same classified error as the package functions.

If either check fails, the contracts must not be deployed.
"""

import subprocess
import sys
from pathlib import Path

import pytest

import equivalencekit.compare as package_compare
import equivalencekit.digest as package_digest
import equivalencekit.normalize as package_normalize
import equivalencekit.parsing as package_parsing
import equivalencekit.patterns as package_patterns

ROOT = Path(__file__).resolve().parent.parent.parent
CONTRACT = ROOT / "contracts" / "verdict_judge.py"
BEGIN = "# BEGIN VENDORED PRIMITIVES"
END = "# END VENDORED PRIMITIVES"


def _vendored_namespace():
    text = CONTRACT.read_text()
    start = text.index(BEGIN)
    stop = text.index(END, start) + len(END)
    block = text[start:stop]
    namespace = {}
    exec(compile(block, "<vendored-primitives>", "exec"), namespace)
    return namespace, block


VENDORED, BLOCK = _vendored_namespace()


def _outcome(fn, args, kwargs):
    try:
        return ("return", fn(*args, **kwargs))
    except Exception as error:  # noqa: BLE001 - outcomes include classified errors
        return ("raise", type(error).__name__, str(error))


def _check(function_name, samples, package_module):
    package_fn = getattr(package_module, function_name)
    vendored_fn = VENDORED[function_name]
    for args, kwargs in samples:
        expected = _outcome(package_fn, args, kwargs)
        actual = _outcome(vendored_fn, args, kwargs)
        assert actual == expected, (function_name, args, kwargs, expected, actual)


NORMALIZE_SAMPLES = {
    "normalize_text": [
        (("",), {}),
        (("  Hello   World ",), {}),
        (("Ｆｕｌｌ　Ｗｉｄｔｈ",), {}),
        (("a\tb\nc",), {}),
        (("x" * 1000,), {}),
        (("Café",), {}),
    ],
    "normalize_enum": [
        (("eligible", ("ELIGIBLE", "INELIGIBLE")), {}),
        (("  in-eligible ", ("ELIGIBLE", "INELIGIBLE")), {"aliases": {"in-eligible": "INELIGIBLE"}}),
        (("MAYBE", ("ELIGIBLE", "INELIGIBLE")), {}),
    ],
    "normalize_bool": [
        ((True,), {}),
        (("yes",), {}),
        ((" NO ",), {}),
        ((1,), {}),
        ((0,), {}),
        (("maybe",), {}),
    ],
    "normalize_int": [
        ((5,), {}),
        (("42",), {}),
        (("4.5",), {}),
        ((5, 1, 10), {}),
        ((11, 1, 10), {}),
        ((True,), {}),
    ],
    "normalize_ratio_bps": [
        ((1, 2), {}),
        ((0, 0), {}),
        ((1, 0), {}),
        ((-1, 2), {}),
    ],
    "normalize_id_list": [
        ((["b", "a", "a"],), {}),
        ((["a b"],), {}),
        ((["a"],), {"max_items": 1}),
        ((["a", "b"],), {"max_items": 1}),
    ],
    "normalize_ranked_id_list": [
        ((["b", "a", "b"],), {}),
        ((["a", "a", "c"],), {}),
    ],
    "normalize_entity_list": [
        (([" Alpha ", "beta", "ALPHA"],), {}),
        ((["Beta Corp", " beta corp "],), {}),
    ],
    "strip_volatile": [
        (({"a": 1, "timestamp": "x", "nested": {"updated_at": "y", "b": 2}},), {}),
        (([{"id": "1", "request_id": "r", "v": 2}],), {}),
    ],
    "bucketize": [
        ((0, (10, 20)), {}),
        ((10, (10, 20)), {}),
        ((19, (10, 20)), {}),
        ((20, (10, 20)), {}),
        ((21, (10, 20)), {}),
        ((5, (20, 10)), {}),
    ],
    "extract_headings": [
        (("# A\n## B\n# A\n",), {}),
        (("plain text",), {}),
        (("",), {}),
    ],
    "normalize_ws_lines": [
        ((" a \n\n b ",), {}),
        (("x" * 1000,), {}),
    ],
}

COMPARE_SAMPLES = {
    "enum_equal": [
        (("ELIGIBLE", "eligible", ("ELIGIBLE", "INELIGIBLE")), {}),
        (("X", "X", ("A",)), {}),
    ],
    "ordinal_within": [
        (("LOW", "HIGH", ("LOW", "MEDIUM", "HIGH")), {"max_steps": 1}),
        (("LOW", "HIGH", ("LOW", "MEDIUM", "HIGH")), {"max_steps": 2}),
        (("LOW", "LOW", ("LOW", "MEDIUM", "HIGH")), {}),
    ],
    "int_within_abs": [
        ((10, 12, 2), {}),
        ((10, 13, 2), {}),
        ((-5, -3, 2), {}),
    ],
    "int_within_bps": [
        ((100, 101, 100), {}),
        ((100, 102, 100), {}),
        ((0, 0, 100), {}),
        ((0, 1, 100), {}),
        ((-100, -101, 100), {}),
    ],
    "bucket_adjacent": [
        ((5, 15, (10, 20)), {}),
        ((5, 25, (10, 20)), {}),
        ((0, 0, (10, 20)), {}),
    ],
    "set_equal": [
        ((["a", "b"], ["b", "a"]), {}),
        ((["a"], ["a", "b"]), {}),
        ((["a", "a"], ["a"]), {}),
    ],
    "subset_of": [
        ((["a"], ["a", "b"]), {}),
        ((["a", "z"], ["a"]), {}),
        (([], ["a"]), {}),
    ],
    "overlap_at_least": [
        ((["a", "b"], ["a"], 50), {}),
        ((["a", "b"], ["a"], 51), {}),
        (([], [], 100), {}),
    ],
    "topk_overlap": [
        ((["a", "b", "c"], ["a", "c", "b"], 3, 66, 1), {}),
        ((["a", "b", "c"], ["a", "c", "b"], 3, 100, 0), {}),
        ((["a", "b"], ["a", "b"], 3, 66, 1), {}),
        ((["a", "b", "c"], ["c", "b", "a"], 3, 66, None), {}),
        ((["a", "b", "c"], ["a", "b", "c"], 0, 66, 1), {}),
    ],
    "facts_match": [
        (
            (
                {"b": True, "n": 5},
                {"b": True, "n": 6},
                {"b": {"kind": "bool"}, "n": {"kind": "int_abs", "delta": 1}},
            ),
            {},
        ),
        (
            (
                {"b": True, "n": 5},
                {"b": False, "n": 5},
                {"b": {"kind": "bool"}, "n": {"kind": "int_abs", "delta": 1}},
            ),
            {},
        ),
        (
            (
                {"b": True},
                {"b": True, "extra": 1},
                {"b": {"kind": "bool"}},
            ),
            {},
        ),
    ],
    "consistent_with": [
        (("ELIGIBLE", {"hard": False}, {"hard": ["ELIGIBLE"]}), {}),
        (("INELIGIBLE", {"hard": False}, {"hard": ["ELIGIBLE"]}), {}),
        (("ELIGIBLE", {"hard": True}, {"hard": ["ELIGIBLE"]}), {}),
        (("ANY", {}, {}), {}),
    ],
}

PARSE_SPEC = {
    "fields": {
        "verdict": {"type": "enum", "allowed": ["ELIGIBLE", "INELIGIBLE"], "required": True},
        "count": {"type": "int", "min": 0, "max": 10, "required": True},
        "ids": {"type": "id_list", "required": False, "default": [], "universe": ["a", "b"]},
        "note": {"type": "text", "required": False, "default": "", "max_len": 20},
    }
}

PARSE_SAMPLES = {
    "parse_with_spec": [
        (({"verdict": "eligible", "count": 3, "ids": ["b", "a"]}, PARSE_SPEC), {}),
        (('```json\n{"verdict": "ELIGIBLE", "count": 3}\n```', PARSE_SPEC), {}),
        (('here you go: {"verdict": "ELIGIBLE", "count": 3} thanks', PARSE_SPEC), {}),
        (({"count": 3}, PARSE_SPEC), {}),
        (({"verdict": "MAYBE", "count": 3}, PARSE_SPEC), {}),
        (({"verdict": "ELIGIBLE", "count": 11}, PARSE_SPEC), {}),
        (({"verdict": "ELIGIBLE", "count": 3, "ids": ["z"]}, PARSE_SPEC), {}),
        (({"verdict": "ELIGIBLE", "count": "3"}, PARSE_SPEC), {}),
        (({"verdict": "ELIGIBLE", "count": 3, "extra": 1}, PARSE_SPEC), {}),
        (("not json at all", PARSE_SPEC), {}),
    ],
    "extract_json_object": [
        (('text {"a": 1} tail',), {}),
        (('```json\n{"a": 1}\n```',), {}),
        (("no json",), {}),
        (('{"a": {"b": 2}}',), {}),
    ],
    "strip_fences": [
        (('```json\n{"a": 1}\n```',), {}),
        (("plain",), {}),
        (("  ```\nx\n```  ",), {}),
    ],
    "clip_text": [
        (("short",), {}),
        (("x" * 100,), {"max_len": 10}),
        (("a\nb\tc",), {}),
    ],
}

DIGEST_SAMPLES = {
    "fnv1a_32": [
        (("",), {}),
        (("a",), {}),
        (("foobar",), {}),
        (("Café",), {}),
        ((123,), {}),
        (("x" * (16 * 1024 + 1),), {}),
    ],
    "digest_hex": [
        (("same",), {}),
        (("same ",), {}),
    ],
}

PATTERN_SAMPLES = {
    "compare_p2": [
        (
            (
                {"source_status": "OK", "facts": {"b": True, "n": 300}},
                {"source_status": "ok", "facts": {"b": "yes", "n": 301}},
                {"rules": {"b": {"kind": "bool"}, "n": {"kind": "bucket", "edges": [300, 1000]}}},
            ),
            {},
        ),
        (
            (
                {"source_status": "OK", "facts": {"b": True}},
                {"source_status": "UNAVAILABLE", "facts": {}},
                {"rules": {"b": {"kind": "bool"}}},
            ),
            {},
        ),
        (
            (
                {"source_status": "UNAVAILABLE", "facts": {}},
                {"source_status": "UNAVAILABLE", "facts": {}},
                {"rules": {"b": {"kind": "bool"}}},
            ),
            {},
        ),
        (
            (
                {"source_status": "UNAVAILABLE", "facts": {"b": False}},
                {"source_status": "UNAVAILABLE", "facts": {"b": False}},
                {"rules": {"b": {"kind": "bool"}}},
            ),
            {},
        ),
        (
            (
                {"source_status": "OK", "facts": {"b": True}},
                {"source_status": "OK", "facts": {"b": True, "extra": 1}},
                {"rules": {"b": {"kind": "bool"}}},
            ),
            {},
        ),
    ],
    "compare_p1": [
        (
            (
                {"verdict": "ELIGIBLE", "band": "LOW", "cited_ids": ["a"], "digest": "one"},
                {"verdict": "eligible", "band": "MEDIUM", "cited_ids": ["a"], "digest": "two"},
                {
                    "verdict_set": ["ELIGIBLE", "INELIGIBLE"],
                    "provided_ids": ["a"],
                    "deterministic_checks": {"hard": True},
                    "forbidden": {"hard": ["ELIGIBLE"]},
                },
            ),
            {},
        ),
        (
            (
                {"verdict": "ELIGIBLE", "band": "LOW", "cited_ids": ["a"]},
                {"verdict": "ELIGIBLE", "band": "HIGH", "cited_ids": ["a"]},
                {
                    "verdict_set": ["ELIGIBLE", "INELIGIBLE"],
                    "provided_ids": ["a"],
                },
            ),
            {},
        ),
    ],
}


@pytest.mark.parametrize("function_name", sorted(NORMALIZE_SAMPLES))
def test_vendored_normalizers_match_package(function_name):
    _check(function_name, NORMALIZE_SAMPLES[function_name], package_normalize)


@pytest.mark.parametrize("function_name", sorted(COMPARE_SAMPLES))
def test_vendored_comparators_match_package(function_name):
    _check(function_name, COMPARE_SAMPLES[function_name], package_compare)


@pytest.mark.parametrize("function_name", sorted(PARSE_SAMPLES))
def test_vendored_parsing_matches_package(function_name):
    _check(function_name, PARSE_SAMPLES[function_name], package_parsing)


@pytest.mark.parametrize("function_name", sorted(DIGEST_SAMPLES))
def test_vendored_digest_matches_package(function_name):
    _check(function_name, DIGEST_SAMPLES[function_name], package_digest)


@pytest.mark.parametrize("function_name", sorted(PATTERN_SAMPLES))
def test_vendored_patterns_match_package(function_name):
    _check(function_name, PATTERN_SAMPLES[function_name], package_patterns)


def test_all_of_matches_package():
    package_results = [
        package_compare.Comparison(True, "OK"),
        package_compare.Comparison(False, "SECOND"),
    ]
    vendored_results = [
        VENDORED["Comparison"](True, "OK"),
        VENDORED["Comparison"](False, "SECOND"),
    ]
    assert _outcome(VENDORED["all_of"], (vendored_results,), {}) == _outcome(
        package_compare.all_of, (package_results,), {}
    )


def test_vendored_block_is_fresh():
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "vendor.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_excluded_helpers_are_not_vendored():
    assert "normalize_url" not in VENDORED
    assert "urllib.parse" not in BLOCK


def test_vendored_block_has_no_package_imports():
    for line in BLOCK.splitlines():
        stripped = line.strip()
        if stripped.startswith("from .") or stripped.startswith("import equivalencekit"):
            pytest.fail(f"package import leaked into vendored block: {line}")
