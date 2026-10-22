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

### 3.1 M6 implementation findings

Verified while building VerdictJudge (installed SDK + direct mode):

| Finding | Detail |
|---|---|
| Leader signature | `run_nondet_unsafe` serializes `lambda _: leader_fn()`, so `leader_fn` takes no arguments. The direct-mode mock invokes that wrapper with `None`. |
| Return type | `run_nondet_unsafe` is wrapped by `_lazy_api`; a normal call returns the decoded leader value, not a `Lazy`. |
| Validator replay | Direct mode runs the leader only, then `direct_vm.run_validator(leader_result=..., leader_error=...)` replays the captured validator. |
| Storage-class construction | `DynArray()` and `DynArray[T]()` both raise `TypeError: this class can't be instantiated by user`. Construct records with plain lists for `DynArray` fields; the storage descriptor converts them. Verified by probe and by VerdictJudge tests. |
| Nested records | `@allow_storage` records containing `DynArray` of another `@allow_storage` record work, including `gl.storage.copy_to_memory` and append. |
| `gl.vm.UserError` | `raise gl.vm.UserError("PREFIX: CODE")` propagates to direct-mode `expect_revert` unchanged. Catching `KitError` then raising the classified string works. |
| `unicodedata` | Vendor block imports it; genvm-lint passes. StudioNet runtime probe still pending (M9). |

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

Methods (source: `contracts/verdict_judge.py`; generated vendored block is not hand-edited):

| Method | Kind | Access | Behavior |
|---|---|---|---|
| `create_judgment(title, verdicts_csv, rubric_json)` | write | anyone | Freezes 2-8 verdicts, 1-32 rubric items, and deterministic forbidden-verdict rules; returns the id |
| `submit_evidence(judgment_id, ref)` | write | creator always; others while OPEN | Appends `ev<id>-<n>`; max 64 refs, each <= 512 bytes |
| `evaluate(judgment_id)` | write | anyone | Runs code checks first; appends round 1 assessment |
| `challenge(judgment_id, reason)` | write | creator or an evidence submitter | EVALUATED -> CHALLENGED; reason <= 280 bytes |
| `re_evaluate(judgment_id)` | write | anyone | CHALLENGED -> EVALUATED; appends the next round |
| `close(judgment_id)` | write | creator | EVALUATED -> CLOSED |
| `get_judgment`, `get_assessments`, `get_evidence`, `get_config` | view | anyone | JSON strings; histories are never overwritten |

Limits: 8 verdicts, 32 rubric items, 64 evidence refs, 8 rounds, 16 KiB rubric JSON,
280-byte item text, 160-byte rule values, 160-byte title, 512-byte reference, 280-byte
reason. Over-limit input raises `EXPECTED: OVER_LIMIT`; malformed input raises
`EXPECTED: INVALID_ARGUMENT`; unknown records raise `EXPECTED: NOT_FOUND`.

Deterministic rules (decided in code before any model call):

- `ALWAYS_TRUE`
- `EVIDENCE_CONTAINS` (normalized containment against any evidence reference)
- `EVIDENCE_COUNT_AT_LEAST`

A failed item forbids the verdicts listed in its frozen `forbidden` set. If those rules leave
exactly one allowed verdict, the contract writes the assessment without calling the model.
Otherwise it calls the LLM and validators re-run the same deterministic checks.

Consensus: deterministic rubric checks run first in code; forbidden verdicts are enforced;
the LLM proposes `{verdict, band, cited_item_ids, cited_evidence_ids, digest}`; validators
independently re-run and compare with P1 (verdict exact, band within one step, cited ids
subsets, invariant consistency for both outputs). Digest is stored and never compared.
The deterministic post-consensus parse fails closed with `LLM_ERROR: <CODE>` and leaves
state unchanged.

M6 evidence:

```text
$ genvm-lint check contracts/verdict_judge.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"VerdictJudge","methods":10,"view_methods":4,"write_methods":6,"ctor_params":0,...}}

$ python3.12 -m pytest tests/direct/test_verdict_judge.py -q
13 passed

$ python3.12 -m pytest tests/matrices/test_vendored.py -q
31 passed
```

### WebFactAttestor

Purpose: attest a fixed fact set about a web page at a point in time, with P2 consensus and
an append-only attestation record other contracts can read.

Consensus: leader fetches and extracts the frozen fact list; validators re-fetch and
re-extract independently; every fact must match by its rule. `UNAVAILABLE` is recorded as
its own state, never as a negative fact.

Both contracts freeze their configuration at creation and store references plus short
digests, not raw pages.
