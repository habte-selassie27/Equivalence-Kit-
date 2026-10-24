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


def test_a24_flags_strict_eq_on_nondeterminism():
    # Mirrors the pm-kit prediction-market shape (docs/case-study.md).
    source = (
        "task = render(url)\n"
        "result = gl.eq_principle.strict_eq(task)\n"
    )
    findings = audit_source(source)
    a24 = [f for f in findings if f.rule == "A24"]
    assert len(a24) == 1 and a24[0].line == 2


def test_a24_is_a_reason_to_look_not_a_ban():
    # strict_eq on a code-decided value is legitimate; the audit still asks you to
    # confirm which kind this is (documented heuristic anti-pattern).
    source = 'return gl.eq_principle.strict_eq(deterministic_total)\n'
    findings = audit_source(source)
    assert [f.rule for f in findings] == ["A24"]

    # An ignore directive stays available for the legit case.
    assert audit_source(
        'return gl.eq_principle.strict_eq(deterministic_total)  # ekit: ignore A24\n'
    ) == []
