import pytest

from equivalencekit import bounds
from equivalencekit.errors import KitError, error_from_code, is_registered, make_error


def test_make_error_is_stable_and_registered():
    assert make_error("LLM_ERROR", "UNKNOWN_ENUM") == "LLM_ERROR: UNKNOWN_ENUM"
    assert make_error("EXPECTED", "OVER_LIMIT") == "EXPECTED: OVER_LIMIT"
    assert is_registered("EXTERNAL", "SOURCE_EMPTY")
    assert not is_registered("EXTERNAL", "NOPE")


def test_unknown_prefix_or_reason_is_a_programming_error():
    with pytest.raises(ValueError):
        make_error("WHOOPS", "OVER_LIMIT")
    with pytest.raises(ValueError):
        make_error("EXPECTED", "WHOOPS")


def test_error_from_code_roundtrip():
    error = error_from_code("LLM_ERROR: BAD_JSON")
    assert isinstance(error, KitError)
    assert str(error) == "LLM_ERROR: BAD_JSON"
    with pytest.raises(ValueError):
        error_from_code("bad")


def test_error_strings_are_stable_and_have_no_varying_digits():
    first = make_error("EXPECTED", "NOT_AUTHORIZED")
    second = make_error("EXPECTED", "NOT_AUTHORIZED")
    assert first == second
    assert not any(char.isdigit() for char in first)


def test_require_within():
    bounds.require_within("x", 0, 10)
    bounds.require_within("x", 10, 10)
    with pytest.raises(KitError, match="OVER_LIMIT"):
        bounds.require_within("x", 11, 10)
    with pytest.raises(KitError, match="OVER_LIMIT"):
        bounds.require_within("x", -1, 10)


def test_bounds_are_positive_and_ordered():
    assert 0 < bounds.MAX_DIGEST <= bounds.MAX_TEXT
    assert 0 < bounds.MAX_ID_LEN
    assert 0 < bounds.MAX_IDS
    assert 0 < bounds.MAX_ROUNDS
    assert 0 < bounds.MAX_BUCKETS
