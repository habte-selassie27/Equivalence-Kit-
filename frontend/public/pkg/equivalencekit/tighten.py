"""Tightness testing for user-supplied rules.

``ekit tighten --rules my_rule.py --fixtures my_fixtures.json`` runs the user's own
comparator against a fixture list and reports the acceptance behaviour that earlier only
EquivalenceKit's reference patterns could show:

- how often the rule accepts honest variation (must be 100 percent),
- how often it rejects bad variation (must be 100 percent),
- both misses by case id, so the tolerance can be retuned with evidence,
- and any comparator crash, which is a rule bug rather than a decision.

The runner never edits the rule and never explains it away: a crash is a failure, a
reject without a reason code is a failure, and ``--check`` exits non-zero unless the
rule is tight. Fixtures reuse the existing acceptance-matrix shape, so a matrix written
against a kit pattern can be replayed against a user rule unchanged.
"""

from __future__ import annotations

import importlib.util
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .errors import KitError
from .perturb import harmful_variation, harmless_variation

#: Number of perturbation seeds per side, matching `ekit matrix`.
PERTURBATION_SEEDS = 10

#: Keys a fixture case may carry. `context` is optional; `boundary` only annotates.
_CASE_KEYS = ("id", "leader", "validator", "expected")

_RULE_MODULES_LOADED = 0


def _next_rule_name() -> str:
    global _RULE_MODULES_LOADED
    _RULE_MODULES_LOADED += 1
    return f"ekit_user_rule_{_RULE_MODULES_LOADED}"


@dataclass
class _Case:
    id: str
    leader: Any
    validator: Any
    context: Any
    expected_accept: bool
    boundary: bool


@dataclass
class _RuleCall:
    ok: bool | None
    reason: str | None
    error: str | None = None


def load_rule(path: Path) -> Callable[..., Any]:
    """Load a user rules module and return its ``compare`` callable.

    The module must expose ``compare(leader, validator, context)`` and return
    ``{"ok": bool, "reason": str}`` (or an object with ``ok`` and ``reason``
    attributes). Loading failures raise ``EXPECTED: NOT_FOUND`` and contract
    violations raise ``EXPECTED: INVALID_ARGUMENT``, both strings stable across
    validators because the closed error registry builds them.
    """

    path = Path(path)
    if not path.is_file():
        raise KitError("EXPECTED", "NOT_FOUND")
    spec = importlib.util.spec_from_file_location(_next_rule_name(), path)
    if spec is None or spec.loader is None:
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except SyntaxError as error:
        # Stable message: only the line number and reason, never user text.
        raise KitError("EXPECTED", "INVALID_ARGUMENT") from error
    fn = getattr(module, "compare", None)
    if not callable(fn):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    return fn


def _call(fn: Callable[..., Any], case: _Case) -> _RuleCall:
    """Invoke the rule once and normalise its result. A raise becomes a crash."""

    try:
        result = fn(case.leader, case.validator, case.context)
    except Exception as error:  # user rules may raise anything
        detail = f"{type(error).__name__}"
        return _RuleCall(ok=None, reason=None, error=detail)
    if isinstance(result, dict):
        ok = result.get("ok")
        reason = result.get("reason")
    else:
        ok = getattr(result, "ok", None)
        reason = getattr(result, "reason", None)
    if not isinstance(ok, bool):
        return _RuleCall(ok=None, reason=None, error="RULE_ABI")
    if not ok and (not isinstance(reason, str) or not reason.strip()):
        # A reject without a reason code is not a decision the kit can show.
        return _RuleCall(ok=None, reason=None, error="RULE_ABI")
    return _RuleCall(ok=ok, reason=reason if isinstance(reason, str) else "")


def _parse_cases(spec: dict, *, allow_empty: bool = False) -> list[_Case]:
    cases: list[_Case] = []
    raw = spec.get("cases", [] if allow_empty else None)
    if raw is None or not isinstance(raw, list):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise KitError("EXPECTED", "INVALID_ARGUMENT")
        missing = [key for key in _CASE_KEYS if key not in item]
        if missing:
            raise KitError("EXPECTED", "INVALID_ARGUMENT")
        expected = item["expected"]
        if expected not in ("ACCEPT", "REJECT"):
            raise KitError("EXPECTED", "INVALID_ARGUMENT")
        cases.append(
            _Case(
                id=str(item["id"]),
                leader=item["leader"],
                validator=item["validator"],
                context=item.get("context", {}),
                expected_accept=(expected == "ACCEPT"),
                boundary=bool(item.get("boundary", False)),
            )
        )
    return cases


