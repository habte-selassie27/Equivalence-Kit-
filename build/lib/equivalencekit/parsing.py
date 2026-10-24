"""Defensive parsing of model output.

The model is untrusted. Every step is bounded, every failure is a classified error, and no
parsed value escapes a declared range, enum, or id universe.
"""

from __future__ import annotations

import json
import re

from .bounds import MAX_INPUT_BYTES, MAX_TEXT, utf8_len
from .errors import KitError
from .normalize import (
    normalize_bool,
    normalize_enum,
    normalize_id_list,
    normalize_int,
    normalize_text,
)


def strip_fences(text: str) -> str:
    """Remove markdown fences and surrounding commentary around a single fenced block."""

    if not isinstance(text, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(text) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    match = re.search(r"```[A-Za-z0-9_-]*\s*\n?(.*?)```", text, flags=re.DOTALL)
    if match:
        text = match.group(1)
    return text.strip()


def extract_json_object(text: str) -> dict:
    """Extract the first balanced top-level JSON object without a greedy regex."""

    if not isinstance(text, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(text) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")

    start = text.find("{")
    if start < 0:
        raise KitError("LLM_ERROR", "BAD_JSON")

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : index + 1]
                try:
                    parsed = json.loads(candidate)
                except (ValueError, TypeError):
                    raise KitError("LLM_ERROR", "BAD_JSON")
                if not isinstance(parsed, dict):
                    raise KitError("LLM_ERROR", "BAD_JSON")
                return parsed
    raise KitError("LLM_ERROR", "BAD_JSON")


def clip_text(value, max_len: int = MAX_TEXT) -> str:
    """Deterministically clip a free-text field. Never used for consensus decisions."""

    if not isinstance(value, str):
        raise KitError("LLM_ERROR", "WRONG_TYPE")
    if utf8_len(value) > MAX_INPUT_BYTES:
        raise KitError("EXPECTED", "OVER_LIMIT")
    return value[:max_len]


def _field_value(name: str, value, rule: dict):
    kind = rule.get("type")
    if kind == "enum":
        return normalize_enum(value, rule["allowed"], rule.get("enum_aliases"))
    if kind == "bool":
        return normalize_bool(value)
    if kind == "int":
        return normalize_int(value, rule.get("min"), rule.get("max"))
    if kind == "id_list":
        parsed = normalize_id_list(value, max_items=rule.get("max_items", 64))
        universe = rule.get("universe")
        if universe is not None:
            allowed = set(normalize_id_list(universe))
            if any(item not in allowed for item in parsed):
                raise KitError("LLM_ERROR", "UNKNOWN_ID")
        return list(parsed)
    if kind == "text":
        return clip_text(value, rule.get("max_len", MAX_TEXT))
    if kind == "normalized_text":
        return normalize_text(value, rule.get("max_len", MAX_TEXT))
    raise ValueError(f"unknown field type for {name}: {kind!r}")


def parse_with_spec(raw, spec: dict) -> dict:
    """Parse and validate a model object against a declarative field spec."""

    if isinstance(raw, str):
        if utf8_len(raw) > MAX_INPUT_BYTES:
            raise KitError("EXPECTED", "OVER_LIMIT")
        text = strip_fences(raw)
        parsed = extract_json_object(text)
    elif isinstance(raw, dict):
        parsed = raw
    else:
        raise KitError("LLM_ERROR", "WRONG_TYPE")

    if not isinstance(spec, dict) or "fields" not in spec:
        raise ValueError("spec must contain fields")
    fields = spec["fields"]
    allow_extra = bool(spec.get("allow_extra", False))

    if not allow_extra:
        known = set(fields)
        for rule in fields.values():
            known.update(rule.get("key_aliases", ()))
        for key in parsed:
            if key not in known:
                raise KitError("LLM_ERROR", "UNKNOWN_KEY")

    result = {}
    missing = object()
    for name, rule in fields.items():
        if name in parsed:
            result[name] = _field_value(name, parsed[name], rule)
            continue

        alias_hit = missing
        for alias in rule.get("key_aliases", ()):
            if alias in parsed:
                alias_hit = parsed[alias]
                break
        if alias_hit is not missing:
            result[name] = _field_value(name, alias_hit, rule)
            continue

        if rule.get("required", True):
            raise KitError("LLM_ERROR", "MISSING_KEY")
        if "default" in rule:
            result[name] = rule["default"]

    return result
