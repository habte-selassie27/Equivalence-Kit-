# EquivalenceKit — Loop State

> Rewritten at the end of every pass. Never rely on memory of earlier passes.

## Current state

- Pass: 0 (setup)
- Current milestone: M1 — research note, import strategy, verified API shape
- Last completed milestone: none
- Stall counter: 0
- Last scores: none

## Tooling (verified this pass)

| Tool | Status | Evidence / version |
|---|---|---|
| shell | present | bash/zsh via harness |
| git | present | `/usr/bin/git` |
| Python 3.10 | present | 3.10.12 (pure primitives only) |
| Python 3.12 | present | 3.12.13 (required by genlayer-test direct mode) |
| pytest | present | 9.1.1 |
| genvm-lint | present | 0.11.0 |
| gltest | present | genlayer-test 0.1.2, direct mode works under `python3.12` |
| genlayer CLI | present | 0.39.2, default network studionet |
| docs access | present | `docs.genlayer.com/full-documentation.txt` fetched |
| docker | present | `/usr/bin/docker` (not needed for StudioNet) |
| StudioNet | reachable | `gltest --network studionet` deployed and called a probe contract |

Missing tools: none blocking. Not yet verified: real LLM/web behavior on StudioNet
(M8), Bradbury/Asimov deployment (hard stop by design).

## Verified-API ledger

| Item | Source | Finding |
|---|---|---|
| Contract header | docs first-contract | First line magic comment `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }` |
| Contract class | docs first-contract | One `gl.Contract` subclass per file; `__init__` required even if empty |
| Public methods | docs first-contract | `@gl.public.view`, `@gl.public.write`, `@gl.public.write.payable`; constructor undecorated |
| Storage | docs storage | `DynArray[T]`, `TreeMap[K,V]`, `@allow_storage` dataclasses, sized ints (`u32`, `i64`), `bigint` |
| Storage constructors | direct-mode probe | `DynArray()` / `TreeMap()` raise `TypeError` in SDK v0.3.0-rc7; storage fields are zero-initialized, do not instantiate manually |
| Nondeterminism | docs non-determinism | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` |
| Validator argument | docs non-determinism | Validator receives `gl.vm.Return` (`.calldata`) or error result; return `bool` |
| LLM | docs calling-llms | `gl.nondet.exec_prompt(prompt, response_format="json")` |
| Web | docs web-access | `gl.nondet.web.get(url)` / `request(url, method=...)`; response has `.body` bytes and `.status_code` |
| Errors | docs error-handling | `gl.vm.UserError(message)`; catch in deterministic code; docs also show `gl.UserError` alias — use `gl.vm.UserError` and verify by test |
| Sender | docs first-contract | `gl.message.sender_address` |
| Memory copy | docs storage | `gl.storage.copy_to_memory(value)` for storage objects used in nondet blocks |
| Direct tests | docs testing + installed plugin | fixtures `direct_vm`, `direct_deploy`, `direct_alice/bob/charlie/owner/accounts`; `mock_web`, `mock_llm`, `run_validator`, `expect_revert`, `snapshot` |
| Integration tests | docs testing | `gltest --network studionet`, `get_contract_factory`, `tx_execution_succeeded` |
| Runner stdlib | runner tar | Pinned CPython runner includes `json`, `re`; `unicodedata` compiled into `cpython.wasm` (strings probe) — runtime probe deferred to first StudioNet contract that uses it |

## Import strategy (M1 decision)

Deployment stores one contract source file and the documented contract structure is a single
file. No official source documents importing a sibling local module in a deployed contract.
Decision: contracts are self-contained; `tools/vendor.py` inlines the needed primitives into
each generated contract, and an equivalence test runs the same matrices against package and
vendored copies. Do not rely on sibling imports.

## Open gaps

1. Verify `unicodedata` at runtime in GenVM (planned probe contract on StudioNet).
2. Verify `gl.vm.UserError` behavior and exact message under direct and integration tests.
3. Confirm nested `@allow_storage` dataclass / `TreeMap` inside storage classes (linter + direct).
4. M2–M12 not started.

## Next step

Write `docs/contracts.md` (M1 evidence) and commit pass 1.
