# Submission notes — EquivalenceKit (Developer Tools track)

## What it does

EquivalenceKit is a tested kit of equivalence and validator patterns for GenLayer
Intelligent Contracts. It ships:

- a pure-Python primitives package (`equivalencekit/`) with zero GenLayer imports:
  normalizers, comparators, parsers, a closed classified-error registry, bounds;
- six declarative patterns (P1 Verdict plus band … P6 Boolean attestation) with filled
  specs and acceptance matrices;
- three reference Intelligent Contracts with real state machines — VerdictJudge,
  WebFactAttestor, RankingJudge (stretch);
- an in-repo CLI (`ekit audit`, `ekit matrix`, `ekit diagnose`) and an optional
  browser playground (`frontend/`) that runs the real package under Pyodide.

## Problem it solves

The hardest part of a GenLayer contract is deciding what validators must agree on.
Rules that are too strict make honest validators disagree; rules that are too loose let a
validator agree with garbage. Builders reinvent normalizers, tolerance bands, and parsers,
and rarely test how tight their rules really are. EquivalenceKit gives them reusable
primitives, a decision guide, and a tightness-testing method (acceptance matrices +
perturbation generators) that reports harmless-acceptance and harmful-rejection rates.

## How to use

1. Run the primitive gates: `pytest tests/primitives tests/matrices tests/direct tests/site -v`
   (278 tests, no GenLayer needed).
2. Lint the contracts: `genvm-lint check contracts/<file>.py --json`.
3. Audit a contract against the anti-pattern gallery: `ekit audit contracts/ --json`.
4. Run an acceptance matrix: `ekit matrix tests/matrices/P1.json` (or `--json`).
5. Diagnose a failed transaction: `ekit diagnose <txHash>` (or `--from-file`).
5. Diagnose a failed transaction: `ekit diagnose <txHash>`.
6. Deploy: `genlayer network set studionet`, then `genlayer deploy contracts/<file>.py`.
7. Optional playground: `cd frontend && npm install && npm run dev`.

## Tags

- Tag 1: Contract Testing
- Tag 2: Failure Diagnosis

## Networks

StudioNet (gasless, deployed — see `deployments/studionet.md`). Testnet (Bradbury/Asimov)
not deployed: claiming testnet GEN is a browser step.
