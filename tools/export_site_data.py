#!/usr/bin/env python3
"""Export the EquivalenceKit repo data for the optional playground site.

The playground is a static docs companion. It must never hand-copy a pattern spec, an
acceptance matrix, or a tightness number: everything it renders is generated from this
repo by this script.

Usage:
    python3.12 tools/export_site_data.py            # write the generated data
    python3.12 tools/export_site_data.py --check    # fail if the committed data is stale

Outputs (all generated, never hand-edited):
    playground/src/data/patterns.json     P1-P6 field specs and invariants
    playground/src/data/matrices/P*.json  the acceptance matrices
    playground/src/data/canonical.json    the canonical example output per pattern
    playground/src/data/report.json       the tightness report per pattern
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from equivalencekit import __version__  # noqa: E402
from equivalencekit.patterns import PATTERNS  # noqa: E402
from tightness import build_report  # noqa: E402

FIXTURE_DIR = ROOT / "tests" / "matrices"
DATA_DIR = ROOT / "playground" / "src" / "data"
PATTERN_IDS = ("P1", "P2", "P3", "P4", "P5", "P6")

# Fields that are stored but never compared. The site must label them as such.
NOT_COMPARED_HINT = "Stored for humans; never compared in consensus."


def _params_from_context(pattern_id: str) -> dict:
    """Collect the real comparator parameters used by the pattern's matrix cases.

    The parameters come from the fixtures the tests actually run, so the site shows the
    parameters that are really in force rather than a hand-written copy.
    """

    data = json.loads((FIXTURE_DIR / f"{pattern_id}.json").read_text())
    merged: dict = {}
    for case in data["cases"]:
        context = case.get("context") or {}
        for key, value in context.items():
            if key not in merged:
                merged[key] = value
            elif merged[key] != value:
                # Parameters that vary per case are listed so the site can show the set.
                if isinstance(merged[key], list) and isinstance(value, list):
                    for item in value:
                        if item not in merged[key]:
                            merged[key].append(item)
                else:
                    merged[key] = f"{merged[key]} | {value}"
    return merged


def _patterns_payload() -> dict:
    patterns = []
    for pattern_id in PATTERN_IDS:
        spec = PATTERNS[pattern_id]
        fields = []
        for field in spec["fields"]:
            fields.append(
                {
                    "name": field["name"],
                    "normalizer": field["normalizer"],
                    "comparator": field["comparator"],
                    "compared": field["compared"],
                    "explanation": (
                        NOT_COMPARED_HINT
                        if not field["compared"]
                        else f"{field['normalizer']} then {field['comparator']}"
                    ),
                }
            )
        patterns.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "useWhen": spec["use_when"],
                "fields": fields,
                "invariants": list(spec["invariants"]),
                "toleranceRationale": spec["tolerance_rationale"],
                "failureBehavior": spec["failure_behavior"],
                "knownLimits": list(spec["known_limits"]),
                "whyNotStrictEq": spec["why_not_strict_eq"],
                "params": _params_from_context(pattern_id),
            }
        )
    return {"packageVersion": __version__, "patterns": patterns}


def _report_payload() -> dict:
    report = build_report()
    patterns = []
    for pattern_id in PATTERN_IDS:
        item = report[pattern_id]
        patterns.append(
            {
                "patternId": pattern_id,
                "cases": item["cases"],
                "counts": item["counts"],
                "harmlessAccepted": item["harmless_accepted"],
                "harmlessTotal": item["harmless_total"],
                "harmfulRejected": item["harmful_rejected"],
                "harmfulTotal": item["harmful_total"],
                "matrixMatches": item["matrix_matches"],
                "params": _params_from_context(pattern_id),
            }
        )
    return {"packageVersion": __version__, "patterns": patterns}


def _canonical_payload() -> dict:
    canonical = json.loads((FIXTURE_DIR / "canonical.json").read_text())
    return {
        "packageVersion": __version__,
        "patterns": {
            pattern_id: {
                "output": canonical[pattern_id]["output"],
                "context": canonical[pattern_id]["context"],
            }
            for pattern_id in PATTERN_IDS
        },
    }


def _matrix_payload(pattern_id: str) -> dict:
    data = json.loads((FIXTURE_DIR / f"{pattern_id}.json").read_text())
    cases = []
    for case in data["cases"]:
        cases.append(
            {
                "id": case["id"],
                "category": case["category"],
                "title": case["title"],
                "leader": case["leader"],
                "validator": case["validator"],
                "context": case.get("context", {}),
                "expected": case["expected"],
                "reasonCode": case.get("reason", "OK"),
            }
        )
    return {
        "pattern": pattern_id,
        "description": data["description"],
        "cases": cases,
    }


def _outputs() -> dict:
    outputs = {
        DATA_DIR / "patterns.json": _patterns_payload(),
        DATA_DIR / "report.json": _report_payload(),
        DATA_DIR / "canonical.json": _canonical_payload(),
    }
    for pattern_id in PATTERN_IDS:
        outputs[DATA_DIR / "matrices" / f"{pattern_id}.json"] = _matrix_payload(pattern_id)
    return outputs


def _serialize(payload: dict) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def main() -> int:
    check = "--check" in sys.argv
    outputs = _outputs()
    stale = []

    for path, payload in outputs.items():
        content = _serialize(payload)
        if check:
            current = path.read_text() if path.exists() else None
            if current != content:
                stale.append(path)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        print(f"wrote {path.relative_to(ROOT)}")

    if check:
        if stale:
            for path in stale:
                print(f"STALE: {path.relative_to(ROOT)}", file=sys.stderr)
            print(
                "\nGenerated site data is out of date. "
                "Run: python3.12 tools/export_site_data.py",
                file=sys.stderr,
            )
            return 1
        print(f"site data is up to date ({len(outputs)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
