"""Stage 6 direct-mode tests: challenges, finalization and rule versions.

Web and model are mocked, so these run offline and deterministically.
No GEN economics.
"""

import json

import pytest

CONTRACT = "contracts/defi_rulebook.py"

URL_A = "https://docs.example.com/faq/withdrawals"
ANCHORS = ["emergency pause", "72 hours"]
NOTE = "States the maximum emergency pause duration."

PAGE = (
    "Example Docs. The guardian may trigger an emergency pause of the "
    "withdrawal queue. An emergency pause may last no longer than 72 hours."
)

CLAIM_DIMS = [
    "SOURCE_AUTHORITY", "SOURCE_INDEPENDENCE", "GOVERNANCE_LEGITIMACY",
    "TEMPORAL_VALIDITY", "CLAIM_SUPPORT", "CONTRADICTORY_EVIDENCE",
]
CLAIM_TEXT = "Emergency withdrawals may be paused for at most 72 hours."


def deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    return direct_deploy(CONTRACT)


def verdict_json(decision="ESTABLISHED", dims=None, results=None,
                 evidence_used=None, summary="Supported."):
    names = dims if dims is not None else CLAIM_DIMS
    results = results or {}
    return json.dumps({
        "decision": decision,
        "dimensions": [
            {"name": n, "result": results.get(n, "SATISFIED"),
             "reason": f"reason for {n}"} for n in names
        ],
        "evidence_used": evidence_used if evidence_used is not None else [],
        "contradictions": [],
        "summary": summary,
    })


def proposed_case(c, direct_vm, decision="ESTABLISHED", results=None,
                  title="Emergency Withdrawals", text=CLAIM_TEXT):
    """Run a case all the way to VERDICT_PROPOSED."""
    if "example-v3" not in [p["protocol_id"] for p in c.list_protocols(0, 50)]:
        c.register_protocol("example-v3", "Example V3", "", "")
    rule_id = c.propose_rule("example-v3", "EMERGENCY_CONTROLS", title)
    case_id = c.open_rule_claim(rule_id, text, "ethereum mainnet", "")
    eid = c.submit_evidence(case_id, URL_A, "RENDER_TEXT", ANCHORS,
                            "OFFICIAL_DOCUMENTATION", NOTE, 0, False)
    c.freeze_evidence(case_id)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": PAGE})
    c.snapshot_evidence(eid)
    direct_vm.mock_llm(r".*", verdict_json(decision=decision, results=results,
                                           evidence_used=[eid]))
    c.request_adjudication(case_id)
    return rule_id, case_id, eid


def set_verdict(direct_vm, payload):
    """Replace the LLM mock. Mocks match first-registered-first, so a stale
    `.*` mock from an earlier step would otherwise answer re-adjudication."""
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*", payload)


def expire_window(c, case_id):
    """Push the challenge deadline into the past."""
    from genlayer.py.types import u256

    c.cases[case_id].challenge_deadline = u256(1)


# ---------------------------------------------------------------------------
# Challenge window
# ---------------------------------------------------------------------------