def _perturb_cases(spec: dict, pattern_id: str) -> tuple[list[_Case], int]:
    """Build harmless/harmful perturbation cases around a canonical output."""

    canonical = spec.get("canonical")
    context = spec.get("context", {})
    if not isinstance(canonical, dict):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    cases: list[_Case] = []
    for seed in range(PERTURBATION_SEEDS):
        cases.append(
            _Case(
                id=f"PERTURB-H-{seed:02d}",
                leader=canonical,
                validator=harmless_variation(pattern_id, canonical, seed),
                context=context,
                expected_accept=True,
                boundary=False,
            )
        )
        cases.append(
            _Case(
                id=f"PERTURB-F-{seed:02d}",
                leader=canonical,
                validator=harmful_variation(pattern_id, canonical, seed),
                context=context,
                expected_accept=False,
                boundary=False,
            )
        )
    return cases, PERTURBATION_SEEDS


@dataclass
class TightenReport:
    """Counts only; percentages are derived, so the JSON stays integer-only."""

    rule: str
    fixtures: str
    case_total: int = 0
    case_passed: int = 0
    boundary_total: int = 0
    boundary_passed: int = 0
    false_disagreement: list[str] = field(default_factory=list)
    false_agreement: list[str] = field(default_factory=list)
    crashes: list[dict[str, str]] = field(default_factory=list)
    harmless_accepted: int = 0
    harmless_total: int = 0
    harmful_rejected: int = 0
    harmful_total: int = 0

    @property
    def tight(self) -> bool:
        if self.crashes:
            return False
        if len(self.false_disagreement) > 0 or len(self.false_agreement) > 0:
            return False
        return self.case_passed == self.case_total

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "fixtures": self.fixtures,
            "case_total": self.case_total,
            "case_passed": self.case_passed,
            "boundary_total": self.boundary_total,
            "boundary_passed": self.boundary_passed,
            "false_disagreement": self.false_disagreement,
            "false_agreement": self.false_agreement,
            "crashes": self.crashes,
            "harmless_accepted": self.harmless_accepted,
            "harmless_total": self.harmless_total,
            "harmful_rejected": self.harmful_rejected,
            "harmful_total": self.harmful_total,
            "tight": self.tight,
        }


