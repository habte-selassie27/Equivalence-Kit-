"""Consensus assertions for StudioNet integration tests.

`gltest.assertions.tx_execution_succeeded` only inspects the *leader* receipt. The leader's
own VM can succeed while every validator votes "disagree", so that helper alone cannot
prove that consensus accepted a result. These helpers read the validator votes and the
transaction status, which is what actually distinguishes acceptance from rejection.

Observed on StudioNet (2026-10-22):

- accepted result: status 5 (ACCEPTED), validator votes are "agree" / "idle".
- rejected result: status 6 (UNDETERMINED), validator votes are "disagree" / "idle", and
  the leader's state write is rolled back.
"""

from genlayer_py.types.transactions import TRANSACTION_STATUS_NUMBER_TO_NAME

STATUS_ACCEPTED = 5
STATUS_UNDETERMINED = 6


def deploy_contract(file_path, account=None):
    """Deploy a contract by file path and return a callable contract.

    `gltest`'s `ContractFactory.deploy` builds the callable methods by asking the *local*
    node to synthesize a schema from the contract source, and
    `gen_getContractSchemaForCode` is a localnet-only capability. The hosted network can
    return the schema of a deployed address directly, so the StudioNet tests use that and
    do not depend on a local node running.
    """

    from gltest import get_contract_factory

    factory = get_contract_factory(contract_file_path=file_path)
    receipt = factory.deploy_contract_tx(args=[])
    address = receipt["data"]["contract_address"]
    return build_contract(address, account=account), address


def build_contract(address, account=None):
    """Build a callable contract for an already-deployed address.

    `gltest`'s `ContractFactory.build_contract` asks the *local* node to synthesize a schema
    from the contract source, and `gen_getContractSchemaForCode` is a localnet-only
    capability. The hosted network can return the schema of a deployed address directly, so
    the StudioNet tests use that and do not depend on a local node running.

    The returned schema is plain JSON: the hosted API returns JSON, while the CLI prints a
    JavaScript object literal.
    """

    from gltest.clients import get_gl_client
    from gltest.contracts.contract import Contract

    client = get_gl_client()
    response = client.provider.make_request(
        method="gen_getContractSchema",
        params=[address],
    )
    return Contract.new(address=address, schema=response["result"], account=account)


def votes(receipt) -> dict:
    """Validator votes keyed by validator address."""

    consensus = receipt.get("consensus_data") or {}
    return consensus.get("votes") or {}


def assert_agreed(receipt) -> None:
    """The leader result was accepted: at least one validator agreed, none disagreed."""

    vote_map = votes(receipt)
    assert vote_map, f"no validator votes in receipt: {receipt}"
    values = list(vote_map.values())
    assert "agree" in values, f"no validator agreed: {vote_map}"
    assert "disagree" not in values, f"a validator disagreed: {vote_map}"
    assert receipt.get("status") == STATUS_ACCEPTED, (
        f"expected ACCEPTED status, got {receipt.get('status')}: {receipt}"
    )


def transact_until_agreed(contract, method, args=None, attempts=3, **kwargs):
    """Run a write method until the validators agree, then return that receipt.

    A live model is not unanimous. Two validators can read the same borderline rubric
    differently, and a strict equivalence rule then refuses the round, leaves the state
    unchanged, and lets the caller try again. That is the rule working, not a defect, so
    the test retries inside the contract's own semantics instead of loosening the rule.

    Each attempt is bounded to one rotation. A refusal with the network's default rotation
    count can spend many minutes re-running the model before it gives up, which turns a
    refused round into a hung test; one rotation makes the refusal prompt and the retry
    meaningful. Pass ``consensus_max_rotations`` to override.

    The final failure still raises, with the last receipt, so a genuine regression is not
    masked by the retry.
    """

    kwargs.setdefault("consensus_max_rotations", 1)
    last = None
    for _ in range(max(1, attempts)):
        try:
            receipt = getattr(contract, method)(args=args or []).transact(**kwargs)
        except Exception as error:  # a refused or timed-out round
            last = error
            continue
        vote_map = votes(receipt)
        values = list(vote_map.values())
        if (
            receipt.get("status") == STATUS_ACCEPTED
            and "agree" in values
            and "disagree" not in values
        ):
            return receipt
        last = receipt
    if isinstance(last, Exception):
        raise last
    assert_agreed(last)
    return last


def assert_rejected(receipt) -> None:
    """The leader result was rejected: at least one validator disagreed."""

    vote_map = votes(receipt)
    assert vote_map, f"no validator votes in receipt: {receipt}"
    values = list(vote_map.values())
    assert "disagree" in values, f"no validator rejected the leader result: {vote_map}"
    assert receipt.get("status") != STATUS_ACCEPTED, (
        f"expected a non-accepted status, got {receipt.get('status')}: {receipt}"
    )


def assert_undetermined(receipt) -> None:
    """The transaction ended undetermined because validators disagreed."""

    assert receipt.get("status") == STATUS_UNDETERMINED, (
        f"expected UNDETERMINED status, got {receipt.get('status')}: {receipt}"
    )


def status_name(receipt) -> str:
    """Human-readable transaction status for evidence output.

    `TransactionStatus` is a string-valued enum (`"ACCEPTED"`), so it cannot be constructed
    from the numeric status. The numeric mapping is keyed by the status as a string.
    """

    number = receipt.get("status")
    if isinstance(number, int):
        number = str(number)
    try:
        return TRANSACTION_STATUS_NUMBER_TO_NAME[number].value
    except (KeyError, TypeError, AttributeError):
        return str(number)
