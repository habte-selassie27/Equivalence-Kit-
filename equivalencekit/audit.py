"""Static audit of a GenLayer contract against the EquivalenceKit anti-pattern gallery.

``ekit audit`` runs these checks on a file or directory and reports findings. Every
check is deterministic, needs no network, and maps to a documented anti-pattern
(docs/anti-patterns.md), so the output can be used as a CI gate.
"""

from __future__ import annotations

import ast
import json
import os
import re
from dataclasses import dataclass, asdict
from typing import Iterable


@dataclass
class Finding:
    rule: str
    line: int
    message: str
    doc: str

    def to_dict(self) -> dict:
        return asdict(self)


# Anti-pattern id -> short label (full text lives in docs/anti-patterns.md).
_LABELS = {
    "A1": "Comparing digest prose",
    "A3": "No id universe (hallucinated citations)",
    "A6": "Treating UNAVAILABLE as false",
    "A13": "Floats in comparators or contract state",
    "A14": "Unbounded loops and unbounded inputs",
    "A15": "Unbounded regex on untrusted input",
    "A18": "A tolerance that can be configured to zero",
    "A19": "Limits that are declared but never enforced",
    "A23": "Feeding a human-facing field into a strict schema check",
}

_COMPARE_FUNCS = {
    "compare_p1", "compare_p2", "compare_p3", "compare_p4",
    "compare_p5", "compare_p6", "enum_equal", "ordinal_within",
    "int_within_abs", "int_within_bps", "bucket_adjacent", "set_equal",
    "subset_of", "overlap_at_least", "topk_overlap", "facts_match",
    "consistent_with", "all_of", "validate_facts",
}

_ALLOWED_FIELDS = {
    "compare_p1": {"verdict", "band", "cited_ids", "digest"},
    "compare_p2": {"facts", "source_status"},
    "compare_p3": {"value", "unit"},
    "compare_p4": {"ranking"},
    "compare_p5": {"entities", "ids"},
    "compare_p6": {"result", "evidence_ids", "source_status"},
}


