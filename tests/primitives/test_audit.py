"""Tests for the ekit audit linter (pure Python, no GenLayer)."""

from equivalencekit.audit import audit_source


def test_clean_contract_has_no_findings():
    source = '''
MAX_ITEMS = 4
def f(items):
    if len(items) > MAX_ITEMS:
        raise ValueError("over")
    for item in items:
        pass
    return subset_of(items, universe)
'''
    assert audit_source(source) == []


def test_flags_float_literal():
    findings = audit_source("x = 0.5\n")
    assert any(f.rule == "A13" for f in findings)


def test_flags_digest_in_compare_p4():
    source = 'result = compare_p4({"ranking": r, "digest": d}, {"ranking": v}, ctx)\n'
    findings = audit_source(source)
    assert any(f.rule == "A23" for f in findings)


def test_flags_zero_tolerance():
    source = "TOLERANCE_BPS = 0\n"
    findings = audit_source(source)
    assert any(f.rule == "A18" for f in findings)


def test_flags_unused_limit():
    source = "MAX_UNUSED = 10\n"
    findings = audit_source(source)
    assert any(f.rule == "A19" for f in findings)


def test_flags_unavailable_coerced_to_bool():
    source = 'return bool(status == "UNAVAILABLE")\n'
    findings = audit_source(source)
    assert any(f.rule == "A6" for f in findings)


def test_ignore_directive_suppresses():
    source = "x = 0.5  # ekit: ignore A13\n"
    assert audit_source(source) == []


def test_ignore_file_suppresses():
    source = "# ekit: ignore-file A13\nx = 0.5\n"
    assert audit_source(source) == []
