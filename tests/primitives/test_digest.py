import pytest

from equivalencekit.digest import digest_hex, fnv1a_32
from equivalencekit.errors import KitError


def test_fnv1a_reference_vectors():
    assert fnv1a_32("") == 0x811C9DC5
    assert fnv1a_32("a") == 0xE40C292C
    assert fnv1a_32("foobar") == 0xBF9CF968


def test_digest_is_stable_and_hex():
    assert digest_hex("same") == digest_hex("same")
    assert digest_hex("same") != digest_hex("same ")
    value = digest_hex("Café")
    assert len(value) == 8
    assert all(character in "0123456789abcdef" for character in value)


def test_digest_rejects_non_text_and_oversize():
    with pytest.raises(KitError) as error:
        fnv1a_32(123)
    assert error.value.code == "LLM_ERROR: WRONG_TYPE"
    with pytest.raises(KitError) as error:
        fnv1a_32("x" * (16 * 1024 + 1))
    assert error.value.code == "EXPECTED: OVER_LIMIT"
