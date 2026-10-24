"""Tests for the SARIF 2.1.0 mapping of `ekit audit` findings.

The document must be stable (same findings, same bytes across runs) because GitHub
code scanning diffs the uploads. These tests pin the schema shape, the level rules
(syntax errors above anti-pattern warnings), rule de-duplication, and both output
routes of the CLI: ``--sarif`` (stdout) and ``--sarif FILE``.
"""

import json
from pathlib import Path

from equivalencekit.audit import Finding
from equivalencekit.cli import main
from equivalencekit.sarif import to_sarif


def _findings() -> list[tuple[str, list[Finding]]]:
    return [
        ("contract.py", [
            Finding("A13", 12, "float literal; use integer math", "docs/anti-patterns.md#A13"),
            Finding("A18", 30, "TOLERANCE_BPS is 0; a zero tolerance is vacuous", "docs/anti-patterns.md#A18"),
            Finding("A13", 40, "float() coercion", "docs/anti-patterns.md#A13"),
        ]),
        ("broken.py", [Finding("syntax", 1, "SyntaxError: invalid syntax", "docs/anti-patterns.md")]),
    ]


def test_document_shape_and_mapping():
    document = to_sarif(_findings())
    assert document["version"] == "2.1.0"
    run = document["runs"][0]
    driver = run["tool"]["driver"]
    assert driver["name"] == "EquivalenceKit audit"
    assert driver["version"]

    assert len(run["results"]) == 4
    by_rule: dict[str, list[dict]] = {}
    for result in run["results"]:
        by_rule.setdefault(result["ruleId"], []).append(result)
    assert set(by_rule) == {"A13", "A18", "syntax"}
    assert by_rule["syntax"][0]["level"] == "error"  # parse failure, not style
    assert all(r["level"] == "warning" for rule in ("A13", "A18") for r in by_rule[rule])

    first = by_rule["A13"][0]
    location = first["locations"][0]["physicalLocation"]
    assert location["artifactLocation"]["uri"] == "contract.py"
    assert location["region"]["startLine"] == 12


def test_rules_are_deduplicated_with_metadata():
    document = to_sarif(_findings())
    rules = document["runs"][0]["tool"]["driver"]["rules"]
    ids = [rule["id"] for rule in rules]
    assert len(ids) == len(set(ids)) == 3
    a13 = next(rule for rule in rules if rule["id"] == "A13")
    assert a13["shortDescription"]["text"] == "Floats in comparators or contract state"
    assert "anti-patterns.md#A13" in a13["helpUri"]


def test_serialization_is_stable_across_calls():
    first = json.dumps(to_sarif(_findings()), indent=2)
    second = json.dumps(to_sarif(_findings()), indent=2)
    assert first == second


def test_clean_source_produces_empty_results():
    document = to_sarif([("clean.py", [])])
    assert document["runs"][0]["results"] == []


def test_cli_stdout_and_file_routes(tmp_path: Path, capsys):
    (tmp_path / "bad.py").write_text("TOLERANCE_BPS = 0\n")  # A18 finding

    code = main(["audit", str(tmp_path / "bad.py"), "--sarif"])
    stdout = capsys.readouterr().out
    payload = json.loads(stdout)  # one parseable document
    assert payload["runs"][0]["results"][0]["ruleId"] == "A18"
    assert code == 1  # findings present

    capsys.readouterr()  # drain before the second run
    out_file = tmp_path / "audit.sarif"
    code = main(["audit", str(tmp_path / "bad.py"), "--sarif", str(out_file)])
    assert code == 1
    document = json.loads(out_file.read_text())
    assert document["runs"][0]["results"][0]["ruleId"] == "A18"
    # The file route prints nothing else.
    assert capsys.readouterr().out == ""


def test_cli_file_route_exits_zero_when_clean(tmp_path: Path, capsys):
    (tmp_path / "good.py").write_text("MAX_ITEMS = 4\n\n\ndef keep(items):\n"
                                      "    return [i for i in items if i < MAX_ITEMS]\n")
    out_file = tmp_path / "audit.sarif"
    code = main(["audit", str(tmp_path / "good.py"), "--sarif", str(out_file)])
    document = json.loads(out_file.read_text())
    assert document["runs"][0]["results"] == []
    assert code == 0
    assert capsys.readouterr().out == ""
