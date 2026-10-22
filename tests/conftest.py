"""Live-network tests need a real consensus network.

`tests/integration/` and `tests/deploy/` talk to a real network with real LLM and web
access. Without a guard, a plain `pytest tests/` run reports failures because the local
network has no LLM, no web access, and no validators.

`pytest_collection_modifyitems` receives every collected item in the session, not just the
ones under a particular conftest, so this hook filters by directory explicitly.

Usage:
    python3.12 -m pytest tests/integration -v -s --network studionet
    python3.12 -m pytest tests/deploy -v -s --network studionet
"""

from pathlib import Path
import sys

import pytest

# `tests/helpers.py` is shared by the live-network test directories.
sys.path.insert(0, str(Path(__file__).resolve().parent))

LIVE_NETWORKS = ("studionet", "testnet_asimov", "testnet_bradbury")
LIVE_DIRS = ("integration", "deploy")
TESTS_ROOT = Path(__file__).resolve().parent


def pytest_collection_modifyitems(config, items):
    network = config.getoption("--network", default="localnet")
    if network in LIVE_NETWORKS:
        return
    skip = pytest.mark.skip(
        reason=f"live-network tests need a live network; got --network={network} "
        "(run with --network studionet)"
    )
    for item in items:
        path = Path(str(getattr(item, "fspath", ""))).resolve()
        if TESTS_ROOT in path.parents and path.parent.name in LIVE_DIRS:
            item.add_marker(skip)
