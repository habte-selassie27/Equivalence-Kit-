"""Integration tests need a real consensus network.

They are skipped unless `--network` is explicitly set to a live network. Without this
guard, a plain `pytest tests/` run reports four failures because the local network has no
LLM, no web access, and no validators.

`pytest_collection_modifyitems` receives every collected item in the session, not just the
ones under this directory, so the hook filters to `tests/integration` explicitly.

Usage:
    python3.12 -m pytest tests/integration -v -s --network studionet
"""

from pathlib import Path

import pytest

LIVE_NETWORKS = ("studionet", "testnet_asimov", "testnet_bradbury")
INTEGRATION_DIR = Path(__file__).resolve().parent


def pytest_collection_modifyitems(config, items):
    network = config.getoption("--network", default="localnet")
    if network in LIVE_NETWORKS:
        return
    skip = pytest.mark.skip(
        reason=f"integration tests need a live network; got --network={network} "
        "(run with --network studionet)"
    )
    for item in items:
        path = Path(str(getattr(item, "fspath", ""))).resolve()
        if INTEGRATION_DIR in path.parents:
            item.add_marker(skip)
