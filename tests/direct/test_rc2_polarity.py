"""RC2 regression: dimension-polarity clarity in the adjudication prompt.

Reproduces the exact RC1 live failure (Stage 10B, StudioNet tx
0x2cc1cdde...457e): the model returned decision=ESTABLISHED with
CONTRADICTORY_EVIDENCE=NOT_SATISFIED reasoned as "No evidence contradicts",
which the validator correctly rejected as internally inconsistent. The RC2 fix
is prompt-only: every dimension now carries an explicit polarity definition so
SATISFIED always means "supports establishing the claim".

These tests assert (a) the validator still rejects the inverted pairing
(unchanged safety), (b) the correctly-polarised verdict is accepted, and
(c) the built prompt now defines the polarity of every dimension.
"""

import json

import pytest

from _helpers import lock_bond

CONTRACT = "contracts/defi_rulebook.py"

URL_A = "https://raw.githubusercontent.com/x/y/z/fees.md"
ANCHORS = ["fee for swapping tokens", "liquidity provider fees"]
NOTE = "Official docs stating the 0.3% swap fee to liquidity providers."
PAGE = (
    "There is a 0.3% fee for swapping tokens. This fee is split by liquidity "
    "provider fees proportional to their contribution to liquidity reserves."
)
CLAIM_TEXT = "Uniswap v2 charges a 0.3% fee on each swap, paid to liquidity providers."

CLAIM_DIMS = [
    "SOURCE_AUTHORITY", "SOURCE_INDEPENDENCE", "GOVERNANCE_LEGITIMACY",
    "TEMPORAL_VALIDITY", "CLAIM_SUPPORT", "CONTRADICTORY_EVIDENCE",
]
DRIFT_DIMS = CLAIM_DIMS + ["EXISTING_RULE_CONSISTENCY"]


def deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    direct_vm.value = 0
    return direct_deploy(CONTRACT)


def ready_claim(c, direct_vm, title="Swap fee"):
    """Register -> rule -> claim -> bond -> evidence -> freeze -> snapshot."""
    if not [p for p in c.list_protocols(0, 50) if p["protocol_id"] == "drb-test"]:
        c.register_protocol("drb-test", "DRB Test", "", "")
    rule_id = c.propose_rule("drb-test", "FEES", title)
    case_id = c.open_rule_claim(rule_id, CLAIM_TEXT, "uniswap v2", "")
    lock_bond(c, direct_vm, case_id)
    eid = c.submit_evidence(case_id, URL_A, "GET", ANCHORS,
                            "OFFICIAL_DOCUMENTATION", NOTE, 0, False)
    c.freeze_evidence(case_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)
    return rule_id, case_id, eid


def dims(results, names=CLAIM_DIMS):
    return [
        {"name": n, "result": results.get(n, "SATISFIED"), "reason": f"reason {n}"}
        for n in names
    ]


# ---------------------------------------------------------------------------
# The exact RC1 live failure
# ---------------------------------------------------------------------------


def test_rc1_live_inverted_pairing_is_still_rejected(direct_vm, direct_deploy,
                                                     direct_alice):
    """The precise output that failed live on StudioNet must still roll back."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)

    # Verbatim shape of the RC1 failure: ESTABLISHED, all SATISFIED except
    # CONTRADICTORY_EVIDENCE=NOT_SATISFIED reasoned as "no contradiction".
    live_failure = {
        "decision": "ESTABLISHED",
        "dimensions": [
            {"name": "SOURCE_AUTHORITY", "result": "SATISFIED",
             "reason": "Official Uniswap documentation repository."},
            {"name": "SOURCE_INDEPENDENCE", "result": "SATISFIED",
             "reason": "The protocol's own official documentation."},
            {"name": "GOVERNANCE_LEGITIMACY", "result": "SATISFIED",
             "reason": "Describes the operational mechanics of v2 core."},
            {"name": "TEMPORAL_VALIDITY", "result": "SATISFIED",
             "reason": "Describes the current fee structure."},
            {"name": "CLAIM_SUPPORT", "result": "SATISFIED",
             "reason": "Explicitly states a 0.3% fee split to LPs."},
            {"name": "CONTRADICTORY_EVIDENCE", "result": "NOT_SATISFIED",
             "reason": "No evidence contradicts the proposed interpretation."},
        ],
        "evidence_used": [eid], "contradictions": [], "summary": "s",
    }
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps(live_failure))

    with pytest.raises(Exception, match=r"MALFORMED_VERDICT"):
        c.request_adjudication(case_id)

    # Same clean rollback the live contract showed.
    assert c.get_case(case_id)["status"] == "EVIDENCE_FROZEN"
    assert c.list_case_verdicts(case_id, 0, 10) == []
    assert c.get_counts()["verdict_seq"] == 0
    assert c.get_bond_state(case_id)["state"] == "LOCKED"


def test_correctly_polarised_verdict_is_accepted(direct_vm, direct_deploy,
                                                 direct_alice):
    """The same case, with CONTRADICTORY_EVIDENCE=SATISFIED, establishes."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)

    corrected = {
        "decision": "ESTABLISHED",
        "dimensions": dims({}),  # all SATISFIED, incl CONTRADICTORY_EVIDENCE
        "evidence_used": [eid], "contradictions": [], "summary": "s",
    }
    corrected["dimensions"][5]["reason"] = \
        "No frozen evidence materially contradicts the interpretation."
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps(corrected))

    assert c.request_adjudication(case_id) == "ESTABLISHED"
    v = c.list_case_verdicts(case_id, 0, 10)[0]
    assert v["decision"] == "ESTABLISHED"
    assert {d["name"]: d["result"] for d in v["dimensions"]}["CONTRADICTORY_EVIDENCE"] \
        == "SATISFIED"


