# EquivalenceKit

Reusable equivalence and validator patterns for GenLayer Intelligent Contracts.

The hardest part of building on GenLayer is deciding what validators must agree on. Rules
that are too strict make honest validators disagree, so transactions never finalize. Rules
that are too loose let validators agree on garbage, and a wrong answer is finalized
permanently. Both failures are silent: no exception, no revert, no log line.

EquivalenceKit is a tested kit for getting that decision right, and for *proving* you got it
right.

## What it is

- **A pure-Python primitives package** (`equivalencekit/`) — normalizers, comparators,
  defensive parsing, a closed error registry, bounds, and a deterministic digest. No GenLayer
  imports, so it runs and tests anywhere.
- **Declarative pattern specs P1–P6** — verdict-plus-band, fact set, bounded number,
  ranking, entity set, boolean attestation. Each is data: fields, normalizers, comparators,
  invariants, tolerance rationale, failure behavior, known limits.
- **A tightness-testing method** — acceptance matrices plus perturbation generators that
  measure whether a rule is too loose or too strict, with a report you can read.
- **Three reference contracts** with real state machines, not demos: VerdictJudge (P1),
  WebFactAttestor (P2), RankingJudge (P4).

## What it is not

- Not a hello-world, a thin LLM wrapper, or a format-only validator.
- Not a frontend or an application.
- Not a substitute for reading the
  [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle).

## Who this is for

Builders writing GenLayer contracts that call an LLM or fetch the live web — anyone who has
ever written a validator that compares raw model output and hoped for the best.

## Install

```bash
pip install -e .          # editable install exposes the `ekit` CLI
ekit audit contracts/     # lint a contract against the anti-pattern gallery
```

## Quick start

```bash
# 1. Primitives (pure Python, no GenLayer needed)
python3.12 -m pytest tests/primitives -q

# 2. Acceptance matrices + vendored-equivalence gate
python3.12 -m pytest tests/matrices -q

# 3. Contracts with mocked web and LLM
python3.12 -m pytest tests/direct -q

# 4. Lint every contract
genvm-lint check contracts/verdict_judge.py --json
genvm-lint check contracts/web_fact_attestor.py --json

# 5. Real consensus on StudioNet (gasless)
python3.12 -m pytest tests/integration -v -s --network studionet
```

Current status: **278 tests passing** (primitives, matrices, direct, vendored equivalence);
all four contracts lint clean; tightness 60/60 on both bars.

## What is in the kit

| Piece | Path | What it does |
|---|---|---|
| Normalizers | `equivalencekit/normalize.py` | Idempotent text/enum/bool/int/id/url normalization, heading extraction, volatile-field stripping |
| Comparators | `equivalencekit/compare.py` | `enum_equal`, `ordinal_within`, `int_within_bps`, `bucket_adjacent`, `set_equal`, `subset_of`, `topk_overlap`, `facts_match`, `validate_facts`, `normalize_facts`, `consistent_with`, `all_of` |
| Defensive parsing | `equivalencekit/parsing.py` | `parse_with_spec` — schema-validated, fail-closed JSON from model output |
| Error registry | `equivalencekit/errors.py` | Closed set of stable `PREFIX: REASON` strings, identical on every validator |
| Bounds | `equivalencekit/bounds.py` | Every limit in one place; `OVER_LIMIT` rejects oversize input |
| Digest | `equivalencekit/digest.py` | Bounded, deterministic, **non-cryptographic** snapshot digest |
| Patterns | `equivalencekit/patterns.py` | P1–P6 specs and comparators, driven by the same data as the tests |
| Perturbation | `equivalencekit/perturb.py` | Harmless and harmful mutation generators for tightness testing |
| Tightness report | `tools/tightness.py` | Prints per-pattern acceptance/rejection rates |
| Vendoring | `tools/vendor.py` | Inlines primitives into a single-file contract |
| Audit linter | `equivalencekit/audit.py`, `ekit audit` | Static checks for the anti-pattern gallery (A1, A3, A6, A13, A14, A15, A18, A19, A23), JSON output for CI |

## Reference contracts

### `VerdictJudge` (`contracts/verdict_judge.py`)

A reusable judgment primitive. A creator freezes a verdict set and a rubric of criteria,
evidence references are appended, and the contract produces an append-only P1 assessment
history.

State machine: `OPEN → EVALUATED → CHALLENGED → EVALUATED (round + 1) → … → CLOSED`.

Deterministic rubric items are decided **in code before any model call**. If they leave
exactly one allowed verdict, the contract writes the assessment without calling the model at
all. Otherwise it asks the model, and `consistent_with` re-checks the result so a forbidden
verdict can never be accepted. The digest is stored but never compared.

### `WebFactAttestor` (`contracts/web_fact_attestor.py`)

Attests a small, fixed set of facts about a web page at a point in time, with P2 consensus.

Only `ENUM_FROM_LIST` facts consult a model; headings, phrases, and word-count buckets are
extracted **in code**, so prompt injection in the page cannot change them. Validators re-fetch
the page independently and compare fact-by-fact. `UNAVAILABLE` is a first-class state with an
empty fact set — a failed fetch is never recorded as a negative finding.

### `contracts/ranking_judge.py`

A reusable ranking primitive (P4). A creator freezes a candidate universe, a rubric, and
ranking parameters (top-k, overlap threshold, optional rank-distance cap). Participants
append evidence references, and the contract produces an append-only ranking history. State
machine: `OPEN -> RANKED -> CHALLENGED -> RANKED (round + 1) -> ... -> CLOSED`.

