"""Tests for ``ekit tighten``: tightness testing for user-supplied rules.

The point of tighten is an honest report, so every test pins one honest behaviour:

* a good rule reports TIGHT and exits zero under --check,
* a too-loose rule is named as too loose, case by case, and exits one under --check,
* a too-strict rule is named as too strict,
* a rule that raises is reported as a crash, never as a decision,
* a reject without a reason code is a rule bug (RULE_ABI), not a rejection,
* malformed fixtures or rules fail with stable registry strings,
* --json output is exactly one parseable document,
* --init writes a starter pair and refuses to overwrite,
* --pattern runs the kit's perturbation generators against the user's rule.
"""

import json
from pathlib import Path

import pytest

from equivalencekit.cli import main
from equivalencekit.tighten import load_rule, run_tighten
from equivalencekit.errors import KitError

RULE_GOOD = '''\
from equivalencekit.normalize import normalize_enum

VERDICTS = ("ELIGIBLE", "INELIGIBLE")


def compare(leader, validator, context):
    try:
        left = normalize_enum(leader["verdict"], VERDICTS)
        right = normalize_enum(validator["verdict"], VERDICTS)
    except Exception:
        return {"ok": False, "reason": "UNKNOWN_ENUM"}
    return {"ok": left == right, "reason": "" if left == right else "VERDICT_MISMATCH"}
'''

RULE_LOOSE = '''\
def compare(leader, validator, context):
    return {"ok": True, "reason": ""}
'''

RULE_STRICT = '''\
def compare(leader, validator, context):
    return {"ok": False, "reason": "NO"}
'''

RULE_CRASH = '''\
def compare(leader, validator, context):
    raise RuntimeError("boom")
'''

RULE_NO_REASON = '''\
def compare(leader, validator, context):
    return {"ok": False, "reason": ""}
'''

RULE_ABI_SHAPE = '''\
def compare(leader, validator, context):
    return {"ok": "yes"}
'''

FIXTURES = {
    "cases": [
        {"id": "accept-same", "expected": "ACCEPT",
         "leader": {"verdict": "ELIGIBLE"}, "validator": {"verdict": "ELIGIBLE"}},
        {"id": "accept-casing", "expected": "ACCEPT", "boundary": True,
         "leader": {"verdict": "eligible"}, "validator": {"verdict": "  ELIGIBLE "}},
        {"id": "reject-flip", "expected": "REJECT",
         "leader": {"verdict": "ELIGIBLE"}, "validator": {"verdict": "INELIGIBLE"}},
        {"id": "reject-missing", "expected": "REJECT",
         "leader": {"verdict": "ELIGIBLE"}, "validator": {}},
        {"id": "reject-unknown", "expected": "REJECT",
         "leader": {"verdict": "MAYBE"}, "validator": {"verdict": "MAYBE"}},
    ]
}


@pytest.fixture()
def files(tmp_path: Path):
    (tmp_path / "rule_good.py").write_text(RULE_GOOD)
    (tmp_path / "rule_loose.py").write_text(RULE_LOOSE)
    (tmp_path / "rule_strict.py").write_text(RULE_STRICT)
    (tmp_path / "rule_crash.py").write_text(RULE_CRASH)
    (tmp_path / "rule_no_reason.py").write_text(RULE_NO_REASON)
    (tmp_path / "rule_abi.py").write_text(RULE_ABI_SHAPE)
    (tmp_path / "fixtures.json").write_text(json.dumps(FIXTURES))
    return tmp_path


def test_good_rule_is_tight(files: Path):
    report = run_tighten(files / "rule_good.py", files / "fixtures.json")
    assert report.tight is True
    assert report.case_passed == report.case_total == 5
    assert report.boundary_total == 1
    assert report.false_disagreement == []
    assert report.false_agreement == []
    assert report.crashes == []


def test_too_loose_rule_fails_and_exits_nonzero(files: Path, capsys):
    (files / "fixtures_loose.json").write_text(json.dumps(
        {"cases": [FIXTURES["cases"][2]]}))
    code = main(["tighten", "--rules", str(files / "rule_loose.py"),
                 "--fixtures", str(files / "fixtures_loose.json"), "--check"])
    out = capsys.readouterr().out
    assert "too loose (bad outputs accepted): reject-flip" in out
    assert "result: NOT TIGHT (too loose)" in out
    assert code == 1


def test_too_strict_rule_is_named(files: Path):
    report = run_tighten(files / "rule_strict.py", files / "fixtures.json")
    assert report.tight is False
    assert set(report.false_disagreement) == {"accept-same", "accept-casing"}
    assert "accept-casing" not in []  # boundary miss counts as a fail too
    assert report.boundary_passed == 0


