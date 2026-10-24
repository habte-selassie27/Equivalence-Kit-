"""Failure diagnosis: turn a classified error from a receipt into the matching fix.

This module is pure Python and has no GenLayer imports. It takes the text of a
``genlayer receipt ... --stdout --stderr`` (or any blob containing classified errors)
and returns the reason codes found, each paired with the anti-pattern entry that
explains it. The CLI shells out to ``genlayer`` to obtain the receipt text.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import asdict, dataclass
from typing import List, Optional

# Classified error shape produced by equivalencekit.errors.make_error: PREFIX: REASON.
ERROR_RE = re.compile(r"\b(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR):\s*([A-Z_]+)\b")

# Best-effort map from a reason code to the anti-pattern that explains it.
# Codes with no clear single entry fall back to the generic pointer below.
REASON_TO_ANTIPATTERN = {
    "UNKNOWN_ID": ("A3", "No id universe (hallucinated citations)",
                   "Add subset_of(cited_ids, provided_ids); reject any unknown id."),
    "UNKNOWN_ENUM": ("A4", "\"Closest label\" snapping",
                     "normalize_enum with an explicit alias table; reject unknowns."),
    "OUT_OF_RANGE": ("A19", "Limits declared but never enforced",
                     "Range-check in parse_with_spec; reject out-of-range values."),
    "MISSING_KEY": ("A5", "Extra keys silently ignored",
                    "Require every key; reject a missing key with MISSING_KEY."),
    "INCONSISTENT": ("A9", "Requiring identical word counts",
                     "Add consistent_with against the deterministic results."),
    "SOURCE_UNREACHABLE": ("A6", "Treating UNAVAILABLE as false",
                           "Record UNAVAILABLE as its own state, never as false."),
    "TOO_LARGE": ("A14", "Unbounded loops and unbounded inputs",
                  "Bound every list, string, and loop; reject over-limit input."),
    "BAD_JSON": ("A12", "Free-text error messages",
                 "strip_fences + extract_json_object + parse_with_spec; classify as LLM_ERROR."),
    "EMPTY_OUTPUT": ("A1", "Comparing digest prose",
                     "Compare decisions, never explanations; clip digests."),
    "OVER_LIMIT": ("A19", "Limits declared but never enforced",
                   "Enforce bounds with require_within; reject over-limit input."),
}


@dataclass
class Diagnosis:
    code: str
    prefix: str
    reason: str
    anti_pattern: str
    title: str
    fix: str


def diagnose_text(text: str) -> List[Diagnosis]:
    """Extract every classified error in ``text`` and pair it with a fix hint."""
    seen: set = set()
    out: List[Diagnosis] = []
    for prefix, reason in ERROR_RE.findall(text):
        code = f"{prefix}: {reason}"
        if code in seen:
            continue
        seen.add(code)
        ap, title, fix = REASON_TO_ANTIPATTERN.get(
            reason, ("docs/anti-patterns.md", "see the anti-pattern gallery",
                    "Match the reason code to an entry in docs/anti-patterns.md and apply its fix."))
        out.append(Diagnosis(code=code, prefix=prefix, reason=reason,
                             anti_pattern=ap, title=title, fix=fix))
    return out


def fetch_receipt(tx_hash: str, runner=subprocess.run) -> str:
    """Run ``genlayer receipt <txHash> --stdout --stderr`` and return combined text."""
    if shutil.which("genlayer") is None:
        raise RuntimeError("genlayer CLI not found on PATH; install it or pass --from-file")
    result = runner(
        ["genlayer", "receipt", tx_hash, "--stdout", "--stderr"],
        capture_output=True, text=True,
    )
    return (result.stdout or "") + "\n" + (result.stderr or "")


def format_text(diagnoses: List[Diagnosis], source: Optional[str] = None) -> str:
    if not diagnoses:
        lines = ["No classified error (EXPECTED/EXTERNAL/TRANSIENT/LLM_ERROR) found."]
        if source:
            lines.append(f"Source: {source}")
        lines.append("If the transaction failed, inspect the receipt manually or re-run with --from-file.")
        return "\n".join(lines)

    lines = []
    if source:
        lines.append(f"Source: {source}")
    lines.append(f"Found {len(diagnoses)} classified error(s):")
    for d in diagnoses:
        lines.append(f"\n  {d.code}")
        lines.append(f"    anti-pattern: {d.anti_pattern} — {d.title}")
        lines.append(f"    fix: {d.fix}")
    lines.append("\nSee docs/anti-patterns.md for the full gallery.")
    return "\n".join(lines)