def test_challenge_window_opens_with_the_verdict(direct_vm, direct_deploy,
                                                 direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    window = c.get_challenge_window(case_id)
    assert window["status"] == "VERDICT_PROPOSED"
    assert window["in_challenge_window"] is True
    assert window["open_to_new_challenges"] is True
    assert window["finalizable"] is False
    assert window["challenge_count"] == 0
    assert window["max_challenges"] == 3

    case = c.get_case(case_id)
    assert window["challenge_deadline"] == case["verdict_at"] + 72 * 3600


def test_challenge_rejected_after_deadline(direct_vm, direct_deploy,
                                           direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"CHALLENGE_CLOSED"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "The cited page never states a maximum duration.", [])


# ---------------------------------------------------------------------------
# Opening challenges
# ---------------------------------------------------------------------------


def test_valid_challenge_accepted(direct_vm, direct_deploy, direct_alice,
                                  direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "TEMPORAL_VALIDITY_ERROR",
                          "The page predates the 2026 governance change.", [eid])

    record = c.get_challenge(ch)
    assert record["ground"] == "TEMPORAL_VALIDITY_ERROR"
    assert record["status"] == "OPEN"
    assert record["challenger"].lower() == ("0x" + direct_bob.hex()).lower()
    assert record["cited_evidence_ids"] == [eid]
    assert record["argument_is_participant_assertion"] is True
    assert c.get_case(case_id)["status"] == "CHALLENGED"
    assert c.get_challenge_window(case_id)["open_challenge_id"] == ch


def test_reporter_cannot_challenge_own_case(direct_vm, direct_deploy,
                                            direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    with pytest.raises(Exception, match=r"SELF_CHALLENGE"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "Actually I would like a second opinion please.", [])


def test_invalid_ground_rejected(direct_vm, direct_deploy, direct_alice,
                                 direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    for bad in ["I_DISAGREE", "SOURCE_AUTHORITY", "VIBES", ""]:
        with pytest.raises(Exception, match=r"INVALID_INPUT"):
            c.open_challenge(case_id, bad, "A sufficiently long explanation.", [])


def test_argument_bounds_enforced(direct_vm, direct_deploy, direct_alice,
                                  direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR", "too short", [])
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR", "x" * 601, [])


def test_cited_evidence_must_belong_to_the_case(direct_vm, direct_deploy,
                                                direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "Citing evidence that is not in this case.", ["e_999"])
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "Citing the same evidence twice over.", [eid, eid])


def test_one_open_challenge_at_a_time(direct_vm, direct_deploy, direct_alice,
                                      direct_bob, direct_charlie):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                     "The page never states a maximum duration.", [])

    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match=r"CHALLENGE_OPEN"):
        c.open_challenge(case_id, "TEMPORAL_VALIDITY_ERROR",
                         "A second simultaneous challenge attempt.", [])


def test_duplicate_ground_against_same_verdict_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                          "The page never states a maximum duration.", [])
    set_verdict(direct_vm, verdict_json(evidence_used=[eid]))
    c.resolve_challenge(ch)   # rejected: same decision, verdict unchanged

    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match=r"DUPLICATE_CHALLENGE"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "Raising the very same ground a second time.", [])

    # A different ground against the new verdict is still allowed.
    ok = c.open_challenge(case_id, "TEMPORAL_VALIDITY_ERROR",
                          "A distinct defect, raised for the first time.", [])
    assert c.get_challenge(ok)["status"] == "OPEN"


