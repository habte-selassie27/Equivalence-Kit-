# EquivalenceKit — Loop State

## Current state

- Pass: 14
- Current milestone: M14 — security audit fixes, complete
- Last completed milestone: M14 — every P0/P1/P2 audit finding fixed, covered by tests, and
  verified under real StudioNet consensus
- Stall counter: 0
- Last scores: 257 local tests passed (60 primitives, 159 matrices/vendored, 38 direct);
  4 contracts lint clean; vendor fresh; tightness 60/60 / 60/60; site data up to date;
  74 playground tests pass, typecheck and build clean;
  StudioNet integration + deployment suite **6 passed in 524.20s**

## Audit findings and their fixes

| ID | Finding | Severity | Status |
|---|---|---|---|
| H-1 | `ranking_judge` discarded submitted evidence; the model ranked with no evidence | HIGH | fixed — evidence stored and shown to the model; sentinel-prompt test |
| H-2 | `ranking_judge` declared round/history caps it never enforced | MEDIUM | fixed — one enforced cap, `get_config()` tells the truth |
| H-3 | `web_fact_attestor` accepted any URL (SSRF, plain http) | MEDIUM–HIGH | fixed — https only, private/loopback/link-local hosts rejected |
| H-4 | `web_fact_attestor` stored a leader-supplied digest under an overstated name | MEDIUM | fixed — renamed `leader_snapshot_digest`, documented |
| H-5 | `ranking_judge` permitted `min_overlap_pct = 0` (vacuous rule) | MEDIUM | fixed — floor of 1 percent |
| H-6 | `web_fact_attestor` rounds were griefable and unattributable | MEDIUM | fixed — creator or previous requester only |
| M-1 | `verdict_judge.evaluate` also accepted CHALLENGED | MEDIUM | fixed — `evaluate` requires OPEN |
| M-2 | `ranking_judge.challenge` was creator-only | MEDIUM | fixed — evidence submitters may challenge |
| M-3 | `verdict_judge.submit_evidence` relied on SDK write-through | LOW | fixed — uniform copy-then-write-back |
| M-4 | `ranking_judge` duplicated its consensus block | LOW | fixed — one `_rank` helper |
| M-5 | the post-consensus fact check compared the facts with themselves | LOW | fixed — `validate_facts` primitive |
| M-6 | `verdict_judge` spent a round when every verdict was forbidden | LOW | fixed — explicit `INVALID_STATE` |
| M-7 | permissionless consensus triggers undocumented | INFO | fixed — docstrings state it |
| M-8 | P4 has no "unrankable" state | INFO | documented as a pattern-level gap |
| M-9 | `ranking_judge` showed raw rubric JSON to the model | INFO | fixed — rendered like `verdict_judge` |

Two further issues were found while implementing and fixed:

- **A bucket fact held the bucket index** while `bucket_adjacent` expects a raw measurement,
  so the contract and the comparator disagreed about what a bucket fact was. A bucket fact now
  holds the raw measurement; the comparator buckets both sides.
- **Stored facts were not canonical** — a boolean could be stored as `"yes"`. `normalize_facts`
  now canonicalizes every value before it reaches storage.
- **`ranking_judge` passed its digest into the P4 schema check**, so every validator returned
  `UNEXPECTED_FIELD` and a ranking round could never finalize. Found by the live StudioNet
  round, not by the direct tests, because direct mode executes the leader only. Fixed by
  stripping the digest at the call site, with a validator-level direct test
  (`run_validator`) and anti-pattern A23.

## Live deployments (StudioNet, gasless)

Regenerated 2026-10-22 by a clean run of `tests/deploy/test_studionet_deployment.py`
(`6 passed in 524.20s`). The full record, including saved schemas and every transaction hash,
is in `deployments/studionet.md`.

| Contract | Address |
|---|---|
| VerdictJudge | `0xC4B6E69EC35A9114b43397F6bB59541bC8c5e94B` |
| WebFactAttestor | `0x6E720e9d701B542f0f77F52A4cD1b155225ad0FF` |
| RankingJudge | `0x6dc5764eE90dB65E7b102a0e78E7983deD92b717` |

Regenerated 2026-10-23 with the user's StudioNet wallet
(`0x5B3661C576c7001e6d6279C67F3779705d334c89`) as creator, so the contracts are
owned by them rather than the default test account.

## Verification (pass 14)

```text
$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
257 passed in 1.84s

$ genvm-lint check contracts/<file>.py --json      # verdict_judge, web_fact_attestor,
                                                   # ranking_judge, consensus_probe
{"ok":true,...} x4

$ python3.12 tools/vendor.py --check               # fresh
$ python3.12 tools/tightness.py
Total: 106 matrix cases
Harmless acceptance: 60/60
Harmful rejection: 60/60

$ python3.12 tools/export_site_data.py --check
site data is up to date (9 files)

$ python3.12 -m pytest tests/integration tests/deploy -v -s --network studionet
6 passed in 524.20s
```

## Open gaps

1. M10 testnet deployment (Bradbury/Asimov) — hard stop, needs funded account at the faucet.
   StudioNet has been re-deployed under the user's own wallet
   (`0x5B3661C576c7001e6d6279C67F3779705d334c89`); those addresses are in
   `deployments/studionet.md`.
2. M-UI-8 hosting — manual deploy to any static host.
3. The local GenLayer node (jsonrpc + postgres) is down because the host already occupies
   :5432. The StudioNet tests no longer need it: they fetch the schema of the deployed
   address from the hosted API instead of asking the local node to synthesize one.
4. A live model is not unanimous. Two real StudioNet rounds were refused by the rules
   (a P1 verdict split, a P4 top-2 split). Both were the rules working. The rubric and the
   P4 parameters were corrected, and the live tests retry inside the contract's own
   semantics. Documented in `docs/tightness-testing.md` section 5. The final suite passes
   all six tests unassisted after the P4 digest fix.

## Pass 15 — developer tooling (ekit CLI)

Added the distribution and adoption surface the kit was missing:

- `LICENSE` (MIT), `pyproject.toml` (PEP 621, console script `ekit`), `CONTRIBUTING.md`,
  `.pre-commit-hooks.yaml`, `.github/workflows/audit.yml`.
- `equivalencekit/audit.py` + `equivalencekit/cli.py`: `ekit audit <path> [--json]` runs
  deterministic AST checks mapped to the anti-pattern gallery (A1, A3, A6, A13, A14, A15,
  A18, A19, A23), with ignore directives (`# ekit: ignore` / `# ekit: ignore-file`) and
  vendored-block awareness. `ekit --version`.
- `tests/primitives/test_audit.py` (8 tests). Own code audited clean.
- README: install + audit quick start, three-contract wording, audit linter row.
- `equivalencekit/bounds.py`, `perturb.py`, and two test files carry ignore directives
  where a finding is a documented false positive.

Verification: 265 local tests pass; vendor fresh; tightness 60/60; site data up to date;
`ekit audit contracts/ equivalencekit/ tests/` clean; `pip install -e .` works and
`ekit` resolves on PATH.

## Next step

Pass 16: `ekit scaffold` (pattern → vendored contract + matrix test) and `ekit matrix`
(acceptance matrix + perturbation runner on a custom spec). Then the Pattern Builder
screen in the playground. M10 testnet deploy remains blocked on a funded account.