def audit_source(source: str, filename: str = "<input>") -> list[Finding]:
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError as error:
        return [Finding("syntax", error.lineno or 1, f"SyntaxError: {error.msg}", "docs/anti-patterns.md")]

    findings: list[Finding] = []
    lines = source.splitlines()

    # A13: float literals / float() calls anywhere in the file.
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, float):
            findings.append(Finding("A13", node.lineno,
                "float literal; use integer math (basis points, cross-multiplication)",
                "docs/anti-patterns.md#A13"))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "float":
            findings.append(Finding("A13", node.lineno,
                "float() coercion; keep values as integers",
                "docs/anti-patterns.md#A13"))

    # A14: unbounded loops.
    for node in ast.walk(tree):
        if isinstance(node, ast.For) and isinstance(node.iter, ast.Call) \
                and isinstance(node.iter.func, ast.Name) and node.iter.func.id == "range":
            # Only a bare range(len(x)) is unbounded; range(a, len(x)) is at least
            # anchored at a start and is usually guarded by a size cap upstream.
            if len(node.iter.args) == 1:
                arg = node.iter.args[0]
                if isinstance(arg, ast.Call) and isinstance(arg.func, ast.Name) \
                        and arg.func.id == "len":
                    findings.append(Finding("A14", node.lineno,
                        "range(len(...)) is unbounded; bound the loop with a documented limit",
                        "docs/anti-patterns.md#A14"))
        if isinstance(node, ast.While) and isinstance(node.test, ast.Constant) \
                and node.test.value is True:
            findings.append(Finding("A14", node.lineno,
                "while True; every loop must have a documented bound",
                "docs/anti-patterns.md#A14"))

    # A15: regex with a non-constant pattern.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and node.func.attr in ("match", "search", "findall", "finditer",
                                       "fullmatch", "sub", "compile", "split") \
                and isinstance(node.func.value, ast.Name) and node.func.value.id == "re":
            if node.args and not isinstance(node.args[0], (ast.Constant, ast.Name)):
                findings.append(Finding("A15", node.lineno,
                    "regex pattern is not a constant string; bound and escape untrusted input",
                    "docs/anti-patterns.md#A15"))

    # A18: tolerance/threshold constants set to zero.
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and re.search(
                        r"(BPS|PCT|TOL|THRESHOLD|OVERLAP|DELTA|TOLERANCE)", target.id.upper()):
                    if isinstance(node.value, ast.Constant) and node.value.value == 0:
                        findings.append(Finding("A18", node.lineno,
                            f"{target.id} is 0; a zero tolerance is vacuous",
                            "docs/anti-patterns.md#A18"))

    # A19: declared limits that are never referenced.
    limit_defs: dict[str, int] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and re.search(
                        r"(^MAX_|_MAX$|_LIMIT$|^LIMIT_|_CAP$|^CAP_)", target.id):
                    limit_defs[target.id] = node.lineno
    for name, lineno in limit_defs.items():
        uses = sum(1 for n in ast.walk(tree)
                   if isinstance(n, ast.Name) and n.id == name) - 1  # definition
        if uses <= 0:
            findings.append(Finding("A19", lineno,
                f"limit {name} is declared but never referenced",
                "docs/anti-patterns.md#A19"))

    # A1: free text / digest passed into a comparator.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id in _COMPARE_FUNCS:
            for arg in node.args:
                if isinstance(arg, ast.Name) and arg.id.lower() in (
                        {"digest", "text", "prose", "explanation", "reason", "message"}):
                    findings.append(Finding("A1", node.lineno,
                        f"possible free text '{arg.id}' passed to {node.func.id}",
                        "docs/anti-patterns.md#A1"))
            for kw in node.keywords:
                if isinstance(kw.value, ast.Name) and kw.value.id.lower() in (
                        {"digest", "text", "prose", "explanation", "reason", "message"}):
                    findings.append(Finding("A1", node.lineno,
                        f"possible free text '{kw.value.id}' passed to {node.func.id}",
                        "docs/anti-patterns.md#A1"))

    # A23: a field outside the pattern's schema passed to a comparator.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id in _ALLOWED_FIELDS:
            for arg in node.args[:2]:
                if isinstance(arg, ast.Dict):
                    keys = set()
                    for k in arg.keys:
                        if isinstance(k, ast.Constant) and isinstance(k.value, str):
                            keys.add(k.value)
                    allowed = _ALLOWED_FIELDS[node.func.id]
                    extra = keys - allowed
                    if extra:
                        findings.append(Finding("A23", node.lineno,
                            f"field(s) {sorted(extra)} passed to {node.func.id}; "
                            f"allowed: {sorted(allowed)}",
                            "docs/anti-patterns.md#A23"))

    # A3: model-facing code with no subset_of call.
    source_lower = source.lower()
    model_facing = ("exec_prompt" in source or "nondet" in source_lower)
    has_subset = "subset_of" in source
    if model_facing and not has_subset:
        findings.append(Finding("A3", 1,
            "model-facing code with no subset_of call; model-supplied ids must be "
            "checked against the provided universe",
            "docs/anti-patterns.md#A3"))

    # A6: UNAVAILABLE coerced to a boolean.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id == "bool":
            # inspect the argument's source text
            for arg in node.args:
                segment = ast.get_source_segment(source, arg) or ""
                if "UNAVAILABLE" in segment.upper():
                    findings.append(Finding("A6", node.lineno,
                        "UNAVAILABLE coerced to bool; it must remain its own state",
                        "docs/anti-patterns.md#A6"))

    # A23-style: a comparator call where a dict is built with a digest key for a
    # pattern that does not allow it is already covered above.

    # The vendored primitives block is generated and audited separately (vendor --check);
    # do not report findings inside it.
    vendored_lines: set[int] = set()
    lines_list = source.splitlines()
    in_vendored = False
    for i, raw in enumerate(lines_list, 1):
        if "# BEGIN VENDORED PRIMITIVES" in raw:
            in_vendored = True
        if in_vendored:
            vendored_lines.add(i)
        if "# END VENDORED PRIMITIVES" in raw:
            in_vendored = False

    # Honor ignore directives: a line may carry "# ekit: ignore RULE[,RULE]" and a
    # file may start with "# ekit: ignore-file RULE[,RULE]".
    file_ignored: set[str] = set()
    for raw in source.splitlines():
        m = re.search(r"#\s*ekit:\s*ignore-file\s+(.+)$", raw)
        if m:
            file_ignored.update(x.strip() for x in m.group(1).split(","))
    ignored_lines: dict[int, set[str]] = {}
    for idx, raw in enumerate(source.splitlines(), 1):
        m = re.search(r"#\s*ekit:\s*ignore\s+(.+)$", raw)
        if m and "ignore-file" not in raw:
            ignored_lines[idx] = set(x.strip() for x in m.group(1).split(","))
    filtered = []
    for f in findings:
        if f.line in vendored_lines:
            continue
        if "*" in file_ignored or f.rule in file_ignored:
            continue
        line_rules = ignored_lines.get(f.line, set())
        if "*" in line_rules or f.rule in line_rules:
            continue
        # Also honor an ignore directive on the preceding line (common style).
        prev = ignored_lines.get(f.line - 1, set())
        if "*" in prev or f.rule in prev:
            continue
        filtered.append(f)
    findings = filtered

    # De-duplicate identical findings on the same line/rule.
    seen = set()
    unique = []
    for f in findings:
        key = (f.rule, f.line, f.message)
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)
    unique.sort(key=lambda f: (f.line, f.rule))
    return unique


def audit_file(path: str) -> list[tuple[str, list[Finding]]]:
    results = []
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for name in sorted(files):
                if name.endswith(".py"):
                    full = os.path.join(root, name)
                    with open(full, encoding="utf-8") as handle:
                        results.append((full, audit_source(handle.read(), full)))
    else:
        with open(path, encoding="utf-8") as handle:
            results.append((path, audit_source(handle.read(), path)))
    return results


def format_text(results: list[tuple[str, list[Finding]]]) -> str:
    total = 0
    out = []
    for path, findings in results:
        if not findings:
            out.append(f"{path}: clean")
            continue
        out.append(f"{path}: {len(findings)} finding(s)")
        for f in findings:
            out.append(f"  {f.line:>4}  {f.rule}  {f.message}  ({f.doc})")
        total += len(findings)
    out.append(f"\ntotal: {total} finding(s)")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(prog="ekit", description="EquivalenceKit developer tooling")
    parser.add_argument("--version", action="version", version="equivalencekit 0.1.0")
    sub = parser.add_subparsers(dest="command", required=True)
    audit = sub.add_parser("audit", help="audit a contract against the anti-pattern gallery")
    audit.add_argument("path", help="file or directory to audit")
    audit.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)

    if args.command == "audit":
        results = audit_file(args.path)
        if args.json:
            payload = [{"file": path, "findings": [f.to_dict() for f in findings]}
                       for path, findings in results]
            print(json.dumps(payload, indent=2))
        else:
            print(format_text(results))
        total = sum(len(f) for _, f in results)
        return 1 if total else 0
    return 2
