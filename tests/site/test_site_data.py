"""Staleness guard for the playground's bundled site data.

The playground ships pre-generated JSON (``playground/src/data/*.json``) produced by
``tools/export_site_data.py``. If a primitive or pattern changes and the data is not
regenerated, the site silently shows stale numbers. This test runs the check in CI.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def test_site_data_is_up_to_date():
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "export_site_data.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
