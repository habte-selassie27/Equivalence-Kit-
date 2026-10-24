"""SARIF 2.1.0 output for `ekit audit`, so findings land in GitHub code scanning.

The mapping is deliberately minimal and stable: one rule entry per anti-pattern id
(any order, but stable within a run), one result per finding, `level: warning` for
anti-pattern findings and `error` for syntax errors. No timestamps, no fingerprints,
no environment details — the same findings must serialize to the same document on
every machine.
"""

from __future__ import annotations

from typing import Any

from equivalencekit import __version__
from equivalencekit.audit import _LABELS, Finding

#: The syntax-rule id audit.py uses for unparseable sources. Not an anti-pattern id.
_SYNTAX_RULE = "syntax"
_SYNTAX_LABEL = "Source does not parse"

REPO_URL = "https://github.com/habte-selassie27/equivalence-kit"


def _rule_entry(rule: str, doc: str) -> dict[str, Any]:
    label = _SYNTAX_LABEL if rule == _SYNTAX_RULE else _LABELS.get(rule, rule)
    return {
        "id": rule,
        "name": label.replace(" ", "_").upper(),
        "shortDescription": {"text": label},
        "helpUri": f"{REPO_URL}/blob/main/{doc}",
    }


def to_sarif(results: list[tuple[str, list[Finding]]]) -> dict[str, Any]:
    """Serialize audit results to a SARIF 2.1.0 document."""

    rules: dict[str, dict[str, Any]] = {}
    sarif_results: list[dict[str, Any]] = []

    def add(path: str, finding: Finding) -> None:
        if finding.rule not in rules:
            rules[finding.rule] = _rule_entry(finding.rule, finding.doc)
        sarif_results.append({
            "ruleId": finding.rule,
            "level": "error" if finding.rule == _SYNTAX_RULE else "warning",
            "message": {"text": finding.message},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": path},
                    "region": {"startLine": finding.line},
                },
            }],
        })

    for path, findings in results:
        for finding in findings:
            add(path, finding)

    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "EquivalenceKit audit",
                    "version": __version__,
                    "informationUri": REPO_URL,
                    "rules": list(rules.values()),
                },
            },
            "results": sarif_results,
        }],
    }
