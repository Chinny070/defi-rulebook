"""Stage 7 direct-mode tests: native GEN proposer bonds.

Web and model are mocked. Direct mode has no PostMessage handler, so an
emitted transfer does not move balances here: these tests verify the bond
state machine, the frozen recipients and the payout guards, not delivery.
"""

import json

import pytest

CONTRACT = "contracts/defi_rulebook.py"
BOND = 10 ** 18

URL_A = "https://docs.example.com/faq/withdrawals"
ANCHORS = ["emergency pause", "72 hours"]
NOTE = "States the maximum emergency pause duration."
PAGE = (
    "Example Docs. The guardian may trigger an emergency pause of the "
    "withdrawal queue. An emergency pause may last no longer than 72 hours."
)
CLAIM_TEXT = "Emergency withdrawals may be paused for at most 72 hours."

CLAIM_DIMS = [
    "SOURCE_AUTHORITY", "SOURCE_INDEPENDENCE", "GOVERNANCE_LEGITIMACY",
    "TEMPORAL_VALIDITY", "CLAIM_SUPPORT", "CONTRADICTORY_EVIDENCE",
]


def deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    direct_vm.value = 0
    return direct_deploy(CONTRACT)


def verdict_json(decision="ESTABLISHED", results=None, evidence_used=None):
    results = results or {}
    return json.dumps({
        "decision": decision,
        "dimensions": [
            {"name": n, "result": results.get(n, "SATISFIED"),
             "reason": f"reason for {n}"} for n in CLAIM_DIMS
        ],
        "evidence_used": evidence_used or [],
        "contradictions": [],
        "summary": "Summary.",
    })


def open_case(c, title="Emergency Withdrawals"):
    if not [p for p in c.list_protocols(0, 50) if p["protocol_id"] == "example-v3"]:
        c.register_protocol("example-v3", "Example V3", "", "")
    rule_id = c.propose_rule("example-v3", "EMERGENCY_CONTROLS", title)
    case_id = c.open_rule_claim(rule_id, CLAIM_TEXT, "ethereum mainnet", "")
    return rule_id, case_id


def lock(c, direct_vm, case_id, amount=BOND):
    direct_vm.value = amount
    try:
        return c.lock_bond(case_id)
    finally:
        direct_vm.value = 0


def bonded_case(c, direct_vm, title="Emergency Withdrawals"):
    rule_id, case_id = open_case(c, title)
    lock(c, direct_vm, case_id)
    eid = c.submit_evidence(case_id, URL_A, "RENDER_TEXT", ANCHORS,
                            "OFFICIAL_DOCUMENTATION", NOTE, 0, False)
    c.freeze_evidence(case_id)
    return rule_id, case_id, eid


def adjudicated(c, direct_vm, decision="ESTABLISHED", results=None,
                title="Emergency Withdrawals"):
    rule_id, case_id, eid = bonded_case(c, direct_vm, title)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict_json(decision, results, [eid]))
    c.request_adjudication(case_id)
    return rule_id, case_id, eid


def expire_window(c, case_id):
    from genlayer.py.types import u256

    c.cases[case_id].challenge_deadline = u256(1)


# ---------------------------------------------------------------------------
# Locking
# ---------------------------------------------------------------------------