def test_challenge_cap(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    grounds = ["CLAIM_SUPPORT_ERROR", "TEMPORAL_VALIDITY_ERROR",
               "SOURCE_AUTHORITY_ERROR", "SOURCE_INDEPENDENCE_ERROR"]

    direct_vm.sender = direct_bob
    for ground in grounds[:3]:
        ch = c.open_challenge(case_id, ground, "A detailed alleged defect here.", [])
        set_verdict(direct_vm, verdict_json(evidence_used=[eid]))
        c.resolve_challenge(ch)

    with pytest.raises(Exception, match=r"CHALLENGE_CAP"):
        c.open_challenge(case_id, grounds[3], "One challenge beyond the cap.", [])


def test_pause_blocks_new_challenges(direct_vm, direct_deploy, direct_alice,
                                     direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    c.set_paused(True)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"PAUSED"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "A perfectly reasonable alleged defect.", [])


# ---------------------------------------------------------------------------
# Resolving challenges
# ---------------------------------------------------------------------------


def test_rejected_challenge_appends_a_verdict(direct_vm, direct_deploy,
                                              direct_alice, direct_bob):
    """The original decision survives; history grows, nothing is overwritten."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    first = c.list_case_verdicts(case_id, 0, 10)[0]

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                          "The page never states a maximum duration.", [eid])
    direct_vm.mock_llm(r".*", verdict_json(evidence_used=[eid]))
    assert c.resolve_challenge(ch) == "REJECTED"

    verdicts = c.list_case_verdicts(case_id, 0, 10)
    assert len(verdicts) == 2
    assert verdicts[0] == first                      # untouched
    assert verdicts[1]["replaces_verdict_id"] == first["verdict_id"]
    assert verdicts[1]["decision"] == "ESTABLISHED"
    assert c.get_case(case_id)["status"] == "RE_ADJUDICATED"
    assert c.get_challenge(ch)["resulting_verdict_id"] == verdicts[1]["verdict_id"]


def test_upheld_challenge_changes_the_standing_decision(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                          "The page never states a maximum pause duration.", [eid])
    set_verdict(direct_vm, verdict_json(
        decision="NOT_ESTABLISHED",
        results={"CLAIM_SUPPORT": "NOT_SATISFIED"}, evidence_used=[eid],
    ))
    assert c.resolve_challenge(ch) == "UPHELD"

    verdicts = c.list_case_verdicts(case_id, 0, 10)
    assert verdicts[0]["decision"] == "ESTABLISHED"       # preserved
    assert verdicts[1]["decision"] == "NOT_ESTABLISHED"   # standing
    assert c.get_challenge(ch)["status"] == "UPHELD"


def test_resolved_challenge_cannot_be_resolved_twice(direct_vm, direct_deploy,
                                                     direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                          "The page never states a maximum duration.", [])
    set_verdict(direct_vm, verdict_json(evidence_used=[eid]))
    c.resolve_challenge(ch)

    with pytest.raises(Exception, match=r"CHALLENGE_CLOSED"):
        c.resolve_challenge(ch)


def test_malformed_re_adjudication_rolls_back(direct_vm, direct_deploy,
                                              direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    ch = c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                          "The page never states a maximum duration.", [])
    before = c.list_case_verdicts(case_id, 0, 10)

    set_verdict(direct_vm, "not valid json at all")
    with pytest.raises(Exception, match=r"MALFORMED_VERDICT"):
        c.resolve_challenge(ch)

    assert c.list_case_verdicts(case_id, 0, 10) == before
    assert c.get_challenge(ch)["status"] == "OPEN"
    assert c.get_case(case_id)["status"] == "CHALLENGED"


def test_unknown_challenge_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match=r"CHALLENGE_NOT_FOUND"):
        c.resolve_challenge("ch_404")


# ---------------------------------------------------------------------------
# Finalization
# ---------------------------------------------------------------------------


def test_finalization_blocked_during_window(direct_vm, direct_deploy,
                                            direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    with pytest.raises(Exception, match=r"WINDOW_NOT_EXPIRED"):
        c.finalize_case(case_id)


def test_open_challenge_blocks_finalization(direct_vm, direct_deploy,
                                            direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                     "The page never states a maximum duration.", [])
    expire_window(c, case_id)

    with pytest.raises(Exception, match=r"CHALLENGE_OPEN"):
        c.finalize_case(case_id)


def test_finalization_is_permissionless_after_expiry(direct_vm, direct_deploy,
                                                     direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)

    direct_vm.sender = direct_bob
    assert c.finalize_case(case_id) == "FINALIZED"


def test_cannot_finalize_twice(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    with pytest.raises(Exception, match=r"CASE_NOT_OPEN"):
        c.finalize_case(case_id)


def test_not_established_finalizes_as_rejected(direct_vm, direct_deploy,
                                               direct_alice):
    """A rejected claim is a permanent record that mints no rule."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(
        c, direct_vm, decision="NOT_ESTABLISHED",
        results={"CLAIM_SUPPORT": "NOT_SATISFIED"},
    )
    expire_window(c, case_id)

    assert c.finalize_case(case_id) == "REJECTED"
    assert c.get_case(case_id)["status"] == "REJECTED"

    rule = c.get_rule(rule_id)
    assert rule["current_version"] == 0
    assert rule["active_case_id"] == ""       # lock released
    assert rule["status"] == "UNVERIFIED"


def test_stale_binding_blocks_finalization(direct_vm, direct_deploy,
                                           direct_alice):
    """A case must never mint a version against state it never examined."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)

    from genlayer.py.types import u256

    rule = c.rules[rule_id]
    rule.current_version = u256(1)
    rule.current_fingerprint = "fp_from_elsewhere"

    with pytest.raises(Exception, match=r"STALE_CASE"):
        c.finalize_case(case_id)


def test_changed_snapshot_blocks_finalization(direct_vm, direct_deploy,
                                              direct_alice):
    """The verdict must be finalized on the evidence it was reached on."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)

    c.evidence[eid].snapshot_fingerprint = "tampered"

    with pytest.raises(Exception, match=r"STALE_CASE"):
        c.finalize_case(case_id)


