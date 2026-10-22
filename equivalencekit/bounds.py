# ekit: ignore-file A19
"""Central bounds used by every primitive and contract.

Nothing in the kit may loop or recurse without a documented limit. Over-limit input is a
classified ``EXPECTED: OVER_LIMIT`` failure, never a best-effort truncation (except
``clip_text``, whose entire purpose is a documented deterministic clip).
"""

from __future__ import annotations

from .errors import KitError

# Input and field bounds.
MAX_INPUT_BYTES = 16 * 1024
MAX_TEXT = 512
MAX_TITLE = 160
MAX_DIGEST = 280
MAX_REASON = 280
MAX_URL = 2048

# Collection bounds.
MAX_IDS = 64
MAX_ID_LEN = 64
MAX_FACTS = 32
MAX_RUBRIC_ITEMS = 32
MAX_EVIDENCE = 64
MAX_ROUNDS = 8
MAX_BUCKETS = 16
MAX_JUDGMENTS = 256
MAX_SPECS = 256

# Charset for ids and fact names.
ID_RE = r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$"
FACT_NAME_RE = r"^[a-z0-9][a-z0-9_.-]*$"


def utf8_len(value: str) -> int:
    return len(value.encode("utf-8"))


def require_within(name: str, value: int, limit: int) -> None:
    """Reject values above a bound. ``name`` is for callers, not the error string."""

    if value < 0 or value > limit:
        raise KitError("EXPECTED", "OVER_LIMIT")


def require_text(value: str, limit: int = MAX_TEXT) -> str:
    if not isinstance(value, str):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    if utf8_len(value) > limit:
        raise KitError("EXPECTED", "OVER_LIMIT")
    return value


def require_input(value: str) -> str:
    if not isinstance(value, str):
        raise KitError("EXPECTED", "INVALID_ARGUMENT")
    if utf8_len(value) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    return value
