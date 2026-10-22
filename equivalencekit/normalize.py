"""Pure normalization primitives.

Every function here is deterministic, bounded, and (where it is a normalizer) idempotent.
No function reads the clock, randomness, network, or environment. No floats are used for
precision-sensitive values.
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .bounds import (
    ID_RE,
    MAX_BUCKETS,
    MAX_DIGEST,
    MAX_ID_LEN,
    MAX_IDS,
    MAX_INPUT_BYTES,
    MAX_TEXT,
    MAX_URL,
    require_input,
    utf8_len,
)
from .errors import KitError

TRUE_TOKENS = frozenset({"true", "t", "yes", "y", "1", "on"})
FALSE_TOKENS = frozenset({"false", "f", "no", "n", "0", "off"})

# Tracking parameters stripped from URL keys. Documented in docs/pattern-catalog.md.
TRACKING_PARAMS = frozenset(
    {
        "fbclid",
        "gclid",
        "dclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "igshid",
        "ref",
        "ref_src",
        "source",
    }
)

# Volatile keys removed by strip_volatile. Compared after normalize_text-style folding.
VOLATILE_KEYS = frozenset(
    {
        "timestamp",
        "time",
        "updated_at",
        "created_at",
        "fetched_at",
        "request_id",
        "requestid",
        "trace_id",
        "nonce",
        "cursor",
        "cache",
        "cache_control",
        "etag",
        "age",
        "server_time",
        "as_of",
        "generated_at",
    }
)

# Heading aliases: normalized spelling -> canonical heading key. ASCII on purpose; extend
# only with a documented alias table update and matching matrix cases.
HEADING_ALIASES = {
    "table of contents": "contents",
    "contents": "contents",
    "overview": "overview",
    "summary": "summary",
    "introduction": "introduction",
    "pricing": "pricing",
    "plans": "pricing",
}


def normalize_text(value: str, max_len: int = MAX_TEXT) -> str:
    """Canonical comparison key: NFKC, lowercase, collapsed whitespace, trimmed."""

    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(value) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    text = unicodedata.normalize("NFKC", value).lower()
    text = re.sub(r"\s+", " ", text).strip()
    if utf8_len(text) > max_len:
        raise KitError("EXPECTED", "OVER_LIMIT")
    return text


def normalize_enum(value: str, allowed, aliases=None) -> str:
    """Map a model token to an allowed enum value; unknown values reject."""

    allowed = tuple(allowed)
    if not allowed:
        raise ValueError("allowed enum set must not be empty")

    canonical = {}
    for item in allowed:
        if not isinstance(item, str):
            raise ValueError("enum values must be strings")
        key = normalize_text(item, max_len=64)
        if key in canonical and canonical[key] != item:
            raise ValueError("enum values collide after normalization")
        canonical[key] = item

    alias_map = {}
    if aliases:
        for alias, target in aliases.items():
            if target not in allowed:
                raise ValueError(f"alias target is not allowed: {target!r}")
            alias_map[normalize_text(alias, max_len=64)] = target

    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    key = normalize_text(value, max_len=64)
    if key in canonical:
        return canonical[key]
    if key in alias_map:
        return alias_map[key]
    raise KitError("LLM_ERROR", "UNKNOWN_ENUM")


def normalize_bool(value) -> bool:
    """Strict boolean from documented tokens only; ambiguous input rejects."""

    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    token = normalize_text(value, max_len=16)
    if token in TRUE_TOKENS:
        return True
    if token in FALSE_TOKENS:
        return False
    raise KitError("LLM_ERROR", "UNKNOWN_ENUM")


def normalize_int(value, min_value=None, max_value=None) -> int:
    """Integer from int or decimal string. No float coercion, no exponents."""

    if isinstance(value, bool):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str):
        token = value.strip()
        if not re.fullmatch(r"[+-]?[0-9]+", token):
            raise KitError("LLM_ERROR", "WRONG_TYPE")
        number = int(token, 10)
    else:
        raise KitError("LLM_ERROR", "WRONG_TYPE")

    if min_value is not None and number < min_value:
        raise KitError("LLM_ERROR", "OUT_OF_RANGE")
    if max_value is not None and number > max_value:
        raise KitError("LLM_ERROR", "OUT_OF_RANGE")
    return number


def normalize_ratio_bps(numerator: int, denominator: int) -> int:
    """Ratio as integer basis points, rounded half up. Range 0..10000."""

    if isinstance(numerator, bool) or isinstance(denominator, bool):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if not isinstance(numerator, int) or not isinstance(denominator, int):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if numerator < 0 or denominator <= 0:
        raise KitError("LLM_ERROR", "OUT_OF_RANGE")
    bps = (numerator * 10000 + denominator // 2) // denominator
    if bps > 10000:
        raise KitError("LLM_ERROR", "OUT_OF_RANGE")
    return bps


def normalize_id_list(values, max_items: int = MAX_IDS, max_len: int = MAX_ID_LEN) -> tuple:
    """Canonical id tuple: validated, deduped, sorted, bounded."""

    if isinstance(values, (str, bytes)) or not isinstance(values, (list, tuple)):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if len(values) > max_items:
        raise KitError("EXPECTED", "OVER_LIMIT")

    seen = set()
    for item in values:
        if not isinstance(item, str):
            raise KitError("LLM_ERROR", "WRONG_TYPE")
        token = item.strip()
        if utf8_len(token) > max_len or not re.fullmatch(ID_RE, token):
            raise KitError("LLM_ERROR", "UNKNOWN_ID")
        seen.add(token)
    return tuple(sorted(seen))


def normalize_url(value: str) -> str:
    """Canonical URL key: lower scheme/host, no fragment, no credentials, no tracking."""

    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(value) > MAX_URL:
        raise KitError("EXPECTED", "OVER_LIMIT")
    raw = value.strip()
    if not raw:
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    parts = urlsplit(raw)
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https") or not parts.hostname:
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if parts.username is not None or parts.password is not None:
        raise KitError("EXPECTED", "FORBIDDEN")

    host = parts.hostname.lower()
    try:
        port = parts.port
    except ValueError:
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if port is not None and not (
        (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    ):
        host = f"{host}:{port}"

    query = []
    for key, item in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_PARAMS:
            continue
        query.append((key, item))
    query.sort()

    path = parts.path or "/"
    return urlunsplit((scheme, host, path, urlencode(query, doseq=True), ""))


def strip_volatile(value, keys=VOLATILE_KEYS, _depth: int = 0):
    """Recursively drop documented volatile keys. Bounded depth."""

    if _depth > 8:
        raise KitError("EXPECTED", "OVER_LIMIT")
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise KitError("LLM_ERROR", "WRONG_TYPE")
            if normalize_text(key, max_len=64) in keys:
                continue
            result[key] = strip_volatile(item, keys, _depth + 1)
        return result
    if isinstance(value, list):
        if len(value) > MAX_IDS:
            raise KitError("EXPECTED", "OVER_LIMIT")
        return [strip_volatile(item, keys, _depth + 1) for item in value]
    return value


def bucketize(value: int, edges) -> int:
    """Bucket index for ascending inclusive upper edges.

    ``bucketize(10, (10, 20)) == 0`` and ``bucketize(11, (10, 20)) == 1``. Values above the
    last edge return ``len(edges)``. A value below the first edge is still bucket 0.
    """

    if isinstance(value, bool) or not isinstance(value, int):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    edges = tuple(edges)
    if not edges or len(edges) > MAX_BUCKETS:
        raise KitError("EXPECTED", "OVER_LIMIT")
    previous = None
    for edge in edges:
        if isinstance(edge, bool) or not isinstance(edge, int):
            raise KitError("EXPECTED", "INVALID_ARGUMENT")
        if previous is not None and edge <= previous:
            raise KitError("EXPECTED", "INVALID_ARGUMENT")
        previous = edge
    for index, edge in enumerate(edges):
        if value <= edge:
            return index
    return len(edges)


def extract_headings(text: str) -> tuple:
    """Extract normalized heading keys from markdown or simple HTML. Bounded input."""

    if not isinstance(text, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(text) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")

    found = set()
    for line in text.splitlines():
        match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if match:
            found.add(match.group(1))

    for match in re.finditer(r"<h[1-6][^>]*>(.*?)</h[1-6]>", text, flags=re.IGNORECASE | re.DOTALL):
        inner = re.sub(r"<[^>]*>", " ", match.group(1))
        found.add(inner)

    normalized = set()
    for item in found:
        key = normalize_text(item, max_len=MAX_TEXT)
        key = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", key)
        key = HEADING_ALIASES.get(key, key)
        if key:
            normalized.add(key)
    return tuple(sorted(normalized))


def normalize_ws_lines(text: str, max_len: int = MAX_DIGEST) -> str:
    """Whitespace-stable multi-line text for digests. Never used for consensus decisions."""

    if not isinstance(text, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(text) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    lines = []
    for line in text.splitlines():
        cleaned = re.sub(r"[ \t]+", " ", line).strip()
        lines.append(cleaned)
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    result = "\n".join(lines)
    if utf8_len(result) > max_len:
        raise KitError("EXPECTED", "OVER_LIMIT")
    return result
