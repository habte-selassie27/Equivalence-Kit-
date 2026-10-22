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
| Web | `gl.nondet.web.get(url)`; response fields are `.status`, `.headers`, `.body` (bytes); the docs text says `.status_code`, but the pinned SDK defines `Response(status, headers, body)` | web-access + installed SDK |
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

### 3.2 M7 implementation findings

| Finding | Detail |
|---|---|
| Web response type | `genlayer/gl/nondet/web.py` defines `Response(status: int, headers: dict, body: bytes | None)`. The prose docs' `.status_code` is wrong for this runner; using it silently raised and the contract recorded `UNAVAILABLE` until direct tests caught it. |
| Direct web mock | `direct_vm.mock_web(pattern, {"status": 200, "body": "<html>..."})`; strings are UTF-8 encoded by the test harness. |
| Web inside nondet | Fetch and LLM calls are lexically inside `leader_fn`; validators re-run the same function and therefore re-fetch independently. |
| P2 reuse | The contract calls the same vendored `compare_p2` that the acceptance matrix tests, so the deployed rule cannot drift from the documented pattern. |
| Digest | `digest_hex` is bounded 32-bit FNV-1a over UTF-8. It is stored as snapshot metadata, never compared, and is explicitly not collision resistant. |
| Page bound | Only the first 3000 characters of the decoded body are extracted or hashed; every claim about a page is therefore bounded and reproducible. |
| URL freeze | The contract uses a small local URL freeze (scheme/host lowercase, fragment stripped, credentials rejected) instead of `normalize_url`, because `urllib.parse` is not yet verified in GenVM. |

### 3.3 M8/M9 implementation findings

