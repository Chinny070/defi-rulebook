"""RC3 regression: decision-derivation clarity in the adjudication prompt.

Reproduces the second RC2 live failure (Stage 10B, RC2 tx 0x9dd0ea65...): the
model produced correctly-polarised dimensions (all SATISFIED except
TEMPORAL_VALIDITY=UNCLEAR) but chose decision=NOT_ESTABLISHED, reasoning that
UNCLEAR temporal should block a claim. The deterministic gate permits UNCLEAR
temporal for a RULE_CLAIM, so it derived ESTABLISHED and the validator
correctly rejected the mismatch as malformed.

RC3 is prompt-only: the prompt now states the gate's exact decision-derivation
rules. The validator/gate are unchanged - these tests pin the gate's behaviour
directly (feeding the gate-matching decision and asserting acceptance) and
assert the prompt now explains every gate-significant condition.
"""

import json

import pytest

from _helpers import lock_bond

CONTRACT = "contracts/defi_rulebook.py"

URL = "https://raw.githubusercontent.com/x/y/z/fees.md"
ANCHORS = ["fee for swapping tokens", "liquidity provider fees"]
NOTE = "Official docs stating the 0.3% swap fee to liquidity providers."
PAGE = (
    "There is a 0.3% fee for swapping tokens. This fee is split by liquidity "
    "provider fees proportional to their contribution to liquidity reserves."
)
CLAIM_TEXT = "Uniswap v2 charges a 0.3% fee on each swap, paid to liquidity providers."
DRIFT_TEXT = "Uniswap v2 charges a 0.25% fee on each swap."

CLAIM_DIMS = [
    "SOURCE_AUTHORITY", "SOURCE_INDEPENDENCE", "GOVERNANCE_LEGITIMACY",
    "TEMPORAL_VALIDITY", "CLAIM_SUPPORT", "CONTRADICTORY_EVIDENCE",
]
DRIFT_DIMS = CLAIM_DIMS + ["EXISTING_RULE_CONSISTENCY"]


def deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    direct_vm.value = 0
    return direct_deploy(CONTRACT)


def verdict(decision, results, names=CLAIM_DIMS, evidence=None):
    return json.dumps({
        "decision": decision,
        "dimensions": [
            {"name": n, "result": results.get(n, "SATISFIED"), "reason": f"r {n}"}
            for n in names
        ],
        "evidence_used": evidence or [],
        "contradictions": [] if results.get("CONTRADICTORY_EVIDENCE", "SATISFIED")
        == "SATISFIED" else (evidence or []),
        "summary": "summary text",
    })


def ready_claim(c, direct_vm, kind="OFFICIAL_DOCUMENTATION", title="Swap fee"):
    if not [p for p in c.list_protocols(0, 50) if p["protocol_id"] == "drb-test"]:
        c.register_protocol("drb-test", "DRB Test", "", "")
    rule_id = c.propose_rule("drb-test", "FEES", title)
    case_id = c.open_rule_claim(rule_id, CLAIM_TEXT, "uniswap v2", "")
    lock_bond(c, direct_vm, case_id)
    eid = c.submit_evidence(case_id, URL, "GET", ANCHORS, kind, NOTE, 0, False)
    c.freeze_evidence(case_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)
    return rule_id, case_id, eid


