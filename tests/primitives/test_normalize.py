import random

import pytest

from equivalencekit.errors import KitError
from equivalencekit.normalize import (
    bucketize,
    extract_headings,
    normalize_bool,
    normalize_enum,
    normalize_id_list,
    normalize_int,
    normalize_ratio_bps,
    normalize_text,
    normalize_url,
    normalize_ws_lines,
    strip_volatile,
)


def test_normalize_text_canonical_and_idempotent():
    assert normalize_text("  Hello   WORLD ") == "hello world"
    assert normalize_text("Ａ  B") == "a b"
    assert normalize_text("line\n\tbreak") == "line break"
    assert normalize_text(normalize_text("  Hello   WORLD ")) == "hello world"


def test_normalize_text_rejects_wrong_type_and_oversize():
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_text(1)
    with pytest.raises(KitError, match="OVER_LIMIT"):
        normalize_text("a" * 20000)


@pytest.mark.parametrize(
    "raw,expected",
    [
        (" Eligible ", "ELIGIBLE"),
        ("eligible", "ELIGIBLE"),
        ("IN-ELIGIBLE", "INELIGIBLE"),
        ("in eligible", "INELIGIBLE"),
        ("not eligible", "INELIGIBLE"),
    ],
)
def test_normalize_enum_aliases(raw, expected):
    allowed = ("ELIGIBLE", "INELIGIBLE")
    aliases = {
        "in-eligible": "INELIGIBLE",
        "in eligible": "INELIGIBLE",
        "not eligible": "INELIGIBLE",
    }
    assert normalize_enum(raw, allowed, aliases) == expected


def test_normalize_enum_rejects_unknown_and_bad_type():
    with pytest.raises(KitError, match="UNKNOWN_ENUM"):
        normalize_enum("maybe", ("YES", "NO"))
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_enum(None, ("YES", "NO"))


def test_normalize_enum_rejects_colliding_configuration():
    with pytest.raises(ValueError):
        normalize_enum("A", ("A", "a"))


def test_normalize_bool_documented_tokens_only():
    for raw in ("true", "TRUE", " yes ", "1", "on"):
        assert normalize_bool(raw) is True
    for raw in ("false", " No ", "0", "off"):
        assert normalize_bool(raw) is False
    assert normalize_bool(True) is True
    assert normalize_bool(1) is True
    with pytest.raises(KitError, match="UNKNOWN_ENUM"):
        normalize_bool("maybe")
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_bool(2)


def test_normalize_int_formats_and_ranges():
    assert normalize_int(" 42 ") == 42
    assert normalize_int(-7) == -7
    assert normalize_int("+3") == 3
    assert normalize_int("-0") == 0
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_int(3.0)  # ekit: ignore A13
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_int("3.5")
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_int(True)
    with pytest.raises(KitError, match="OUT_OF_RANGE"):
        normalize_int(11, min_value=0, max_value=10)


def test_normalize_ratio_bps_rounds_half_up_without_floats():
    assert normalize_ratio_bps(1, 3) == 3333
    assert normalize_ratio_bps(2, 3) == 6667
    assert normalize_ratio_bps(0, 5) == 0
    assert normalize_ratio_bps(5, 5) == 10000
    with pytest.raises(KitError, match="OUT_OF_RANGE"):
        normalize_ratio_bps(6, 5)
    with pytest.raises(KitError, match="OUT_OF_RANGE"):
        normalize_ratio_bps(1, 0)


def test_normalize_id_list_dedupes_sorts_and_bounds():
    assert normalize_id_list([" b ", "a", "b", "a-1"]) == ("a", "a-1", "b")
    with pytest.raises(KitError, match="UNKNOWN_ID"):
        normalize_id_list(["bad id"])
    with pytest.raises(KitError, match="UNKNOWN_ID"):
        normalize_id_list(["x" * 65])
    with pytest.raises(KitError, match="OVER_LIMIT"):
        normalize_id_list(["x"] * 65)
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_id_list("not-a-list")


def test_normalize_url_canonical():
    raw = "HTTPS://Example.COM:443/path?utm_source=x&b=2&a=1#frag"
    assert normalize_url(raw) == "https://example.com/path?a=1&b=2"
    assert normalize_url("http://Example.com") == "http://example.com/"
    assert normalize_url("https://x.test/p?fbclid=1&q=2") == "https://x.test/p?q=2"


def test_normalize_url_rejects_credentials_and_non_http():
    with pytest.raises(KitError, match="FORBIDDEN"):
        normalize_url("https://user:pass@example.com/")
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_url("ftp://example.com/")
    with pytest.raises(KitError, match="WRONG_TYPE"):
        normalize_url("not a url")


def test_strip_volatile_nested():
    value = {
        "title": "x",
        "updated_at": "2026-01-01",
        "nested": {"request_id": "abc", "value": 3},
        "items": [{"timestamp": 1, "keep": True}],
    }
    assert strip_volatile(value) == {
        "title": "x",
        "nested": {"value": 3},
        "items": [{"keep": True}],
    }


def test_bucketize_inclusive_edges():
    edges = (10, 20)
    assert bucketize(-5, edges) == 0
    assert bucketize(10, edges) == 0
    assert bucketize(11, edges) == 1
    assert bucketize(20, edges) == 1
    assert bucketize(21, edges) == 2


def test_bucketize_rejects_bad_edges():
    with pytest.raises(KitError, match="INVALID_ARGUMENT"):
        bucketize(1, (10, 10))
    with pytest.raises(KitError, match="OVER_LIMIT"):
        bucketize(1, ())


def test_extract_headings_markdown_html_aliases_and_duplicates():
    text = """
# Title
## Overview
### Overview
<h2>Pricing</h2>
<h3><span>Details</span></h3>
not a heading
"""
    assert extract_headings(text) == ("details", "overview", "pricing", "title")


def test_extract_headings_empty_and_bounded():
    assert extract_headings("") == ()
    with pytest.raises(KitError, match="OVER_LIMIT"):
        extract_headings("a" * 20000)


def test_normalize_ws_lines_for_digests():
    raw = "  first   line  \n\n second\tline\n\n"
    assert normalize_ws_lines(raw) == "first line\n\nsecond line"


def test_normalize_text_property_on_bounded_input():
    rng = random.Random(7)
    alphabet = "abc ABC \t\n123-_./éÉＡ"
    for _ in range(200):
        raw = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 120)))
        once = normalize_text(raw)
        assert normalize_text(once) == once