| Finding | Detail |
|---|---|
| `tx_execution_succeeded` is leader-only | `gltest.assertions.tx_execution_succeeded` inspects only `leader_receipt[0].execution_result`. The leader's own VM can succeed while **every validator votes `disagree`**, so this helper alone cannot prove consensus accepted a result. Use the validator votes and whether the state write persisted — see `tests/helpers.py`. |
| Rejection signals | Accepted: status `5` (`ACCEPTED`), votes `agree`/`idle`. Rejected: status `6` (`UNDETERMINED`), votes `disagree`/`idle`, and the leader's state write is rolled back. |
| StudioNet explorer | `https://explorer-studio.genlayer.com` with `/address/<addr>` and `/tx/<hash>` paths. The older `genlayer-explorer.vercel.app` host currently answers `DEPLOYMENT_PAUSED`. |
| CLI `--args` cannot pass a JSON string | `genlayer call/write --args` runs `JSON.parse` on every value. When the value parses as an array or object it is encoded as a contract **array/dict**, never as a `str`. A JSON-string parameter that looks like an array (this kit's rubric and fact rules) therefore cannot be passed through the CLI at all. The genlayer-test client encodes a Python `str` correctly, which is why the integration and deployment tests use it. |
| CLI deploy output shape | The deploy command ends with `Result: { 'Transaction Hash': '0x…', 'Contract Address': '0x…' }` — labels and values are single-quoted. The write command instead prints `Write Transaction Hash:` with the hash on the *next* line. Parse by label, not by order. |
| `genlayer schema` | Works against a deployed address and is used to save the schema in `deployments/studionet.md`. |
| gltest config access | `from gltest_cli.config.general import get_general_config` exposes `get_rpc_url()` and `get_network_name()`. |
| gltest deploy receipt | `factory.deploy_contract_tx(args=[])` returns the receipt; the address is `receipt["data"]["contract_address"]`. |

## 4. Standard library availability

The pinned CPython runner archive was inspected directly. `json` and `re` are present under
`py/std`; `unicodedata` is compiled into `cpython.wasm` (module symbols and its
`normalize()` error string are present). **Verified at runtime on StudioNet**: the deployed
VerdictJudge and WebFactAttestor both call `normalize_text` (which uses
`unicodedata.normalize("NFKC", …)`) inside live consensus rounds, and the deployments
recorded in `deployments/studionet.md` succeeded.

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

State machine: a spec is frozen once; attestation 1 is `ACTIVE`; a challenge (or an
`UNAVAILABLE` result) opens the next round; a challenge on an `ACTIVE` record moves it to
`CHALLENGED`; rounds are capped at 16. Facts, source status, digest, and requester are
append-only.

Methods (source: `contracts/web_fact_attestor.py`):

| Method | Kind | Access | Behavior |
|---|---|---|---|
| `create_spec(url, facts_json)` | write | anyone | Freezes an exact URL and 1-16 rules; returns the spec id |
| `request_attestation(spec_id)` | write | anyone | Fetches, extracts, reaches P2 consensus, appends an attestation |
| `challenge_attestation(attestation_id, reason)` | write | spec creator or requester | ACTIVE -> CHALLENGED; reason <= 280 bytes |
| `get_spec`, `get_attestation`, `get_attestations`, `get_latest_attestation`, `get_config` | view | anyone | JSON strings; history is never overwritten |

Fact rule kinds:

- `BOOL_PRESENT_HEADING`: normalized heading equality from markdown or simple HTML headings.
- `BOOL_CONTAINS_PHRASE`: normalized containment in visible page text.
- `BUCKET_WORD_COUNT`: visible word count into explicit ascending integer edges.
- `ENUM_FROM_LIST`: the only model-backed fact; the model picks from a frozen allowed list.

A second `request_attestation` while the latest record is `ACTIVE` and `OK` raises
`EXPECTED: INVALID_STATE`; a challenge or an `UNAVAILABLE` result opens the next round.
Rate bound: 16 attestations per spec. Over-limit input raises `EXPECTED: OVER_LIMIT`.

Consensus: leader fetches and extracts the frozen fact list; validators re-fetch and
re-extract independently; every fact must match by its own rule and source status must be
exact. `UNAVAILABLE` is recorded as its own state with an empty fact set, never as a
negative finding.

M7 evidence:

```text
$ genvm-lint check contracts/web_fact_attestor.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"WebFactAttestor","methods":8,"view_methods":5,"write_methods":3,"ctor_params":0,...}}

$ python3.12 -m pytest tests/direct/test_web_fact_attestor.py -q
13 passed

$ python3.12 -m pytest tests/primitives tests/matrices tests/direct -q
230 passed
```

Both contracts freeze their configuration at creation and store references plus short
digests, not raw pages.

### RankingJudge

Purpose: a reusable ranking primitive. A creator freezes a candidate universe, a rubric,
and ranking parameters (top-k, overlap threshold, optional rank-distance cap). Participants
append evidence references, and the contract produces an append-only ranking history.

State machine: `OPEN -> RANKED -> CHALLENGED -> RANKED (round + 1) -> ... -> CLOSED`.
Every other transition raises `EXPECTED: INVALID_STATE`. Rankings are append-only.

Methods (source: `contracts/ranking_judge.py`):

| Method | Kind | Access | Behavior |
|---|---|---|---|
| `create_ranking(title, candidates_csv, rubric_json, top_k, min_overlap_pct, max_rank_distance)` | write | anyone | Freezes the candidate universe and parameters; returns the id |
| `submit_evidence(ranking_id, ref)` | write | creator always; others while OPEN | Appends an evidence reference; max 64 refs |
| `rank(ranking_id)` | write | anyone | Runs P4 consensus; appends a ranking |
| `challenge(ranking_id, reason)` | write | creator | RANKED -> CHALLENGED; reason <= 280 bytes |
| `re_rank(ranking_id)` | write | anyone | CHALLENGED -> RANKED; appends the next round |
| `close(ranking_id)` | write | creator | RANKED -> CLOSED |
| `get_ranking`, `get_rankings`, `get_evidence`, `get_config` | view | anyone | JSON strings; history is never overwritten |

Limits: 64 candidates, 8 rounds, 16 stored rankings, 64 evidence refs, 16 KiB rubric JSON,
160-byte title, 512-byte reference, 280-byte reason. Over-limit input raises
`EXPECTED: OVER_LIMIT`; malformed input raises `EXPECTED: INVALID_ARGUMENT`.

Design decisions (open questions from AGENTS.md section 15, now resolved):

- **Tie handling:** `normalize_ranked_id_list` deduplicates preserving first occurrence.
  Ties are broken by the model's ordering; the overlap threshold and rank-distance cap
  absorb legitimate swaps.
- **Candidate universe freezing:** frozen at creation and immutable. `subset_of` rejects any
  id outside it — the key anti-hallucination invariant for rankings.
- **Rank distance cap:** optional. `0` means no cap; any positive value caps the rank
  distance for entities that appear in both top-k lists.

Consensus: the model proposes `{ranking, digest}`; validators independently re-rank and
compare with P4 (all ids in the candidate universe; top-k overlap meets the threshold;
rank distance within the cap). The digest is stored but never compared.

M12 evidence:

```text
$ genvm-lint check contracts/ranking_judge.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"RankingJudge","methods":10,...}}

$ python3.12 -m pytest tests/direct/test_ranking_judge.py -q
11 passed
```


## 6. Live deployments (StudioNet)

Deployed 2026-10-22 by `tests/deploy/test_studionet_deployment.py`; the full record,
including saved schemas and every transaction hash, is in
[`deployments/studionet.md`](../deployments/studionet.md).

| Contract | Address | Explorer |
|---|---|---|
| VerdictJudge | `0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a` | [address](https://explorer-studio.genlayer.com/address/0x34c97Ca059b36C967A11C4c4DE9bEE096e017A4a) |
| WebFactAttestor | `0xAeA5d7626807B1821837313cED685d97F73eA80D` | [address](https://explorer-studio.genlayer.com/address/0xAeA5d7626807B1821837313cED685d97F73eA80D) |

StudioNet is gasless, so both deploys cost **0 GEN**.

What the deployment exercised, under real consensus with real validators:

| Step | VerdictJudge | WebFactAttestor |
|---|---|---|
| Deploy | 5/5 `agree` | 5/5 `agree` |
| First read | `get_config` | `get_config` |
| First write | `create_judgment` (freezes verdict set + rubric) | `create_spec` (freezes URL + 3 fact rules) |
| Second write | `submit_evidence` | — |
| Consensus write | `evaluate` — real LLM round, verdict `ELIGIBLE`, band `HIGH`, digest stored and not compared | `request_attestation` — live fetch of `example.com`, `source_status: OK`, facts `has_heading: false`, `mentions_documentation: true`, `word_bucket: 1`, digest `d7ee97cd` |
| Read back | `get_judgment`, `get_assessments` | `get_spec`, `get_latest_attestation`, `get_attestations` |

A VerdictJudge evaluation on StudioNet produced:

```json
{"band": "HIGH", "cited_evidence_ids": ["ev0-0"], "cited_item_ids": ["hard_income", "quality"],
 "digest": "The evidence explicitly states a verified income of 5000 per year, satisfying all rubric requirements.",
 "round": 1, "verdict": "ELIGIBLE"}
```

Note the digest: it is stored for humans and excluded from the comparison, exactly as the
P1 pattern specifies.

Testnet (Bradbury / Asimov) deployment is **not** done: it needs a funded account, and
claiming testnet GEN at the faucet is a browser step that cannot be automated.