def ready_drift(c, direct_vm):
    """Seed v1 directly, then open+prepare a drift case bound to it."""
    from genlayer.py.types import u256
    import sys

    c.register_protocol("drb-test", "DRB Test", "", "")
    rule_id = c.propose_rule("drb-test", "FEES", "Swap fee")
    mod = sys.modules["_contract_defi_rulebook"]
    key = rule_id + ":v_1"
    c.rule_versions[key] = mod.RuleVersionRecord(
        rule_id=rule_id, version=u256(1), text="Uniswap v2 charges a 0.3% fee.",
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

    case_id = c.open_rule_drift(rule_id, 1, "fp_v1", DRIFT_TEXT, "", "")
    lock_bond(c, direct_vm, case_id)
    eid = c.submit_evidence(case_id, "https://gov.example.org/d/1", "GET",
                            ["fee for swapping tokens"],
                            "FINALIZED_GOVERNANCE_DECISION", NOTE, 1740000000, True)
    c.freeze_evidence(case_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)
    return rule_id, case_id, eid


# ---------------------------------------------------------------------------
# The exact RC2 live failure (CP21-retry)
# ---------------------------------------------------------------------------


def test_rc2_live_decision_mismatch_is_still_rejected(direct_vm, direct_deploy,
                                                      direct_alice):
    """RULE_CLAIM, establishing dimensions, TEMPORAL UNCLEAR, but the model
    chose NOT_ESTABLISHED - exactly the RC2 CP21-retry output. Still malformed."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict(
        "NOT_ESTABLISHED", {"TEMPORAL_VALIDITY": "UNCLEAR"}, evidence=[eid]))

    with pytest.raises(Exception, match=r"MALFORMED_VERDICT"):
        c.request_adjudication(case_id)

    assert c.get_case(case_id)["status"] == "EVIDENCE_FROZEN"
    assert c.list_case_verdicts(case_id, 0, 10) == []
    assert c.get_bond_state(case_id)["state"] == "LOCKED"


def test_correct_decision_for_unclear_temporal_claim_is_accepted(direct_vm,
                                                                 direct_deploy,
                                                                 direct_alice):
    """The same dimensions with decision=ESTABLISHED (the gate result) commit."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict(
        "ESTABLISHED", {"TEMPORAL_VALIDITY": "UNCLEAR"}, evidence=[eid]))

    assert c.request_adjudication(case_id) == "ESTABLISHED"
    v = c.list_case_verdicts(case_id, 0, 10)[0]
    assert {d["name"]: d["result"] for d in v["dimensions"]}["TEMPORAL_VALIDITY"] \
        == "UNCLEAR"


# ---------------------------------------------------------------------------
# RULE_CLAIM decision truth table (gate-matching decision must be accepted)
# ---------------------------------------------------------------------------

