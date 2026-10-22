from gltest import get_contract_factory

from helpers import assert_agreed, assert_rejected, assert_undetermined, status_name


def test_real_consensus_accepts_noise_and_rejects_a_wrong_leader():
    factory = get_contract_factory(contract_file_path="fixtures/consensus_probe.py")
    contract = factory.deploy(args=[])

    accepted = contract.accept_adjacent_band(args=[]).transact()
    assert_agreed(accepted)
    assert contract.get_value(args=[]).call() == "ACCEPTED"

    rejected = contract.reject_wrong_verdict(args=[]).transact(consensus_max_rotations=1)
    assert_rejected(rejected)
    assert_undetermined(rejected)
    assert status_name(rejected) == "UNDETERMINED"

    # The rejected transaction did not mutate state.
    assert contract.get_value(args=[]).call() == "ACCEPTED"
