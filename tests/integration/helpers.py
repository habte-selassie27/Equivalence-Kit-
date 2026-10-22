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

from genlayer_py.types.transactions import TransactionStatus

STATUS_ACCEPTED = 5
STATUS_UNDETERMINED = 6


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
    """Human-readable transaction status for evidence output."""

    number = receipt.get("status")
    try:
        return TransactionStatus(int(number)).value
    except (TypeError, ValueError):
        return str(number)