CLAIM_TABLE = [
    ({}, "ESTABLISHED"),                                         # all SATISFIED
    ({"TEMPORAL_VALIDITY": "UNCLEAR"}, "ESTABLISHED"),           # temporal UNCLEAR OK
    ({"GOVERNANCE_LEGITIMACY": "UNCLEAR"}, "ESTABLISHED"),       # only NOT_SATISFIED blocks
    ({"SOURCE_INDEPENDENCE": "UNCLEAR"}, "ESTABLISHED"),
    ({"SOURCE_AUTHORITY": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"SOURCE_AUTHORITY": "UNCLEAR"}, "NOT_ESTABLISHED"),        # must be SATISFIED
    ({"CLAIM_SUPPORT": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"CONTRADICTORY_EVIDENCE": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"SOURCE_INDEPENDENCE": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"GOVERNANCE_LEGITIMACY": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"TEMPORAL_VALIDITY": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
]


@pytest.mark.parametrize("results,expected", CLAIM_TABLE)
def test_claim_decision_gate(direct_vm, direct_deploy, direct_alice,
                             results, expected):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict(expected, results, evidence=[eid]))
    assert c.request_adjudication(case_id) == expected


def test_claim_all_weak_evidence_cannot_establish(direct_vm, direct_deploy,
                                                  direct_alice):
    """Even all-SATISFIED dimensions do not establish if every source is weak."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm, kind="THIRD_PARTY_ANALYSIS")
    direct_vm.clear_mocks()

    # Gate result is NOT_ESTABLISHED (only weak evidence). Matching decision OK.
    direct_vm.mock_llm(r".*", verdict("NOT_ESTABLISHED", {}, evidence=[eid]))
    assert c.request_adjudication(case_id) == "NOT_ESTABLISHED"


def test_claim_all_weak_evidence_established_is_malformed(direct_vm, direct_deploy,
                                                         direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm, kind="GOVERNANCE_PROPOSAL")
    direct_vm.clear_mocks()
    # All dimensions SATISFIED but the gate says NOT_ESTABLISHED (weak-only),
    # so a model decision of ESTABLISHED must be rejected.
    direct_vm.mock_llm(r".*", verdict("ESTABLISHED", {}, evidence=[eid]))
    with pytest.raises(Exception, match=r"MALFORMED_VERDICT"):
        c.request_adjudication(case_id)


# ---------------------------------------------------------------------------
# RULE_DRIFT decision truth table
# ---------------------------------------------------------------------------

DRIFT_TABLE = [
    ({}, "ESTABLISHED"),                                          # all SATISFIED
    ({"TEMPORAL_VALIDITY": "UNCLEAR"}, "NOT_ESTABLISHED"),        # drift needs SATISFIED
    ({"TEMPORAL_VALIDITY": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"EXISTING_RULE_CONSISTENCY": "UNCLEAR"}, "NOT_ESTABLISHED"),
    ({"EXISTING_RULE_CONSISTENCY": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
    ({"CONTRADICTORY_EVIDENCE": "NOT_SATISFIED"}, "NOT_ESTABLISHED"),
]


@pytest.mark.parametrize("results,expected", DRIFT_TABLE)
def test_drift_decision_gate(direct_vm, direct_deploy, direct_alice,
                             results, expected):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_drift(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict(expected, results, names=DRIFT_DIMS,
                                      evidence=[eid]))
    assert c.request_adjudication(case_id) == expected


def test_drift_unclear_temporal_established_is_malformed(direct_vm, direct_deploy,
                                                        direct_alice):
    """The claim-vs-drift difference: UNCLEAR temporal + ESTABLISHED is valid
    for a claim but malformed for a drift."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_drift(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", verdict("ESTABLISHED",
                                      {"TEMPORAL_VALIDITY": "UNCLEAR"},
                                      names=DRIFT_DIMS, evidence=[eid]))
    with pytest.raises(Exception, match=r"MALFORMED_VERDICT"):
        c.request_adjudication(case_id)


# ---------------------------------------------------------------------------
# Prompt / gate consistency
# ---------------------------------------------------------------------------


def test_claim_prompt_states_decision_derivation(direct_vm, direct_deploy,
                                                 direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    prompt = c._build_prompt(c.cases[case_id], [eid])

    assert "DECISION DERIVATION" in prompt
    assert "derive the decision MECHANICALLY" in prompt
    # Every gate-significant condition must be named.
    for phrase in [
        "SOURCE_AUTHORITY is SATISFIED",
        "CLAIM_SUPPORT is SATISFIED",
        "CONTRADICTORY_EVIDENCE is SATISFIED",
        "GOVERNANCE_LEGITIMACY is not NOT_SATISFIED",
        "SOURCE_INDEPENDENCE is not NOT_SATISFIED",
        "GOVERNANCE_PROPOSAL or THIRD_PARTY_ANALYSIS",
    ]:
        assert phrase in prompt, phrase
    # Claim-specific temporal rule and the RC2 polarity fix both present.
    assert "TEMPORAL_VALIDITY may be SATISFIED or" in prompt
    assert "Do NOT lower the decision to NOT_ESTABLISHED merely because" in prompt
    assert "CONTRADICTORY_EVIDENCE: SATISFIED = NO unresolved frozen evidence" in prompt


def test_drift_prompt_states_stricter_decision_derivation(direct_vm, direct_deploy,
                                                         direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_drift(c, direct_vm)
    prompt = c._build_prompt(c.cases[case_id], [eid])

    assert "DECISION DERIVATION" in prompt
    assert "TEMPORAL_VALIDITY must be" in prompt
    assert "EXISTING_RULE_CONSISTENCY must be SATISFIED" in prompt
    assert "a claim may establish with TEMPORAL_VALIDITY UNCLEAR, but this drift" in prompt