def test_correct_amount_accepted(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    bond_id = lock(c, direct_vm, case_id)

    bond = c.get_bond_state(case_id)
    assert bond["has_bond"] is True
    assert bond["state"] == "LOCKED"
    assert bond["amount"] == str(BOND)
    assert bond["role"] == "PROPOSER"
    assert bond["disposition"] == "PENDING"
    assert bond["depositor"].lower() == ("0x" + direct_alice.hex()).lower()
    assert bond["payout_owed"] is False
    assert c.list_case_bonds(case_id, 0, 10)[0]["bond_id"] == bond_id


@pytest.mark.parametrize("amount", [0, 1, BOND - 1, BOND + 1, 2 * BOND])
def test_wrong_amount_rejected(direct_vm, direct_deploy, direct_alice, amount):
    """The bond is fixed by config: a caller can neither underpay nor overpay."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    with pytest.raises(Exception, match=r"BOND_AMOUNT"):
        lock(c, direct_vm, case_id, amount)
    assert c.get_bond_state(case_id)["has_bond"] is False


def test_double_lock_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    lock(c, direct_vm, case_id)
    with pytest.raises(Exception, match=r"BOND_EXISTS"):
        lock(c, direct_vm, case_id)


def test_late_lock_rejected(direct_vm, direct_deploy, direct_alice):
    """A bond cannot be attached once the case has moved past evidence."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = bonded_case(c, direct_vm)
    with pytest.raises(Exception, match=r"BOND_LOCK_CLOSED"):
        lock(c, direct_vm, case_id)


def test_freeze_requires_a_bond(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    c.submit_evidence(case_id, URL_A, "RENDER_TEXT", ANCHORS,
                      "OFFICIAL_DOCUMENTATION", NOTE, 0, False)
    with pytest.raises(Exception, match=r"BOND_REQUIRED"):
        c.freeze_evidence(case_id)


def test_pause_blocks_new_bonds(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    c.set_paused(True)
    with pytest.raises(Exception, match=r"PAUSED"):
        lock(c, direct_vm, case_id)


def test_unknown_case_cannot_be_bonded(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match=r"CASE_NOT_FOUND"):
        lock(c, direct_vm, "c_999")


# ---------------------------------------------------------------------------
# Outcomes
# ---------------------------------------------------------------------------


def test_established_refunds_in_full(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    bond = c.get_bond_state(case_id)
    assert bond["state"] == "REFUNDABLE"
    assert bond["disposition"] == "REFUND"
    assert bond["refund_amount"] == str(BOND)
    assert bond["slash_amount"] == "0"
    assert bond["refund_recipient"].lower() == ("0x" + direct_alice.hex()).lower()
    assert bond["payout_owed"] is True


def test_rejected_claim_slashes_half(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(
        c, direct_vm, decision="NOT_ESTABLISHED",
        results={"CLAIM_SUPPORT": "NOT_SATISFIED"},
    )
    expire_window(c, case_id)
    c.finalize_case(case_id)

    bond = c.get_bond_state(case_id)
    assert bond["state"] == "SLASHABLE"
    assert bond["disposition"] == "SLASH"
    assert bond["slash_amount"] == str(BOND // 2)      # 5000 bps
    assert bond["refund_amount"] == str(BOND - BOND // 2)
    assert bond["slash_recipient"].lower() == \
        c.get_economic_config()["slash_recipient"].lower()


def test_drift_is_slashed_more_lightly_than_a_claim(direct_vm, direct_deploy,
                                                    direct_alice):
    """Reporting stale information is public-good work; a failed drift report
    must not cost the same as a failed first claim."""
    c = deploy(direct_vm, direct_deploy, direct_alice)

    # The SDK is only importable once a contract has been loaded.
    from genlayer.py.types import u256
    import sys

    c.register_protocol("example-v3", "Example V3", "", "")
    rule_id = c.propose_rule("example-v3", "FEES", "Withdrawal Fee")

    mod = sys.modules["_contract_defi_rulebook"]
    key = rule_id + ":v_1"
    c.rule_versions[key] = mod.RuleVersionRecord(
        rule_id=rule_id, version=u256(1), text="Withdrawal fee is 0.5%.",
        scope="", exceptions="", predecessor=u256(0), originating_case_id="c_0",
        effective_basis="seeded", status="CURRENT", established_at=u256(1),
        fingerprint="fp_v1", version_id=key, originating_verdict_id="v_0",
        evidence_digest="seeded",
    )
    rule = c.rules[rule_id]
    rule.current_version = u256(1)
    rule.current_fingerprint = "fp_v1"
    rule.version_count = u256(1)
    rule.status = "ACTIVE"

    case_id = c.open_rule_drift(rule_id, 1, "fp_v1",
                                "Withdrawal fee is now 1%.", "", "")
    lock(c, direct_vm, case_id)
    eid = c.submit_evidence(case_id, "https://gov.example.org/d/1", "GET",
                            ["withdrawal fee"], "FINALIZED_GOVERNANCE_DECISION",
                            NOTE, 1740000000, True)
    c.freeze_evidence(case_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "The withdrawal fee is now 1%."})
    c.snapshot_evidence(eid)

    drift_dims = CLAIM_DIMS + ["EXISTING_RULE_CONSISTENCY"]
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps({
        "decision": "NOT_ESTABLISHED",
        "dimensions": [
            {"name": n,
             "result": "NOT_SATISFIED" if n == "CLAIM_SUPPORT" else "SATISFIED",
             "reason": "r"} for n in drift_dims
        ],
        "evidence_used": [eid], "contradictions": [], "summary": "s",
    }))
    c.request_adjudication(case_id)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    bond = c.get_bond_state(case_id)
    assert bond["state"] == "SLASHABLE"
    assert bond["slash_amount"] == str(BOND // 4)      # 2500 bps, half the claim rate
    assert int(bond["slash_amount"]) < BOND // 2


def test_invalidated_case_refunds_in_full(direct_vm, direct_deploy,
                                          direct_alice, direct_bob):
    """A structural failure is not the proposer's fault."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = bonded_case(c, direct_vm)

    from genlayer.py.types import u256

    rule = c.rules[rule_id]
    rule.current_version = u256(1)
    rule.current_fingerprint = "fp_elsewhere"

    direct_vm.sender = direct_bob
    c.invalidate_stale_case(case_id)

    bond = c.get_bond_state(case_id)
    assert bond["state"] == "REFUNDABLE"
    assert bond["refund_amount"] == str(BOND)
    assert bond["slash_amount"] == "0"


def test_abandoned_case_refunds_in_full(direct_vm, direct_deploy, direct_alice,
                                        direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    lock(c, direct_vm, case_id)

    from genlayer.py.types import u256
    c.cases[case_id].evidence_deadline = u256(1)

    direct_vm.sender = direct_bob
    c.abandon_expired_case(case_id)
    assert c.get_bond_state(case_id)["state"] == "REFUNDABLE"


# ---------------------------------------------------------------------------
# Payout safety
# ---------------------------------------------------------------------------


def test_payout_settles_once(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    assert c.execute_payout(case_id) == "SETTLED"
    bond = c.get_bond_state(case_id)
    assert bond["state"] == "SETTLED"
    assert bond["settled_at"] > 0
    assert bond["payout_owed"] is False


def test_double_payout_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)
    c.execute_payout(case_id)

    with pytest.raises(Exception, match=r"BOND_NOT_PAYABLE"):
        c.execute_payout(case_id)


def test_payout_blocked_before_disposition(direct_vm, direct_deploy,
                                           direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = bonded_case(c, direct_vm)
    with pytest.raises(Exception, match=r"BOND_NOT_PAYABLE"):
        c.execute_payout(case_id)


def test_payout_without_a_bond_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id = open_case(c)
    with pytest.raises(Exception, match=r"BOND_NOT_FOUND"):
        c.execute_payout(case_id)


def test_payout_is_permissionless_but_recipient_is_frozen(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Anyone may trigger the payout; nobody can redirect it."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    direct_vm.sender = direct_bob
    c.execute_payout(case_id)

    bond = c.get_bond_state(case_id)
    # Paid to the proposer recorded at case open, not to whoever called.
    assert bond["refund_recipient"].lower() == ("0x" + direct_alice.hex()).lower()
    assert bond["refund_recipient"].lower() != ("0x" + direct_bob.hex()).lower()


def test_execute_payout_takes_no_recipient_argument(direct_vm, direct_deploy,
                                                    direct_alice):
    """Recipient substitution must be impossible by construction."""
    import inspect

    c = deploy(direct_vm, direct_deploy, direct_alice)
    params = list(inspect.signature(c.execute_payout).parameters)
    assert params == ["case_id"], params


def test_payout_allowed_while_paused(direct_vm, direct_deploy, direct_alice):
    """Pause must never trap user funds."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = adjudicated(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    c.set_paused(True)
    assert c.execute_payout(case_id) == "SETTLED"


def test_one_case_cannot_spend_another_case_bond(direct_vm, direct_deploy,
                                                 direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_a, case_a, eid_a = adjudicated(c, direct_vm, title="Rule Alpha")
    rule_b, case_b, eid_b = adjudicated(c, direct_vm, title="Rule Beta")

    bond_a = c.get_bond_state(case_a)
    bond_b = c.get_bond_state(case_b)
    assert bond_a["bond_id"] != bond_b["bond_id"]
    assert bond_a["case_id"] == case_a
    assert bond_b["case_id"] == case_b

    expire_window(c, case_a)
    c.finalize_case(case_a)
    c.execute_payout(case_a)

    # Case B's bond is untouched by case A's payout.
    assert c.get_bond_state(case_b)["state"] == "LOCKED"
    with pytest.raises(Exception, match=r"BOND_NOT_PAYABLE"):
        c.execute_payout(case_b)


# ---------------------------------------------------------------------------
# The adjudicator must never see the economics
# ---------------------------------------------------------------------------


def test_bond_amount_does_not_change_the_adjudication_input(
    direct_vm, direct_deploy, direct_alice
):
    """Changing the configured bond must not alter one byte of the prompt."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = bonded_case(c, direct_vm)

    from genlayer.py.types import u256
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)

    case = c.cases[case_id]
    before = c._build_prompt(case, [eid])

    c.case_bond = u256(999 * 10 ** 18)
    c.claim_slash_bps = u256(10000)
    c.drift_slash_bps = u256(9999)
    after = c._build_prompt(case, [eid])

    assert before == after


def test_prompt_contains_no_economic_or_identity_text(direct_vm, direct_deploy,
                                                      direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = bonded_case(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)

    prompt = c._build_prompt(c.cases[case_id], [eid]).lower()
    assert str(BOND) not in prompt
    assert "bond" not in prompt
    assert "slash" not in prompt
    assert "0x" not in prompt          # no address of any kind
    assert direct_alice.hex().lower() not in prompt


def test_economic_config_view(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    cfg = c.get_economic_config()
    assert cfg["case_bond"] == str(BOND)
    assert cfg["bond_is_fixed_by_config"] is True
    assert cfg["caller_selected_amounts"] is False
    assert cfg["challenger_bonds"] is False
    assert cfg["bond_visible_to_adjudication"] is False
    assert cfg["claim_slash_bps"] == 5000
    assert cfg["drift_slash_bps"] == 2500
    assert cfg["bond_states"] == [
        "NONE", "LOCKED", "REFUNDABLE", "SLASHABLE", "SETTLED"
    ]
    assert "PAYOUT_FAILED" not in cfg["bond_states"]
    assert cfg["bond_roles"] == ["PROPOSER"]


def test_only_one_payable_method_exists(direct_vm, direct_deploy, direct_alice):
    """lock_bond is the single entry point through which value can arrive."""
    import pathlib

    source = pathlib.Path(CONTRACT).read_text(encoding="utf-8")
    assert source.count("@gl.public.write.payable") == 1
    assert source.count("gl.message.value") == 1
