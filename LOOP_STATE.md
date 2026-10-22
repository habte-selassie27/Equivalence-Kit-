# EquivalenceKit — Loop State

## Current state

- Pass: 11
- Current milestone: M-UI-8 — playground built locally and documented; hosting is a
  manual step (any static host)
- Last completed milestone: M-UI-1 through M-UI-7 — playground scaffold, shared
  components, Pyodide worker with a precomputed fallback, four screens, accessibility
  and responsive pass, 41 tests passing, production build verified
- Stall counter: 0
- Last scores: 230 Python tests passed (58 primitives, 146 matrices/direct/vendored,
  26 direct); 5 live tests skipped without `--network`; 4 integration + 1 deployment test
  pass on StudioNet; 3 contracts lint clean; vendor fresh; tightness 60/60; site data up
  to date; 41 playground tests pass; production build 346 KiB JS + 12 KiB CSS

## Live deployments (StudioNet, gasless)

| Contract | Address |
|---|---|
| VerdictJudge | `0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a` |
| WebFactAttestor | `0xAeA5d7626807B1821837313cED685d97F73eA80D` |

Full record: `deployments/studionet.md`.

## Verified-API ledger (new findings this pass)

| Item | Source | Status |
|---|---|---|
| `unicodedata` is shipped inside Pyodide's wasm core (`PyInit_unicodedata` present) | grep of `pyodide.asm.wasm` | VERIFIED |
| `re`, `json`, and `urllib.parse` are in Pyodide's `python_stdlib.zip` | zip listing | VERIFIED |
| The real `equivalencekit` package imports and runs in Pyodide; every matrix case in the browser matches the stored precomputed result | `playground/src/worker/engine.test.ts` | VERIFIED |
| `import.meta.env` requires the `vite/client` types in `tsconfig.json` | build error, fixed | VERIFIED |
| A worker resolves relative URLs against its own asset path, not the page | worker fetch failure, fixed with an init message | VERIFIED |
| Earlier ledger (header, storage, `__init__` required, web, LLM, direct mode, CLI args) | docs + probes + tests | VERIFIED |

## Latest evidence

```text
$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
230 passed in 1.05s

$ python3.12 -m pytest tests/integration tests/deploy -q
5 skipped without --network (5 pass on StudioNet)

$ genvm-lint check contracts/{verdict_judge,web_fact_attestor,fixtures/consensus_probe}.py
all ok:true

$ python3.12 tools/vendor.py --check
vendor fresh

$ python3.12 tools/tightness.py
Harmless acceptance: 60/60
Harmful rejection: 60/60

$ python3.12 tools/export_site_data.py --check
site data is up to date (9 files)

$ cd playground && npm run test
41 passed (5 test files)

$ cd playground && npm run build
built in 1.87s (346 KiB JS, 12 KiB CSS)
```

## Completed this pass (M-UI-1 through M-UI-7)

- `tools/export_site_data.py`: generates `playground/src/data/` (9 files) from the repo,
  with a `--check` staleness gate.
- `tools/copy_pkg.mjs`: copies the real `equivalencekit` package into the build output.
- `playground/`: Vite + React + TypeScript + React Router (hash routing) + Vitest +
  testing-library. Tokens, typography, and layout follow UI.md section 3 (Bench/Sheet/
  Graphite/Calibre/Accept/Reject/Edge/Rule, Schibsted Grotesk + IBM Plex Mono, 2px/6px
  radii, one border weight, one elevation).
- `playground/src/worker/`: Pyodide worker running the real package, with a message
  protocol, size cap, and time limit; the main-thread client reports a status line.
- `playground/src/components/`: ToleranceTrack (enum, ordinal, number, bucket, set,
  ranking, boolean variants with an accessible summary), VerdictChip, ReasonCode,
  JsonEditor, FieldLedger, MatrixTable, PerturbationBar, SpecSheet, LimitsNote,
  EmptyState, ErrorNotice.
- `playground/src/screens/`: Patterns, Playground, Tightness, Decision guide.
- `playground/src/lib/`: limits (mirroring `bounds.py`), format, urlState, tracks.
- `playground/src/test/setup.ts` and 41 passing tests.
- `playground/dist/`: production build verified (346 KiB JS, 12 KiB CSS, 0.91 KiB HTML).
- README section "Using the playground (optional companion)".

## Open gaps

1. M-UI-8 hosting: the site builds and runs locally; deploying to a static host (GitHub
   Pages, Netlify, Vercel, Cloudflare Pages) is a manual step. No hosting account was
   configured in this session.
2. The playground has no end-to-end test in a real browser in CI — the Pyodide engine test
   (Node) proves the package runs in wasm and that every matrix result matches the
   stored data, but a browser-level smoke check was not added.
3. M10 testnet deployment (Bradbury/Asimov) is a hard stop until the user funds an account
   at the faucet.
4. M12 RankingJudge stretch not started.

## Next step

Either deploy the playground to a static host (M-UI-8) or build RankingJudge (M12). The
core submission — contracts, primitives, tests, docs, and the StudioNet deployment — is
complete.
