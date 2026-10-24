from helpers import (
    assert_agreed,
    assert_rejected,
    assert_undetermined,
    deploy_contract,
    transact_until_rejected,
    status_name,
)


def test_real_consensus_accepts_noise_and_rejects_a_wrong_leader():
    contract, _address = deploy_contract("fixtures/consensus_probe.py")

    accepted = contract.accept_adjacent_band(args=[]).transact()
    assert_agreed(accepted)
    assert contract.get_value(args=[]).call() == "ACCEPTED"

    rejected = contract.reject_wrong_verdict(args=[]).transact(consensus_max_rotations=1)
    assert_rejected(rejected)
    assert_undetermined(rejected)
    assert status_name(rejected) == "UNDETERMINED"

    # The rejected transaction did not mutate state.
    assert contract.get_value(args=[]).call() == "ACCEPTED"


def test_rejected_transaction_is_resolved_on_studionet():
    """A real StudioNet write reaches consensus and is rejected by validators.

    The deterministic case we can target for this is an unauthorized caller: the leader's
    own VM rejects before any model run, so validators only need to notice that the
    leader's result is wrong. That makes the rejection durable enough for a live test
    without depending on model variance.
    """
    contract, _address = deploy_contract("fixtures/consensus_probe.py")

    accepted = contract.accept_adjacent_band(args=[]).transact()
    assert_agreed(accepted)
    assert contract.get_value(args=[]).call() == "ACCEPTED"

    receipt = transact_until_rejected(
        contract,
        "reject_unauthorized_caller",
        args=["unauthorized"],
    )
    assert_rejected(receipt)
    assert contract.get_value(args=[]).call() == "ACCEPTED"