## Documentation

| File | What it covers |
|---|---|
| [`docs/pattern-catalog.md`](docs/pattern-catalog.md) | P1–P6 filled specs, reason codes, acceptance matrices |
| [`docs/decision-guide.md`](docs/decision-guide.md) | Eight questions to answer before writing non-deterministic logic |
| [`docs/tightness-testing.md`](docs/tightness-testing.md) | Acceptance matrices, perturbation generators, the report |
| [`docs/anti-patterns.md`](docs/anti-patterns.md) | 16 broken rules, the input that exposes each, and its fix |
| [`docs/threat-model.md`](docs/threat-model.md) | Threats, defenses, and — explicitly — what this kit cannot defend against |
| [`docs/contracts.md`](docs/contracts.md) | Contract design and the verified GenLayer API ledger |

## The tightness claim

```bash
python3.12 tools/tightness.py
```

```text
Total: 106 matrix cases
Harmless acceptance: 60/60
Harmful rejection: 60/60
```

Every pattern accepts 100% of harmless perturbations (reordered ids, casing, adjacent
buckets, one-step band shifts, differing digests) and rejects 100% of harmful ones (flipped
enums, hallucinated ids, out-of-range values, injected instructions). Both rates are
requirements, not aspirations: a single miss is a bug in the rule.

## Limitations

Stated plainly:

- **Equivalence rules grade agreement, not truth.** If every validator is fooled the same
  way, consensus finalizes a wrong answer and nothing here detects it.
- **Source truth is not verified.** `WebFactAttestor` proves validators read the same page,
  not that the page is honest.
- **The digest is not cryptographic.** It is FNV-1a, chosen because no hashing module is
  verified in GenVM. It is evidence metadata for audits, never a consensus input.
- **A colluding validator majority and a shared model-provider bias are out of scope** —
  those are protocol-level assumptions, not comparison-layer ones.

See [`docs/threat-model.md`](docs/threat-model.md) for the full list.

## Layout

```
equivalencekit/     pure primitives — no GenLayer imports
contracts/          VerdictJudge, WebFactAttestor, and the consensus probe fixture
tools/              vendor.py (single-file inlining), tightness.py (report)
docs/               pattern catalog, decision guide, threat model, anti-patterns
tests/primitives/   pure tests, no GenLayer
tests/matrices/     acceptance matrices P1–P6, canonical fixtures, vendored equivalence
tests/direct/       contracts with mocked web and LLM
tests/integration/  real consensus on StudioNet
```

## Live deployments (StudioNet)

StudioNet is gasless (0 GEN). All three reference contracts are deployed there; the full
record — addresses, transaction hashes, saved schemas, and per-step validator votes — is in
[`deployments/studionet.md`](deployments/studionet.md).

| Contract | Address | Explorer |
|---|---|---|
| VerdictJudge | `0x6cC47A13978911eE9124Ad20b64118d136dDC689` | [view](https://explorer-studio.genlayer.com/address/0x6cC47A13978911eE9124Ad20b64118d136dDC689) |
| WebFactAttestor | `0x8BBdf514EABFec622DED300dD39aD6e9d889E163` | [view](https://explorer-studio.genlayer.com/address/0x8BBdf514EABFec622DED300dD39aD6e9d889E163) |
| RankingJudge | `0x7765Ce75320ca05974E79b25f029c2213a378A83` | [view](https://explorer-studio.genlayer.com/address/0x7765Ce75320ca05974E79b25f029c2213a378A83) |

A VerdictJudge evaluation reached agreement on a real LLM round with the digest stored but
never compared. A WebFactAttestor attestation fetched the live `example.com` page under P2
consensus; the word-count fact holds the raw count and the bucket rule decides agreement. A
RankingJudge round ranked four candidates under P4 consensus, with the submitted evidence
rendered into the prompt.

Testnet (Bradbury / Asimov) deployment is not done: it needs a funded account, and claiming
testnet GEN at the faucet is a browser step.

## Using the playground (optional companion)

The playground is a static site in `frontend/`. It runs the real `equivalencekit` package
in the browser through Pyodide, so every accept or reject it shows comes from the same
primitives the contracts run.

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173
npm run test         # 91 tests, including the Pyodide engine test
npm run build        # writes dist/
```

The site data is generated from the repo, never hand-edited:

```bash
cd ..
python3.12 tools/export_site_data.py         # regenerate
python3.12 tools/export_site_data.py --check # fails if stale
```

The playground is an optional companion, not part of the contract submission. Most of it
compares outputs and shows the rules in the browser; the **Live** screen (`/live`) is the
exception — it calls the three contracts deployed on StudioNet through the official
`genlayer-js` SDK. Reads need no wallet. A write is signed in your wallet and followed
through the whole transaction lifecycle: signature, hash, live consensus status, the final
receipt with the validator votes and execution result, and a view call that reads the new
record back. StudioNet is gasless, so a write costs 0 GEN.

## Credits and prior art

Built on the GenLayer builder program and informed by:

- **GenLayer Gym** (https://gym.genlayer.foundation/) — web-access source and benchmark patterns
- **Intelligent Oracle** (https://www.intelligentoracle.com/) — real-world consensus checks
- **Prediction Market Kit** (https://github.com/courtofinternet/pm-kit) — outcome-resolution patterns this kit extracts primitives from
- **GenLayer Project Boilerplate** (https://github.com/genlayerlabs/genlayer-project-boilerplate) — contract project structure
- The [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) — the primary reference for this entire project
