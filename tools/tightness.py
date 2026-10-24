#!/usr/bin/env python3
"""Print the EquivalenceKit tightness report from the real fixtures.

Usage: python3 tools/tightness.py [--json]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from equivalencekit.patterns import compare_pattern  # noqa: E402
from equivalencekit.perturb import harmful_variation, harmless_variation  # noqa: E402

FIXTURE_DIR = ROOT / "tests" / "matrices"
PATTERN_IDS = ("P1", "P2", "P3", "P4", "P5", "P6")
SEEDS = 10


def build_report() -> dict:
    """Compute the tightness report from the real fixtures.

    Shared by `tools/tightness.py` (prints it) and `tools/export_site_data.py` (exports
    it to the playground), so the site and the terminal always report the same numbers.
    """

    canonical = json.loads((FIXTURE_DIR / "canonical.json").read_text())
    report = {}
    for pattern_id in PATTERN_IDS:
        data = json.loads((FIXTURE_DIR / f"{pattern_id}.json").read_text())
        counts = {"MUST_ACCEPT": 0, "MUST_REJECT": 0, "BOUNDARY": 0}
        accepted = 0
        rejected = 0
        for case in data["cases"]:
            counts[case["category"]] += 1
            result = compare_pattern(pattern_id, case["leader"], case["validator"], case["context"])
            expected_ok = case["expected"] == "ACCEPT"
            if result["ok"] is expected_ok:
                if expected_ok:
                    accepted += 1
                else:
                    rejected += 1

        harmless_ok = 0
        harmful_ok = 0
        for seed in range(SEEDS):
            variant = harmless_variation(pattern_id, canonical[pattern_id]["output"], seed)
            if compare_pattern(pattern_id, canonical[pattern_id]["output"], variant, canonical[pattern_id]["context"])["ok"]:
                harmless_ok += 1
            variant = harmful_variation(pattern_id, canonical[pattern_id]["output"], seed)
            if not compare_pattern(pattern_id, canonical[pattern_id]["output"], variant, canonical[pattern_id]["context"])["ok"]:
                harmful_ok += 1

        report[pattern_id] = {
            "cases": len(data["cases"]),
            "counts": counts,
            "matrix_matches": accepted + rejected,
            "harmless_accepted": harmless_ok,
            "harmless_total": SEEDS,
            "harmful_rejected": harmful_ok,
            "harmful_total": SEEDS,
            "tolerances": data["description"],
        }
    return report


def main() -> int:
    report = build_report()
    if "--json" in sys.argv:
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0

    print("EquivalenceKit tightness report")
    print("===============================")
    for pattern_id in PATTERN_IDS:
        item = report[pattern_id]
        counts = item["counts"]
        print(
            f"{pattern_id}: cases={item['cases']} "
            f"(accept={counts['MUST_ACCEPT']}, reject={counts['MUST_REJECT']}, "
            f"boundary={counts['BOUNDARY']})"
        )
        print(
            f"    harmless accepted {item['harmless_accepted']}/{item['harmless_total']}; "
            f"harmful rejected {item['harmful_rejected']}/{item['harmful_total']}"
        )
    total_cases = sum(item["cases"] for item in report.values())
    total_harmless = sum(item["harmless_accepted"] for item in report.values())
    total_harmful = sum(item["harmful_rejected"] for item in report.values())
    total_seeds = sum(item["harmless_total"] for item in report.values())
    print(f"Matrix cases: {total_cases}")
    print(f"Perturbation acceptance: {total_harmless}/{total_seeds} harmless variants")
    print(f"Perturbation rejection: {total_harmful}/{total_seeds} harmful variants")
    return 0 if total_harmless == total_seeds == total_harmful else 1


if __name__ == "__main__":
    raise SystemExit(main())
