"""Deterministic, bounded, non-cryptographic digest for text snapshots.

A digest is stored as evidence metadata and is never compared in consensus. FNV-1a is used
because it is pure integer arithmetic, stable across platforms, and needs no stdlib hashing
module. It is not collision resistant; do not use it for security decisions.
"""

from __future__ import annotations

from .bounds import MAX_INPUT_BYTES
from .errors import KitError

FNV_OFFSET_BASIS = 0x811C9DC5
FNV_PRIME = 0x01000193
MASK_32 = 0xFFFFFFFF


def fnv1a_32(value: str) -> int:
    """32-bit FNV-1a over the UTF-8 bytes of a bounded string."""

    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    data = value.encode("utf-8")
    if len(data) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    digest = FNV_OFFSET_BASIS
    for byte in data:
        digest ^= byte
        digest = (digest * FNV_PRIME) & MASK_32
    return digest


def digest_hex(value: str) -> str:
    """Eight lowercase hex characters, stable for identical input strings."""

    return format(fnv1a_32(value), "08x")