def run_tighten(
    rule_path: Path,
    fixtures_path: Path,
    pattern_id: str | None = None,
) -> TightenReport:
    """Run the user rule against a fixtures file and return the tightness report."""

    fixtures_path = Path(fixtures_path)
    try:
        spec = json.loads(fixtures_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise KitError("EXPECTED", "NOT_FOUND") from error
    if not isinstance(spec, dict):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")

    rule = load_rule(rule_path)
    cases = _parse_cases(spec, allow_empty=pattern_id is not None)
    perturb_total = 0
    if pattern_id is not None:
        cases_perturb, perturb_total = _perturb_cases(spec, pattern_id)
        # Keep the seeded variations after the explicit cases, in a stable order.
        cases = cases + cases_perturb

    report = TightenReport(
        rule=str(rule_path),
        fixtures=str(fixtures_path),
    )
    report.harmless_total = perturb_total
    report.harmful_total = perturb_total

    for case in cases:
        call = _call(rule, case)
        is_perturb = case.id.startswith("PERTURB-")
        if call.error is not None:
            report.crashes.append({"id": case.id, "error": call.error})
            continue
        assert call.ok is not None
        expected_ok = call.ok == case.expected_accept
        if is_perturb:
            if case.expected_accept and call.ok:
                report.harmless_accepted += 1
            elif not case.expected_accept and not call.ok:
                report.harmful_rejected += 1
            else:
                if case.expected_accept:
                    report.false_disagreement.append(case.id)
                else:
                    report.false_agreement.append(case.id)
            continue
        report.case_total += 1
        if case.boundary:
            report.boundary_total += 1
        if expected_ok:
            report.case_passed += 1
            if case.boundary:
                report.boundary_passed += 1
        elif case.expected_accept:
            report.false_disagreement.append(case.id)
        else:
            report.false_agreement.append(case.id)
    return report


def format_percent(part: int, total: int) -> str:
    """One-decimal percentage without float rounding surprises."""

    if total <= 0:
        return "n/a"
    return f"{(part * 1000 // total) / 10:.1f}%"


def format_text(report: TightenReport) -> str:
    """Human-readable report in the same voice as `ekit audit`."""

    lines: list[str] = []
    lines.append(
        f"ekit tighten — rule: {report.rule}  fixtures: {report.fixtures}"
    )
    lines.append(
        f"cases: {report.case_passed}/{report.case_total} passed "
        f"({report.boundary_passed}/{report.boundary_total} boundary)"
    )
    lines.append(
        f"honest variation accepted: {format_percent(report.harmless_accepted, report.harmless_total)}"
        f" ({report.harmless_accepted}/{report.harmless_total})"
    )
    lines.append(
        f"bad variation rejected:    {format_percent(report.harmful_rejected, report.harmful_total)}"
        f" ({report.harmful_rejected}/{report.harmful_total})"
    )
    if report.false_disagreement:
        lines.append(
            f"too strict (honest outputs rejected): {', '.join(report.false_disagreement)}"
        )
    if report.false_agreement:
        lines.append(
            f"too loose (bad outputs accepted): {', '.join(report.false_agreement)}"
        )
    if report.crashes:
        lines.append(
            "rule crashes: " + ", ".join(f"{c['id']} ({c['error']})" for c in report.crashes)
        )
    detail = []
    if report.false_disagreement:
        detail.append("too strict")
    if report.false_agreement:
        detail.append("too loose")
    if report.crashes:
        detail.append("crashes")
    lines.append("result: TIGHT" if report.tight else f"result: NOT TIGHT ({'; '.join(detail)})")
    return "\n".join(lines)


def write_init(directory: Path) -> tuple[Path, Path]:
    """Write a starter rules module and fixtures file (refuses to overwrite)."""

    rule_path = directory / "ekit_rule.py"
    fixtures_path = directory / "ekit_fixtures.json"
    if rule_path.exists() or fixtures_path.exists():
        raise KitError("EXPECTED", "ALREADY_EXISTS")
    rule_path.write_text(RULE_TEMPLATE)
    fixtures_path.write_text(FIXTURES_TEMPLATE)
    return rule_path, fixtures_path


RULE_TEMPLATE = '''"""A user rule for `ekit tighten`.

`compare(leader, validator, context)` decides whether a leader output and an
independent validator output describe the same decision. Return a dict:

    {"ok": True, "reason": ""}        accept
    {"ok": False, "reason": "CODE"}   reject, with a stable reason code

Rules for a real rule (see the EquivalenceKit docs):
- compare decisions, never explanations; never compare free text or digests
- normalise first, then apply exactly one tolerance per field
- reject unknown ids, unknown enums, and out-of-range values
- return the same reason code for the same failure, every time
"""

from equivalencekit.normalize import normalize_enum

ALLOWED_VERDICTS = ("ELIGIBLE", "INELIGIBLE")


def compare(leader, validator, context):
    # Both sides must be usable at all.
    for output in (leader, validator):
        verdict = output.get("verdict")
        if verdict is None:
            return {"ok": False, "reason": "MISSING_KEY"}
    # Normalise, then decide on the canonical form.
    try:
        leader_verdict = normalize_enum(leader["verdict"], ALLOWED_VERDICTS)
        validator_verdict = normalize_enum(validator["verdict"], ALLOWED_VERDICTS)
    except Exception:
        return {"ok": False, "reason": "UNKNOWN_ENUM"}
    return {
        "ok": leader_verdict == validator_verdict,
        "reason": "" if leader_verdict == validator_verdict else "VERDICT_MISMATCH",
    }
'''

FIXTURES_TEMPLATE = '''{
  "cases": [
    {"id": "accept-same", "expected": "ACCEPT",
     "leader": {"verdict": "ELIGIBLE"}, "validator": {"verdict": "ELIGIBLE"}},
    {"id": "accept-casing-whitespace", "expected": "ACCEPT", "boundary": true,
     "leader": {"verdict": "eligible"}, "validator": {"verdict": "  ELIGIBLE "}},
    {"id": "reject-mismatch", "expected": "REJECT",
     "leader": {"verdict": "ELIGIBLE"}, "validator": {"verdict": "INELIGIBLE"}},
    {"id": "reject-missing-key", "expected": "REJECT",
     "leader": {"verdict": "ELIGIBLE"}, "validator": {}},
    {"id": "reject-unknown-word", "expected": "REJECT",
     "leader": {"verdict": "MAYBE"}, "validator": {"verdict": "MAYBE"}}
  ]
}
'''
