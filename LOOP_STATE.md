# EquivalenceKit — Loop State

## Current state

- Pass: 7
- Current milestone: M8 — integration tests under real consensus
- Last completed milestone: M7 — WebFactAttestor contract + direct tests + lint
- Stall counter: 0
- Last scores: 230 tests passed (58 primitives, 106 matrix cases, 26 direct, 35 vendored,
  plus meta tests); both contracts lint clean; tightness 60/60 harmless accepted,
  60/60 harmful rejected

## Tooling

git, Python 3.10/3.12, pytest 9.1.1, genvm-lint 0.11.0, genlayer-test 0.1.2, genlayer CLI
0.39.2, docs access, Docker, StudioNet all verified. Direct mode and StudioNet
deploy/write/read proved on a probe contract.

## Verified-API ledger (new findings this pass)

| Item | Source | Status |
|---|---|---|
| Web response is `Response(status, headers, body)`, not `.status_code` | installed pinned SDK; direct tests caught the docs mismatch | VERIFIED |
| `direct_vm.mock_web(pattern, {"status": 200, "body": "..."})` | direct tests | VERIFIED |
| P2 comparator can be vendored and reused verbatim in a contract | lint + direct + vendored tests | VERIFIED |
| FNV-1a digest vectors and UTF-8 behavior | `tests/primitives/test_digest.py` | VERIFIED |
| Earlier ledger (header, storage, `__init__` required, web, LLM, direct mode) | docs + probes + tests | VERIFIED |

## Latest evidence

```text
$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
230 passed in 0.96s

$ genvm-lint check contracts/web_fact_attestor.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"WebFactAttestor","methods":8,...}}

$ python3.12 tools/tightness.py
Harmless acceptance: 60/60
Harmful rejection: 60/60
```

## Open gaps

1. Runtime probe for `unicodedata` in GenVM on StudioNet (M8/M9).
2. Integration tests under real consensus not written yet (M8).
3. Real web/LLM provider behavior on StudioNet not exercised yet.
4. Deployment addresses and schemas not recorded yet (M9).
5. Testnet deployment is a hard stop until the user funds an account (M10).
6. Shipper/site is out of scope; UI.md section 19 only after M11.

## Next step

M8: `tests/integration/` for both contracts on StudioNet; verify the integration API first;
record real transaction output.