# ---------------------------------------------------------------------------
# Canonical rule versions
# ---------------------------------------------------------------------------


def test_first_canonical_version_created(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    verdict_id = c.list_case_verdicts(case_id, 0, 10)[0]["verdict_id"]
    expire_window(c, case_id)
    c.finalize_case(case_id)

    rule = c.get_rule(rule_id)
    assert rule["current_version"] == 1
    assert rule["has_canonical_version"] is True
    assert rule["version_count"] == 1
    assert rule["status"] == "ACTIVE"
    assert rule["active_case_id"] == ""

    version = c.get_current_rule_version(rule_id)
    assert version["version"] == 1
    assert version["text"] == CLAIM_TEXT
    assert version["scope"] == "ethereum mainnet"
    assert version["predecessor"] == 0
    assert version["status"] == "CURRENT"
    assert version["originating_case_id"] == case_id
    assert version["originating_verdict_id"] == verdict_id
    assert len(version["fingerprint"]) == 64
    assert version["fingerprint"] == rule["current_fingerprint"]
    assert version["evidence_digest"] == \
        c.get_case_snapshot_digest(case_id)["snapshot_set_digest"]


def test_unverified_rule_reports_no_canonical_text(direct_vm, direct_deploy,
                                                   direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    c.register_protocol("example-v3", "Example V3", "", "")
    rule_id = c.propose_rule("example-v3", "FEES", "Withdrawal Fee")

    current = c.get_current_rule_version(rule_id)
    assert current["has_canonical_version"] is False
    assert current["version"] == 0
    assert "text" not in current


def test_drift_creates_version_two_and_supersedes_version_one(
    direct_vm, direct_deploy, direct_alice
):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    v1 = c.get_rule_version(rule_id, 1)
    fingerprint_v1 = c.get_rule(rule_id)["current_fingerprint"]

    drift_text = "Emergency withdrawals may be paused for at most 7 days."
    drift_case = c.open_rule_drift(rule_id, 1, fingerprint_v1, drift_text, "", "")
    eid2 = c.submit_evidence(drift_case, "https://gov.example.org/d/9", "GET",
                             ["emergency pause"], "FINALIZED_GOVERNANCE_DECISION",
                             NOTE, 1740000000, True)
    c.freeze_evidence(drift_case)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200,
                               "body": "Executed. An emergency pause may last 7 days."})
    c.snapshot_evidence(eid2)
    direct_vm.mock_llm(r".*", verdict_json(
        dims=CLAIM_DIMS + ["EXISTING_RULE_CONSISTENCY"], evidence_used=[eid2]))
    c.request_adjudication(drift_case)
    expire_window(c, drift_case)
    c.finalize_case(drift_case)

    rule = c.get_rule(rule_id)
    assert rule["current_version"] == 2
    assert rule["version_count"] == 2

    v2 = c.get_rule_version(rule_id, 2)
    assert v2["text"] == drift_text
    assert v2["predecessor"] == 1
    assert v2["status"] == "CURRENT"
    assert v2["originating_case_id"] == drift_case

    # Version 1 keeps its text and lineage; only its status flag moved.
    v1_after = c.get_rule_version(rule_id, 1)
    assert v1_after["text"] == v1["text"]
    assert v1_after["fingerprint"] == v1["fingerprint"]
    assert v1_after["originating_case_id"] == v1["originating_case_id"]
    assert v1_after["evidence_digest"] == v1["evidence_digest"]
    assert v1_after["status"] == "SUPERSEDED"

    lineage = c.list_rule_versions(rule_id, 0, 10)
    assert [v["version"] for v in lineage] == [1, 2]
    assert [v["status"] for v in lineage] == ["SUPERSEDED", "CURRENT"]


