"""Run an acceptance matrix (and optional perturbation suite) from a JSON spec file."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from equivalencekit.patterns import compare_pattern
from equivalencekit.perturb import harmful_variation, harmless_variation


def _run_cases(spec: dict) -> tuple[int, int, list[str]]:
    pattern_id = spec["pattern"]
    failures: list[str] = []
    passed = 0
    total = 0
    for case in spec.get("cases", []):
        total += 1
        result = compare_pattern(pattern_id, case["leader"], case["validator"], case["context"])
        expected_ok = case["expected"] == "ACCEPT"
        if result["ok"] is expected_ok and (expected_ok or result["reason"] == case.get("reason")):
            passed += 1
        else:
            failures.append(f"{case['id']}: expected {case['expected']}, got {result}")
    return passed, total, failures


def _run_perturbations(pattern_id: str, canonical_output: dict, context: dict) -> tuple[int, int, int, int]:
    harmless_ok = 0
    harmful_ok = 0
    for seed in range(10):
        variant = harmless_variation(pattern_id, canonical_output, seed)
        if compare_pattern(pattern_id, canonical_output, variant, context)["ok"]:
            harmless_ok += 1
        variant = harmful_variation(pattern_id, canonical_output, seed)
        if not compare_pattern(pattern_id, canonical_output, variant, context)["ok"]:
            harmful_ok += 1
    return harmless_ok, 10, harmful_ok, 10


def run_matrix(path: Path, as_json: bool = False, check: bool = False) -> int:
    path = Path(path)
    specs: list[tuple[Path, dict]] = []
    if path.is_dir():
        for p in sorted(path.glob("P*.json")):
            specs.append((p, json.loads(p.read_text())))
    else:
        specs.append((path, json.loads(path.read_text())))

    canonical = None
    if path.is_dir() and (path / "canonical.json").exists():
        canonical = json.loads((path / "canonical.json").read_text())

    all_failures: list[str] = []
    total_passed = 0
    total_cases = 0
    perturb_harmless = 0
    perturb_harmless_total = 0
    perturb_harmful = 0
    perturb_harmful_total = 0

    for spec_path, spec in specs:
        pid = spec["pattern"]
        passed, total, failures = _run_cases(spec)
        total_passed += passed
        total_cases += total
        all_failures.extend(f"{spec_path.name}: {f}" for f in failures)
        if not as_json:
            print(f"{spec_path.name} ({pid}): {passed}/{total} cases passed")
            for f in failures:
                print(f"  FAIL {f}")

        if canonical and pid in canonical:
            ho, ht, fo, ft = _run_perturbations(pid, canonical[pid]["output"], canonical[pid]["context"])
            perturb_harmless += ho
            perturb_harmless_total += ht
            perturb_harmful += fo
            perturb_harmful_total += ft
            if not as_json:
                print(f"  perturbations: harmless {ho}/{ht}, harmful {fo}/{ft}")

    if as_json:
        print(json.dumps({
            "cases_passed": total_passed,
            "cases_total": total_cases,
            "failures": all_failures,
            "perturbations": {
                "harmless_accepted": perturb_harmless,
                "harmless_total": perturb_harmless_total,
                "harmful_rejected": perturb_harmful,
                "harmful_total": perturb_harmful_total,
            },
        }, indent=2))
        # JSON mode must emit exactly one parseable document: totals live in the
        # payload above, so the human summary lines are text-mode only.
    else:
        print(f"\nTOTAL: {total_passed}/{total_cases} cases passed")
        if perturb_harmless_total:
            print(f"PERTURBATIONS: harmless {perturb_harmless}/{perturb_harmless_total}, "
                  f"harmful {perturb_harmful}/{perturb_harmful_total}")

    if check:
        if total_passed != total_cases:
            return 1
        if perturb_harmless_total and perturb_harmless != perturb_harmless_total:
            return 1
        if perturb_harmful_total and perturb_harmful != perturb_harmful_total:
            return 1
    return 0 if not all_failures else 1
