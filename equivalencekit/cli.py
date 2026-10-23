"""Console entry point for the ``ekit`` command."""

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from equivalencekit.matrix_runner import run_matrix
from equivalencekit.scaffold import scaffold
from equivalencekit.diagnose import diagnose_text, fetch_receipt, format_text


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="ekit", description="EquivalenceKit developer tooling")
    parser.add_argument("--version", action="version", version="equivalencekit 0.1.0")
    sub = parser.add_subparsers(dest="command", required=True)

    audit = sub.add_parser("audit", help="audit a contract against the anti-pattern gallery")
    audit.add_argument("path", help="file or directory to audit")
    audit.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    sc = sub.add_parser("scaffold", help="scaffold a contract from a pattern template")
    sc.add_argument("--pattern", required=True, help="P1..P6")
    sc.add_argument("--name", required=True, help="contract class name, e.g. VendorJudge")
    sc.add_argument("--out", required=True, help="output contract path")
    sc.add_argument("--matrix-out", default=None, help="output matrix JSON path")

    mx = sub.add_parser("matrix", help="run an acceptance matrix and perturbation suite")
    mx.add_argument("path", help="matrix JSON file or directory")
    mx.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    mx.add_argument("--check", action="store_true",
                    help="exit non-zero unless all cases and perturbations pass")

    dg = sub.add_parser("diagnose", help="diagnose a failed transaction from its receipt")
    dg.add_argument("txhash", nargs="?", help="transaction hash (requires the genlayer CLI)")
    dg.add_argument("--from-file", default=None,
                    help="read the receipt text from a file instead of calling genlayer")
    dg.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    args = parser.parse_args(argv)

    if args.command == "audit":
        from equivalencekit.audit import main as audit_main
        aargv = ["audit", args.path]
        if args.json:
            aargv.append("--json")
        return audit_main(aargv)

    if args.command == "scaffold":
        scaffold(args.pattern, args.name, Path(args.out),
                 Path(args.matrix_out) if args.matrix_out else None)
        return 0

    if args.command == "matrix":
        return run_matrix(Path(args.path), as_json=args.json, check=args.check)

    if args.command == "diagnose":
        if args.from_file:
            text = Path(args.from_file).read_text()
            source = args.from_file
        elif args.txhash:
            try:
                text = fetch_receipt(args.txhash)
            except RuntimeError as exc:
                print(str(exc))
                return 2
            source = args.txhash
        else:
            parser.error("diagnose requires a txhash or --from-file")
            return 2
        diagnoses = diagnose_text(text)
        if args.json:
            print(json.dumps([asdict(d) for d in diagnoses], indent=2))
        else:
            print(format_text(diagnoses, source=source))
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