def test_version_fingerprint_is_input_sensitive(direct_vm, direct_deploy,
                                                direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    prints = []
    for i, text in enumerate([
        "Emergency withdrawals may be paused for at most 72 hours.",
        "Emergency withdrawals may be paused for at most 24 hours.",
    ]):
        rule_id, case_id, eid = proposed_case(
            c, direct_vm, title=f"Rule Number {i}", text=text)
        expire_window(c, case_id)
        c.finalize_case(case_id)
        prints.append(c.get_rule_version(rule_id, 1)["fingerprint"])
    assert prints[0] != prints[1]
    assert all(len(p) == 64 for p in prints)


# ---------------------------------------------------------------------------
# Immutability and isolation
# ---------------------------------------------------------------------------


def test_no_method_can_rewrite_or_delete_history(direct_vm, direct_deploy,
                                                 direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    for name in ["edit_rule_version", "delete_rule_version", "update_verdict",
                 "delete_verdict", "delete_challenge", "edit_challenge",
                 "set_rule_text", "override_verdict", "admin_finalize",
                 "force_finalize", "cancel_challenge"]:
        assert not hasattr(c, name), f"history-rewriting method exposed: {name}"


def test_finalized_case_cannot_be_challenged(direct_vm, direct_deploy,
                                             direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)
    expire_window(c, case_id)
    c.finalize_case(case_id)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"CHALLENGE_CLOSED"):
        c.open_challenge(case_id, "CLAIM_SUPPORT_ERROR",
                         "Trying to challenge an already finalized case.", [])


def test_finalizing_one_case_does_not_touch_another_rule(
    direct_vm, direct_deploy, direct_alice
):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_a, case_a, eid_a = proposed_case(c, direct_vm, title="Rule Alpha")
    rule_b, case_b, eid_b = proposed_case(c, direct_vm, title="Rule Beta")

    expire_window(c, case_a)
    c.finalize_case(case_a)

    assert c.get_rule(rule_a)["current_version"] == 1
    assert c.get_rule(rule_b)["current_version"] == 0
    assert c.get_rule(rule_b)["active_case_id"] == case_b
    assert c.get_case(case_b)["status"] == "VERDICT_PROPOSED"


def test_challenge_and_version_views_are_paginated(direct_vm, direct_deploy,
                                                   direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    rule_id, case_id, eid = proposed_case(c, direct_vm)

    direct_vm.sender = direct_bob
    for ground in ["CLAIM_SUPPORT_ERROR", "TEMPORAL_VALIDITY_ERROR"]:
        ch = c.open_challenge(case_id, ground, "A detailed alleged defect here.", [])
        set_verdict(direct_vm, verdict_json(evidence_used=[eid]))
        c.resolve_challenge(ch)

    assert len(c.list_case_challenges(case_id, 0, 1)) == 1
    assert len(c.list_case_challenges(case_id, 0, 100000)) == 2
    assert c.list_case_challenges(case_id, 9, 10) == []

    direct_vm.sender = direct_alice
    expire_window(c, case_id)
    c.finalize_case(case_id)
    assert len(c.list_rule_versions(rule_id, 0, 100000)) == 1
    assert c.list_rule_versions(rule_id, 5, 10) == []


def test_unknown_version_lookup_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    c.register_protocol("example-v3", "Example V3", "", "")
    rule_id = c.propose_rule("example-v3", "FEES", "Withdrawal Fee")
    with pytest.raises(Exception, match=r"RULE_NOT_FOUND"):
        c.get_rule_version(rule_id, 7)


def test_vocabularies_expose_stage_six(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    vocab = c.get_vocabularies()
    assert vocab["challenge_grounds"] == [
        "SOURCE_AUTHORITY_ERROR", "SOURCE_INDEPENDENCE_ERROR",
        "TEMPORAL_VALIDITY_ERROR", "GOVERNANCE_LEGITIMACY_ERROR",
        "CLAIM_SUPPORT_ERROR", "CONTRADICTORY_EVIDENCE_ERROR",
        "EXISTING_RULE_CONSISTENCY_ERROR", "MALFORMED_VERDICT_ERROR",
    ]
    assert "RE_ADJUDICATED" in vocab["case_statuses"]
    assert "REJECTED" in vocab["case_statuses"]
    assert c.get_config()["version_fingerprint_scheme"] == "DRB-VERSION-FP-v1"
    assert c.get_caps()["max_challenges_per_case"] == 3
