"""Closed, deterministic error registry for EquivalenceKit.

Error strings are part of consensus: every validator must produce the same string for the
same failure. They therefore contain only a prefix and a registered reason code. No
timestamps, random ids, raw model output, or raw page content are allowed.
"""

from __future__ import annotations

PREFIXES = ("EXPECTED", "EXTERNAL", "TRANSIENT", "LLM_ERROR")

REGISTRY = {
    "EXPECTED": frozenset(
        {
            "NOT_AUTHORIZED",
            "INVALID_STATE",
            "OVER_LIMIT",
            "INVALID_ARGUMENT",
            "NOT_FOUND",
            "ALREADY_EXISTS",
            "FORBIDDEN",
        }
    ),
    "EXTERNAL": frozenset(
        {
            "SOURCE_UNREACHABLE",
            "SOURCE_EMPTY",
            "SOURCE_MALFORMED",
        }
    ),
    "TRANSIENT": frozenset(
        {
            "UPSTREAM_TIMEOUT",
            "RATE_LIMITED",
        }
    ),
    "LLM_ERROR": frozenset(
        {
            "BAD_JSON",
            "MISSING_KEY",
            "WRONG_TYPE",
            "UNKNOWN_ENUM",
            "UNKNOWN_ID",
            "OUT_OF_RANGE",
            "EMPTY_OUTPUT",
            "TOO_LARGE",
            "INCONSISTENT",
        }
    ),
}


class KitError(Exception):
    """A classified error with a stable, registry-backed message."""

    def __init__(self, prefix: str, reason: str) -> None:
        self.prefix = prefix
        self.reason = reason
        self.code = make_error(prefix, reason)
        super().__init__(self.code)


def _validate(prefix: str, reason: str) -> None:
    if prefix not in REGISTRY:
        raise ValueError(f"unregistered error prefix: {prefix!r}")
    if reason not in REGISTRY[prefix]:
        raise ValueError(f"unregistered reason code for {prefix}: {reason!r}")


def make_error(prefix: str, reason: str) -> str:
    """Build a stable error string. Unknown values are programming errors."""

    _validate(prefix, reason)
    return f"{prefix}: {reason}"


def is_registered(prefix: str, reason: str) -> bool:
    return reason in REGISTRY.get(prefix, ())


def error_from_code(code: str) -> KitError:
    """Rebuild a KitError from a stable string, validating the registry."""

    prefix, sep, reason = code.partition(": ")
    if not sep:
        raise ValueError(f"malformed error code: {code!r}")
    return KitError(prefix, reason)
