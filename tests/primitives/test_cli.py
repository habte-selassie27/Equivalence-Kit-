"""Regression tests for the ``ekit`` entry point itself (pure Python, no GenLayer).

These tests shell the same function the console script runs and parse stdout, because
the two ``--json`` bugs they pin were invisible to the unit tests:

* ``ekit audit <path> --json`` raised ``NameError: name 'json' is not defined``
  (``json`` was never imported in ``equivalencekit/audit.py``).
* ``ekit matrix <path> --json`` appended the human ``TOTAL:`` summary after the JSON
  document, so no consumer could parse it.

A ``--json`` mode that is not exactly one parseable document is a broken tool, so the
assertion here is ``json.loads(stdout)`` on the full captured output — not a substring
match.
"""

import json
from pathlib import Path

from equivalencekit.cli import main

REPO_ROOT = Path(__file__).parents[2]
P1_MATRIX = REPO_ROOT / "tests" / "matrices" / "P1.json"

CLEAN_SOURCE = """\
MAX_ITEMS = 4


def keep(items):
    return [i for i in items if i < MAX_ITEMS]
"""


def test_audit_json_output_is_parseable(capsys, tmp_path):
    (tmp_path / "bad.py").write_text("TOLERANCE_BPS = 0\n")  # A18 finding
    (tmp_path / "good.py").write_text(CLEAN_SOURCE)

    code = main(["audit", str(tmp_path), "--json"])

    raw = capsys.readouterr().out
    payload = json.loads(raw)  # raises if anything but JSON reaches stdout
    assert isinstance(payload, list)
    files = {entry["file"]: entry["findings"] for entry in payload}
    assert len(files) == 2
    assert any(f["rule"] == "A18" for f in files[str(tmp_path / "bad.py")])
    assert files[str(tmp_path / "good.py")] == []
    assert code == 1  # findings present -> non-zero for CI


def test_audit_json_clean_directory_exits_zero(capsys, tmp_path):
    (tmp_path / "good.py").write_text(CLEAN_SOURCE)

    code = main(["audit", str(tmp_path), "--json"])

    payload = json.loads(capsys.readouterr().out)
    assert payload == [{"file": str(tmp_path / "good.py"), "findings": []}]
    assert code == 0


def test_audit_text_output_still_reports_totals(capsys, tmp_path):
    (tmp_path / "bad.py").write_text("x = 0.5\n")  # A13 finding

    code = main(["audit", str(tmp_path)])

    raw = capsys.readouterr().out
    assert "A13" in raw
    assert raw.rstrip().endswith("total: 1 finding(s)")
    assert code == 1


def test_matrix_json_output_is_a_single_parseable_document(capsys):
    code = main(["matrix", str(P1_MATRIX), "--json"])

    payload = json.loads(capsys.readouterr().out)  # no trailing TOTAL line allowed
    assert code == 0
    assert payload["cases_total"] > 0
    assert payload["cases_passed"] == payload["cases_total"]
    assert payload["failures"] == []
    assert set(payload["perturbations"]) == {
        "harmless_accepted",
        "harmless_total",
        "harmful_rejected",
        "harmful_total",
    }


def test_matrix_json_check_mode_stays_valid_json(capsys):
    code = main(["matrix", str(P1_MATRIX), "--json", "--check"])

    payload = json.loads(capsys.readouterr().out)
    assert code == 0
    assert payload["cases_passed"] == payload["cases_total"]


def test_matrix_text_mode_still_prints_the_summary(capsys):
    code = main(["matrix", str(P1_MATRIX)])

    raw = capsys.readouterr().out
    assert code == 0
    assert "cases passed" in raw
    assert "TOTAL:" in raw
