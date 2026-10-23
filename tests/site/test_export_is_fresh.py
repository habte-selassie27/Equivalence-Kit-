"""Site-data staleness gate (AGENTS quality gates).

``tools/export_site_data.py --check`` fails the shell run when the committed
playground data (`patterns.json`, `report.json`, matrices) is stale relative to
the Python package and its acceptance matrices. Until now that gate was manual.
This test runs the exact invocation documented at the top of the script, under
the pinned interpreter, so a stale regeneration breaks the suite, not just a
local shell history.
"""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The pinned interpreter, same convention as tests/matrices/test_vendored.py:
# tool output is interpreter-sensitive (ast.unparse formatting), so the gate must
# not vary with an ambient `python3`.
PYTHON = "/usr/bin/python3.12"


def test_committed_site_data_matches_the_package() -> None:
    result = subprocess.run(
        [PYTHON, "tools/export_site_data.py", "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (result.stdout + result.stderr).strip()
