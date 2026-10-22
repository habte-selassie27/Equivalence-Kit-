# EquivalenceKit — Loop State

## Current state

- Pass: 13
- Current milestone: M10 — testnet deployment (blocked on user funding the faucet)
- Last completed milestone: M12 — RankingJudge stretch contract
- Stall counter: 0
- Last scores: 241 Python tests passed (58 primitives, 146 matrices/direct/vendored, 26 direct
  + 11 ranking); 5 live tests skipped without `--network`; 4 integration + 1 deployment test
  pass on StudioNet; 4 contracts lint clean; vendor fresh; tightness 60/60; site data up to
  date; 41 playground tests pass; playground production build succeeds

## Live deployments (StudioNet, gasless)

| Contract | Address |
|---|---|
| VerdictJudge | `0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a` |
| WebFactAttestor | `0xAeA5d7626807B1821837313cED685d97F73eA80D` |

Full record: `deployments/studionet.md`.

## Open gaps

1. M10 testnet deployment (Bradbury/Asimov) — hard stop, needs funded account at faucet.
2. M-UI-8 hosting — manual deploy to any static host.
3. (Optional) Integration tests for RankingJudge on StudioNet.

## Next step

Claim testnet GEN at https://testnet-faucet.genlayer.foundation/ (browser only), then deploy
all three reference contracts to Bradbury and record addresses, schemas, and explorer links.
Alternatively, host the playground at any static host and add the live URL to the README.
