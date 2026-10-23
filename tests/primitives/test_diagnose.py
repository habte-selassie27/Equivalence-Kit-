"""Regression tests for ``ekit diagnose`` (Failure Diagnosis track)."""

import json
from pathlib import Path

from equivalencekit.cli import main
from equivalencekit.diagnose import diagnose_text

REPO_ROOT = Path(__file__).parents[2]


def test_diagnose_extracts_and_dedups_codes(capsys, tmp_path):
    receipt = tmp_path / "receipt.txt"
    receipt.write_text(
        "stdout: LLM_ERROR: UNKNOWN_ID\n"
        "stderr: EXPECTED: INVALID_STATE\n"
        "noise: LLM_ERROR: UNKNOWN_ID again\n"
    )

    code = main(["diagnose", "--from-file", str(receipt)])

    raw = capsys.readouterr().out
    assert code == 0
    assert "LLM_ERROR: UNKNOWN_ID" in raw
    assert "EXPECTED: INVALID_STATE" in raw
    # deduped: only one block per code
    assert raw.count("LLM_ERROR: UNKNOWN_ID") == 1


def test_diagnose_json_mode_is_parseable(capsys, tmp_path):
    receipt = tmp_path / "receipt.txt"
    receipt.write_text("LLM_ERROR: BAD_JSON\n")

    code = main(["diagnose", "--from-file", str(receipt), "--json"])

    payload = json.loads(capsys.readouterr().out)
    assert code == 0
    assert len(payload) == 1
    assert payload[0]["code"] == "LLM_ERROR: BAD_JSON"
    assert payload[0]["anti_pattern"] == "A12"


def test_diagnose_no_classified_error_is_honest(capsys, tmp_path):
    receipt = tmp_path / "receipt.txt"
    receipt.write_text("transaction finalized cleanly\n")

    code = main(["diagnose", "--from-file", str(receipt)])

    raw = capsys.readouterr().out
    assert code == 0
    assert "No classified error" in raw


def test_diagnose_text_helper_pure():
    diagnoses = diagnose_text("EXTERNAL: SOURCE_UNREACHABLE and LLM_ERROR: OUT_OF_RANGE")
    assert [d.code for d in diagnoses] == [
        "EXTERNAL: SOURCE_UNREACHABLE",
        "LLM_ERROR: OUT_OF_RANGE",
    ]
    assert diagnoses[0].anti_pattern == "A6"
    assert diagnoses[1].anti_pattern == "A19"
