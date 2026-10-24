"""Scaffold a new contract from one of the reference patterns."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TEMPLATES = {
    "P1": "verdict_judge.py",
    "P2": "web_fact_attestor.py",
    "P4": "ranking_judge.py",
}

FALLBACK = {
    "P3": "verdict_judge.py",
    "P5": "web_fact_attestor.py",
    "P6": "verdict_judge.py",
}

TEMPLATE_CLASS = {
    "verdict_judge.py": "VerdictJudge",
    "web_fact_attestor.py": "WebFactAttestor",
    "ranking_judge.py": "RankingJudge",
}


def scaffold(pattern_id: str, name: str, out: Path, matrix_out: Path | None = None) -> None:
    pattern_id = pattern_id.upper()
    if pattern_id not in TEMPLATES and pattern_id not in FALLBACK:
        raise ValueError(f"unknown pattern: {pattern_id}")
    template_name = TEMPLATES.get(pattern_id)
    if template_name is None:
        template_name = FALLBACK.get(pattern_id)
    if template_name is None:
        raise ValueError(f"unknown pattern: {pattern_id}")
    root = Path(__file__).resolve().parent.parent
    template = (root / "contracts" / template_name).read_text()

    class_name = "".join(part.capitalize() for part in re.split(r"[_\-\s]+", name))
    if not class_name or not class_name[0].isalpha():
        raise ValueError("name must start with a letter")
    template_class = TEMPLATE_CLASS[template_name]
    source = template.replace(template_class, class_name)

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(source)

    if matrix_out is None:
        matrix_out = out.with_suffix("").parent / "matrices" / f"{out.stem}.json"
    matrix_out = Path(matrix_out)
    matrix_out.parent.mkdir(parents=True, exist_ok=True)
    if not matrix_out.exists():
        matrix = {
            "pattern": pattern_id,
            "description": f"Acceptance matrix for {class_name} ({pattern_id}).",
            "cases": [],
        }
        matrix_out.write_text(json.dumps(matrix, indent=2) + "\n")

    print(f"scaffolded {out} from {template_name} (pattern {pattern_id})")
    print(f"matrix stub: {matrix_out}")
    print("next: edit the contract, then run `ekit audit` and `genvm-lint`")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="ekit scaffold")
    parser.add_argument("--pattern", required=True, help="P1..P6")
    parser.add_argument("--name", required=True, help="contract class name, e.g. VendorJudge")
    parser.add_argument("--out", required=True, help="output contract path")
    parser.add_argument("--matrix-out", default=None, help="output matrix JSON path")
    args = parser.parse_args(argv)
    scaffold(args.pattern, args.name, Path(args.out),
             Path(args.matrix_out) if args.matrix_out else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