def test_genuine_contradiction_still_blocks_establishment(direct_vm, direct_deploy,
                                                          direct_alice):
    """Polarity clarity must not let a real contradiction slip through:
    CONTRADICTORY_EVIDENCE=NOT_SATISFIED with ESTABLISHED is still malformed."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)

    # Honest NOT_ESTABLISHED when a contradiction genuinely exists is fine.
    honest = {
        "decision": "NOT_ESTABLISHED",
        "dimensions": dims({"CONTRADICTORY_EVIDENCE": "NOT_SATISFIED"}),
        "evidence_used": [eid], "contradictions": [eid], "summary": "s",
    }
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps(honest))
    assert c.request_adjudication(case_id) == "NOT_ESTABLISHED"


# ---------------------------------------------------------------------------
# Prompt now defines polarity for every dimension
# ---------------------------------------------------------------------------


def test_prompt_defines_polarity_for_every_claim_dimension(direct_vm,
                                                           direct_deploy,
                                                           direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    prompt = c._build_prompt(c.cases[case_id], [eid])

    # A global polarity rule must be present.
    assert "SATISFIED means the criterion is met in a way that SUPPORTS" in prompt
    assert "Do NOT read SATISFIED as merely meaning" in prompt

    # Every claim dimension must appear with a SATISFIED/NOT_SATISFIED definition,
    # not a bare "SATISFIED | NOT_SATISFIED | UNCLEAR" enumeration.
    assert "SATISFIED | NOT_SATISFIED | UNCLEAR" not in prompt
    for name in CLAIM_DIMS:
        assert name + ": SATISFIED =" in prompt, name


def test_prompt_makes_contradictory_evidence_polarity_explicit(direct_vm,
                                                               direct_deploy,
                                                               direct_alice):
    """The exact defect: SATISFIED must be defined as 'no contradiction'."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    prompt = c._build_prompt(c.cases[case_id], [eid])

    marker = "CONTRADICTORY_EVIDENCE: SATISFIED = NO unresolved frozen evidence"
    assert marker in prompt
    # And the worked counter-example that mirrors the live failure.
    assert "that reason describes SATISFIED, so the result must be SATISFIED" in prompt


def test_drift_prompt_defines_existing_rule_consistency_and_frames_the_question(
    direct_vm, direct_deploy, direct_alice
):
    """RULE_DRIFT prompt must define the 7th dimension and frame the drift
    question as 'is the current commitment stale', never 'should it change'."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    # Establish v1 first via the normal path so a drift case can bind to it.
    rule_id, claim_case, e1 = ready_claim(c, direct_vm)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", json.dumps({
        "decision": "ESTABLISHED", "dimensions": dims({}),
        "evidence_used": [e1], "contradictions": [], "summary": "s",
    }))
    c.request_adjudication(claim_case)
    from genlayer.py.types import u256  # importable once a contract is loaded
    c.cases[claim_case].challenge_deadline = u256(1)
    c.finalize_case(claim_case)
    fp = c.get_rule(rule_id)["current_fingerprint"]

    drift = c.open_rule_drift(rule_id, 1, fp,
                             "Uniswap v2 charges a 0.25% swap fee.", "", "")
    e2 = c.submit_evidence(drift, "https://gov.example.org/d/1", "GET",
                           ["fee for swapping tokens"],
                           "FINALIZED_GOVERNANCE_DECISION", NOTE, 1740000000, True)
    lock_bond(c, direct_vm, drift)
    c.freeze_evidence(drift)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(e2)

    prompt = c._build_prompt(c.cases[drift], [e2])
    assert "This is a RULE_DRIFT case" in prompt
    assert "current canonical commitment is stale" in prompt
    assert "EXISTING_RULE_CONSISTENCY: SATISFIED =" in prompt
    for name in DRIFT_DIMS:
        assert name + ": SATISFIED =" in prompt, name


def test_claim_prompt_frames_the_claim_question(direct_vm, direct_deploy,
                                                direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = ready_claim(c, direct_vm)
    prompt = c._build_prompt(c.cases[case_id], [eid])
    assert "This is a RULE_CLAIM case" in prompt
    assert "not whether it should exist" in prompt
    # And the anti-Treasury-Trial framing survives.
    assert "NOT deciding whether the rule is good policy" in prompt
