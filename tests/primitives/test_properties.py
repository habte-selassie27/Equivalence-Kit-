"""Property-based tests with Hypothesis.

Random bounded inputs are fed through the pure primitives and the invariants a
validator depends on are asserted for every generated case:

* normalizers are idempotent — ``normalize(normalize(x)) == normalize(x)``;
* id lists are order- and duplicate-insensitive: the canonical form of any
  permutation is the same canonical form;
* texts normalise to a bounded, whitespace-collapsed, lowercase form;
* buckets are monotone and respect their inclusive edges;
* ``int_within_bps`` is symmetric and accepts exactly at the tolerance edge;
* comparators never raise on any pair of valid outputs (they return Comparison).

Strategies are kept small and bounded on purpose: GenVM-sized inputs, not stress
tests. Each property is a contract a validator can rely on.
"""

import string

from hypothesis import given, settings
from hypothesis import strategies as st

from equivalencekit.compare import (
    Comparison,
    bucket_adjacent,
    int_within_bps,
    ordinal_within,
    set_equal,
    subset_of,
)
from equivalencekit.normalize import (
    MAX_IDS,
    MAX_ID_LEN,
    MAX_TEXT,
    bucketize,
    normalize_enum,
    normalize_id_list,
    normalize_text,
)

small_text = st.text(
    alphabet=string.printable, max_size=2 * MAX_TEXT // 3
).filter(lambda s: s.strip() != "")

id_token = st.tuples(
    st.sampled_from(string.ascii_letters + string.digits),
    st.text(alphabet=string.ascii_letters + string.digits + "_.:-", max_size=MAX_ID_LEN - 1),
).map(lambda pair: pair[0] + pair[1])
ids = st.lists(id_token, max_size=MAX_IDS)

TOKENS = frozenset({"LOW", "MEDIUM", "HIGH"})


@settings(max_examples=150, deadline=None)
@given(value=small_text)
def test_normalize_text_is_idempotent_and_canonical(value: str):
    once = normalize_text(value)
    assert normalize_text(once) == once
    # Collapse semantics: no double spaces survive, everything lowercase, bounded.
    assert "  " not in once
    assert once == once.lower()
    assert len(once) <= MAX_TEXT


@settings(max_examples=150, deadline=None)
@given(value=small_text)
def test_normalize_enum_is_idempotent(value: str):
    alias_map = {"lo": "LOW", "hi": "HIGH"}
    try:
        once = normalize_enum(value, TOKENS, alias_map)
    except Exception:
        return  # unknown enums raise; that is documented behaviour
    assert normalize_enum(once, TOKENS, alias_map) == once
    assert once in TOKENS


@settings(max_examples=150, deadline=None)
@given(values=ids)
def test_normalize_id_list_is_order_and_duplicate_insensitive(values):
    canonical = normalize_id_list(values)
    assert canonical == normalize_id_list(list(reversed(values)))
    assert canonical == normalize_id_list(values * 2)
    assert len(canonical) == len(set(canonical))
    for item in canonical:
        assert item and len(item) <= MAX_ID_LEN and item == item.strip()


@settings(max_examples=150, deadline=None)
@given(left=st.integers(-10**9, 10**9), right=st.integers(-10**9, 10**9),
       tolerance=st.integers(0, 10000))
def test_int_within_bps_is_symmetric(left, right, tolerance):
    result = int_within_bps(left, right, tolerance)
    flipped = int_within_bps(right, left, tolerance)
    assert result.ok == flipped.ok
    assert result.reason == flipped.reason


@settings(max_examples=150, deadline=None)
@given(a=st.integers(-10**9, 10**9), b=st.integers(-10**9, 10**9),
       tolerance=st.integers(0, 10000))
def test_int_within_bps_matches_the_cross_multiplication_rule(a, b, tolerance):
    result = int_within_bps(a, b, tolerance)
    if a == 0 and b == 0:
        # Documented special case: zero versus zero is always agreement.
        assert result.ok
    else:
        scale = max(abs(a), abs(b))
        expected = abs(a - b) * 10000 <= tolerance * scale
        assert result.ok == expected


def test_int_within_bps_documented_edges():
    assert int_within_bps(0, 0, 0).ok
    assert not int_within_bps(0, 1, 0).ok          # zero tolerance is strict equality
    assert not int_within_bps(0, 1, 9999).ok       # 10000 > 9999 * 1
    assert int_within_bps(0, 1, 10000).ok          # full tolerance admits any 1x ratio
    assert int_within_bps(100, 101, 10000).ok      # and any delta within the magnitude


EDGES = (10, 20, 30)


@settings(max_examples=150, deadline=None)
@given(left=st.integers(-100, 100), right=st.integers(-100, 100))
def test_bucketize_monotone_and_bucket_adjacent_clockwork(left, right):
    index_left = bucketize(left, EDGES)
    index_right = bucketize(right, EDGES)
    assert 0 <= index_left <= len(EDGES)
    assert 0 <= index_right <= len(EDGES)
    if left <= right:
        assert index_left <= index_right
    # Inclusive edges: the edge itself stays in its own bucket, one above moves on.
    for position, edge in enumerate(EDGES):
        assert bucketize(edge, EDGES) == position
        assert bucketize(edge + 1, EDGES) == position + 1
    result = bucket_adjacent(left, right, EDGES)
    assert isinstance(result, Comparison)
    if abs(index_left - index_right) <= 1:
        assert result.ok
    else:
        assert not result.ok and result.reason == "BUCKET_TOO_FAR"


LEVELS = ("BLOCKED", "REVIEW", "CLEARED")


@settings(max_examples=100, deadline=None)
@given(left=st.integers(0, 2), right=st.integers(0, 2), distance=st.integers(0, 2))
def test_ordinal_within_never_exceeds_the_declared_distance(left, right, distance):
    result = ordinal_within(LEVELS[left], LEVELS[right], LEVELS, max_steps=distance)
    expected_ok = abs(left - right) <= distance
    assert result.ok == expected_ok


@settings(max_examples=150, deadline=None)
@given(left=ids, right=ids)
def test_set_and_subset_comparators_never_raise(left, right):
    results = [set_equal(left, right), subset_of(left, right)]
    for result in results:
        assert isinstance(result, Comparison)
        assert isinstance(result.ok, bool)
        if not result.ok:
            assert isinstance(result.reason, str) and result.reason


@settings(max_examples=100, deadline=None)
@given(values=ids, universe=ids)
def test_subset_rejects_any_id_outside_the_universe(values, universe):
    result = subset_of(values, universe)
    outside = set(values) - set(universe)
    assert result.ok == (not outside)