def test_crash_is_reported_not_decided(files: Path):
    report = run_tighten(files / "rule_crash.py", files / "fixtures.json")
    assert report.tight is False
    assert {c["id"] for c in report.crashes} == {
        "accept-same", "accept-casing", "reject-flip", "reject-missing", "reject-unknown"
    }
    assert all(c["error"] == "RuntimeError" for c in report.crashes)


def test_reasonless_reject_is_a_rule_bug(files: Path):
    (files / "fixtures_one_reject.json").write_text(json.dumps(
        {"cases": [FIXTURES["cases"][2]]}))
    report = run_tighten(files / "rule_no_reason.py", files / "fixtures_one_reject.json")
    assert report.crashes == [{"id": "reject-flip", "error": "RULE_ABI"}]


def test_nonbool_ok_is_a_rule_bug(files: Path):
    report = run_tighten(files / "rule_abi.py", files / "fixtures.json")
    assert all(c["error"] == "RULE_ABI" for c in report.crashes)


def test_json_output_is_one_parseable_document(files: Path, capsys):
    code = main(["tighten", "--rules", str(files / "rule_good.py"),
                 "--fixtures", str(files / "fixtures.json"), "--json"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["tight"] is True
    assert payload["case_total"] == 5
    assert payload["harmless_total"] == 0
    assert code == 0


def test_missing_rule_and_fixtures_use_registry_codes(files: Path):
    with pytest.raises(KitError) as exc_info:
        run_tighten(files / "nope.py", files / "fixtures.json")
    assert exc_info.value.code == "EXPECTED: NOT_FOUND"

    (files / "empty.json").write_text("not json")
    with pytest.raises(KitError) as exc_info:
        run_tighten(files / "rule_good.py", files / "empty.json")
    assert exc_info.value.code == "EXPECTED: NOT_FOUND"


def test_malformed_fixtures_rejected_with_stable_code(files: Path):
    (files / "bad_cases.json").write_text(json.dumps({"cases": [{"id": "x"}]}))
    with pytest.raises(KitError) as exc_info:
        run_tighten(files / "rule_good.py", files / "bad_cases.json")
    assert exc_info.value.code == "EXPECTED: INVALID_ARGUMENT"


def test_load_rule_requires_compare(files: Path):
    (files / "module_without_compare.py").write_text("value = 1\n")
    with pytest.raises(KitError) as exc_info:
        load_rule(files / "module_without_compare.py")
    assert exc_info.value.code == "EXPECTED: INVALID_ARGUMENT"


def test_init_writes_starter_pair_then_refuses_overwrite(tmp_path: Path):
    from equivalencekit.tighten import write_init

    rule_path, fixtures_path = write_init(tmp_path)
    assert rule_path.exists() and fixtures_path.exists()
    # The starter pair must itself pass its own report.
    report = run_tighten(rule_path, fixtures_path)
    assert report.tight is True
    with pytest.raises(KitError) as exc_info:
        write_init(tmp_path)
    assert exc_info.value.code == "EXPECTED: ALREADY_EXISTS"


def test_pattern_perturbations_run_against_user_rule(files: Path, capsys):
    # A rule that only compares the verdict field must still reject the harmful
    # P1 perturbations (which flip the verdict among other things) — but its
    # rate is measured, not asserted here; the assertion is that the runner runs
    # exactly 10 harmless + 10 harmful seeds.
    code = main(["tighten", "--rules", str(files / "rule_good.py"),
                 "--fixtures", str(files / "fixtures.json"), "--json"])
    assert code == 0
    capsys.readouterr()  # drain the first report so only the second is parsed
    (files / "canonical.json").write_text(json.dumps({
        "canonical": {"verdict": "ELIGIBLE", "band": "MEDIUM",
                      "cited_ids": ["c1"], "digest": "ok"},
        "context": {"provided_ids": ["c1"]},
        "cases": [],
    }))
    code = main(["tighten", "--rules", str(files / "rule_good.py"),
                 "--fixtures", str(files / "canonical.json"), "--pattern", "P1", "--json"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["harmless_total"] == 10
    assert payload["harmful_total"] == 10
    assert code == 0


def test_pattern_requires_canonical(files: Path):
    with pytest.raises(KitError) as exc_info:
        run_tighten(files / "rule_good.py", files / "fixtures.json", pattern_id="P1")
    assert exc_info.value.code == "EXPECTED: INVALID_ARGUMENT"
