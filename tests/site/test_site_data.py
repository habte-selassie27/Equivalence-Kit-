"""Staleness guards for the playground's bundled site data.

The playground ships pre-generated JSON (``frontend/src/data/*.json``) produced by
``tools/export_site_data.py``. If a primitive or pattern changes and the data is not
regenerated, the site silently shows stale numbers. This test runs the check in CI.

It also checks the one place the site is allowed to know about the chain: the Live
screen's deployment registry. Those addresses are hand-written TypeScript, and the
authoritative record is generated from the contracts — so if they ever disagree, the
screen would call the wrong contract.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def test_site_data_is_up_to_date():
    # Pinned interpreter on purpose: tool output is interpreter-sensitive and the
    # vendoring/export gates must not vary with an ambient `python3`.
    result = subprocess.run(
        ["/usr/bin/python3.12", str(ROOT / "tools" / "export_site_data.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_live_registry_matches_the_deployment_record():
    record = (ROOT / "deployments" / "studionet.md").read_text(encoding="utf-8")
    source = (
        ROOT / "frontend" / "src" / "lib" / "genlayer.ts"
    ).read_text(encoding="utf-8")

    registry_addresses = re.findall(r'address: "(0x[0-9a-fA-F]{40})"', source)
    assert len(registry_addresses) == 3, registry_addresses
    for address in registry_addresses:
        assert address in record, f"{address} is not in deployments/studionet.md"

    registry_files = re.findall(r'file: "([^"]+\.py)"', source)
    assert len(registry_files) == 3, registry_files
    for contract_file in registry_files:
        assert contract_file in record, f"{contract_file} is not in deployments/studionet.md"


def test_live_registry_addresses_exist_on_disk():
    """Every address the Live screen calls must point at a contract file in the repo."""
    source = (
        ROOT / "frontend" / "src" / "lib" / "genlayer.ts"
    ).read_text(encoding="utf-8")
    for contract_file in re.findall(r'file: "([^"]+\.py)"', source):
        assert (ROOT / contract_file).is_file(), contract_file
