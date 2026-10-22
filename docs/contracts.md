# Contracts and Verified Platform Notes

This file records what was verified against the official GenLayer sources before any adapter
or contract was written. It is the M1 evidence file and is updated whenever an API finding
changes.

Sources used:

- `https://docs.genlayer.com/full-documentation.txt` (fetched 2026-10-22)
- `https://docs.genlayer.com/developers/intelligent-contracts/first-contract`
- `https://docs.genlayer.com/developers/intelligent-contracts/features/storage`
- `https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism`
- `https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms`
- `https://docs.genlayer.com/developers/intelligent-contracts/features/web-access`
- `https://docs.genlayer.com/developers/intelligent-contracts/features/error-handling`
- Installed `genlayer-test` 0.1.2 direct-mode plugin (inspected locally)
- Pinned CPython runner archive from the GenVM universal release (inspected locally)

## 1. Verified API ledger

| Item | Verified finding | Source |
|---|---|---|
| Header | First line: `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }` | first-contract |
| Imports | `from genlayer import *`; everything else under `gl` | first-contract |
| Contract | Exactly one `gl.Contract` subclass per file | first-contract |
| Constructor | `__init__` is required (schema generation fails without it), must not be decorated | first-contract + StudioNet probe |
| Views | `@gl.public.view`; return value is readable over RPC | first-contract |
| Writes | `@gl.public.write`; `@gl.public.write.payable` when receiving value | first-contract |
| Storage arrays | `DynArray[T]`, fully parameterized | storage |
| Storage maps | `TreeMap[K, V]`, fully parameterized | storage |
| Storage records | `@allow_storage` + `@dataclass` | storage |
| Storage integers | sized `u*`/`i*`; `bigint` only when arbitrary precision is required | first-contract |
| Collection init | `DynArray()` / `TreeMap()` cannot be constructed by user code in the tested SDK; fields zero-initialize | direct-mode probe |
| State lifetime | Fields declared in the class body persist; `self.x = ...` for an undeclared field does not | first-contract |
| Sender | `gl.message.sender_address` | first-contract |
| Nondet block | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` | non-determinism |
| Validator input | `gl.vm.Return` with `.calldata`; error results are not `Return` | non-determinism |
| Validator output | `bool` (accept / reject the leader result) | non-determinism |
| LLM | `gl.nondet.exec_prompt(prompt, response_format="json")` | calling-llms |
| Web | `gl.nondet.web.get(url)` or `gl.nondet.web.request(url, method="GET")`; `.body` bytes, `.status_code` | web-access |
| Web inside nondet | All `gl.nondet.*` calls must be inside the leader/validator block | non-determinism |
| Storage writes | Must happen after consensus, outside the nondet block | non-determinism |
| Errors | `raise gl.vm.UserError("CODE")`; catch `gl.vm.UserError` in deterministic code | error-handling |
| Memory copy | `gl.storage.copy_to_memory(storage_value)` before using it inside a nondet block | storage |
| Direct tests | `direct_vm`, `direct_deploy`, `direct_alice/bob/charlie/owner/accounts`; `mock_web`, `mock_llm`, `run_validator`, `expect_revert` | genlayer-test docs + installed plugin |
| Integration | `gltest --network studionet`, `get_contract_factory`, `tx_execution_succeeded` | genlayer-test docs |

Probes actually executed:

```text
$ genvm-lint check /tmp/opencode/ekprobe/mini.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"Mini", ...}}

$ cd /tmp/opencode/ekprobe && python3.12 -m pytest -q
1 passed

$ python3.12 -m pytest tests/test_integration_mini.py -q -s --network studionet
1 passed
```

The StudioNet probe also proved that `__init__` is mandatory: the first deployment produced
a schema error `TypeError: ('__init__ is absent', <class 'contract.Mini'>)`; adding an empty
`__init__` made deploy, write and read succeed.

## 2. Import strategy finding

Deployment stores the contract source as a single code object (`gl.storage.Root.code`), and
every documented contract example is one self-contained file. No official source documents
importing a sibling local module from a deployed contract.

Decision: **vendor the pure primitives into each generated contract**. Contracts do not
import `equivalencekit`. `tools/vendor.py` splices the package source into a marked block,
the generated file is committed with "generated, do not edit", and the matrix suite runs
against both copies. This avoids relying on an undocumented deployment feature.

Consequences:

- The pure package keeps zero GenLayer imports and is testable with plain Python.
- Generated contracts contain only stdlib imports plus `from genlayer import *`.
- Vendored code must stay within the GenVM-safe subset: no `random`, `time`, `os`, `sys`,
  network access, or filesystem access.

## 3. Leader / validator shape used by this kit

The kit uses custom leader/validator pairs, never `strict_eq` around raw LLM or web output.

```python
def leader_fn():
    raw = gl.nondet.exec_prompt(prompt, response_format="json")
    return raw

def validator_fn(leaders_res) -> bool:
    if not isinstance(leaders_res, gl.vm.Return):
        return False
    own = leader_fn()
    return compare_parsed(leaders_res.calldata, own)

agreed = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
# deterministic state mutation happens here, after consensus
```

Rules applied:

- The validator never trusts the leader: it re-runs the nondeterministic work and parses
  its own output with the same spec.
- Schema failures reject; they never pass.
- A source failure is a first-class `UNAVAILABLE` value where the pattern allows it.
- No storage writes, contract calls, or message emission inside the nondet block.

## 4. Standard library availability

The pinned CPython runner archive was inspected directly. `json` and `re` are present under
`py/std`; `unicodedata` is compiled into `cpython.wasm` (module symbols and its
`normalize()` error string are present). The first StudioNet contract that uses
`unicodedata` will be the runtime probe; until that passes, this is recorded as a
pending check rather than assumed.

Forbidden imports (`random`, `os`, `time`, `sys`, `subprocess`) are avoided by the vendored
code. Randomness appears only in test-side perturbation generators, never in comparators.

## 5. Reference contracts

### VerdictJudge

Purpose: a reusable judgment primitive. A creator freezes a rubric and verdict set, submits
evidence references, and the contract produces an append-only P1 assessment history.

State machine: `OPEN -> EVALUATED -> CHALLENGED -> EVALUATED (round + 1) -> ... -> CLOSED`.
Every other transition raises `EXPECTED: INVALID_STATE`. Assessments are append-only.

Consensus: deterministic rubric checks run first in code; forbidden verdicts are enforced;
the LLM proposes `{verdict, band, cited_item_ids, cited_evidence_ids, digest}`; validators
independently re-run and compare with P1 (verdict exact, band within one step, cited ids
subsets, invariant consistency). Digest is stored and never compared.

### WebFactAttestor

Purpose: attest a fixed fact set about a web page at a point in time, with P2 consensus and
an append-only attestation record other contracts can read.

Consensus: leader fetches and extracts the frozen fact list; validators re-fetch and
re-extract independently; every fact must match by its rule. `UNAVAILABLE` is recorded as
its own state, never as a negative fact.

Both contracts freeze their configuration at creation and store references plus short
digests, not raw pages.
