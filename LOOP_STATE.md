# EquivalenceKit — Loop State

## Current state

- Pass: 12
- Current milestone: M-UI-8 — playground built locally; hosting is a manual step
- Last completed milestone: M9 — StudioNet deployment with saved schemas and explorer links;
  M8 — integration suite green (4/4 on StudioNet); M11 — full docs; M-UI-1..7 — playground
- Stall counter: 0
- Last scores: 230 Python tests passed (58 primitives, 146 matrices/direct/vendored, 26 direct);
  5 live tests skipped without `--network`; 4 integration + 1 deployment test pass on
  StudioNet; 3 contracts lint clean; vendor fresh; tightness 60/60; site data up to date;
  41 playground tests pass; playground production build succeeds (346 KiB JS + 12 KiB CSS)

## Live deployments (StudioNet, gasless)

| Contract | Address |
|---|---|
| VerdictJudge | `0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a` |
| WebFactAttestor | `0xAeA5d7626807B1821837313cED685d97F73eA80D` |

Full record: `deployments/studionet.md`.

## Open gaps

1. M10 testnet deployment (Bradbury/Asimov) — hard stop, needs funded account at faucet.
2. M-UI-8 hosting — manual deploy to any static host.
3. M12 RankingJudge stretch — optional.

## Next step

Claim testnet GEN at https://testnet-faucet.genlayer.foundation/ (browser only), then deploy
both reference contracts to Bradbury and record addresses, schemas, and explorer links.
>