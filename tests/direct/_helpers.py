"""Shared helpers for direct-mode tests."""

CASE_BOND = 10 ** 18


def lock_bond(c, direct_vm, case_id):
    """Post the exact configured proposer bond for a case."""
    direct_vm.value = CASE_BOND
    try:
        return c.lock_bond(case_id)
    finally:
        direct_vm.value = 0


def freeze_with_bond(c, direct_vm, case_id):
    """Freeze evidence, posting the bond first if the case still needs one.

    From Stage 7 a case cannot be frozen without a bond behind it. Tests that
    predate the economics call this so they exercise the behaviour they were
    written for rather than tripping over BOND_REQUIRED.
    """
    state = c.get_bond_state(case_id)
    if not state["has_bond"] and c.get_case(case_id)["status"] == "EVIDENCE_OPEN":
        lock_bond(c, direct_vm, case_id)
    return c.freeze_evidence(case_id)
