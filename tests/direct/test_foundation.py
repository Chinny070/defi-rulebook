"""Stage 2 direct-mode tests: scaffold invariants only.

No business logic exists yet, so nothing here tests adjudication, evidence
retrieval, versioning or payouts. These tests pin the foundation that every
later stage builds on.
"""

import pytest

CONTRACT = "contracts/defi_rulebook.py"


# ---------------------------------------------------------------------------
# Initialization and configuration
# ---------------------------------------------------------------------------


def test_init_sets_deployer_as_owner(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    cfg = c.get_config()
    assert cfg["owner"].lower() == ("0x" + direct_alice.hex()).lower()


def test_init_is_not_paused(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    assert c.get_config()["paused"] is False


def test_config_reports_identity_and_versions(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    cfg = c.get_config()
    assert cfg["contract_name"] == "DEFI_RULEBOOK"
    assert cfg["contract_version"] == "0.7.0-stage7"
    assert cfg["schema_version"] == "6"
    assert cfg["dimension_set_version"] == "1"
    assert cfg["case_fingerprint_scheme"] == "DRB-CASE-FP-v1"


def test_economic_config_matches_stage_1(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    cfg = c.get_config()
    assert cfg["case_bond"] == str(10**18)
    assert cfg["challenge_bond_bps"] == 5000
    assert cfg["claim_slash_bps"] == 5000   # RULE_CLAIM slash
    assert cfg["drift_slash_bps"] == 2500   # RULE_DRIFT slash is lighter
    assert cfg["challenge_window_seconds"] == 72 * 3600


# ---------------------------------------------------------------------------
# Caps
# ---------------------------------------------------------------------------


def test_caps_match_approved_architecture(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    caps = c.get_caps()
    assert caps["max_protocols"] == 500
    assert caps["max_rules_per_protocol"] == 100
    assert caps["max_versions_per_rule"] == 50
    assert caps["max_cases_per_rule"] == 50
    assert caps["max_evidence_per_case"] == 8
    assert caps["max_evidence_per_source_key"] == 3
    assert caps["max_challenges_per_case"] == 3
    assert caps["max_excerpt_len"] == 2000
    assert caps["max_anchor_count"] == 3
    assert caps["max_rule_text_len"] == 600
    assert caps["max_url_len"] == 400


def test_pagination_caps_are_bounded(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    caps = c.get_caps()
    assert caps["default_page_size"] == 20
    assert caps["max_page_size"] == 50
    assert caps["default_page_size"] <= caps["max_page_size"]


# ---------------------------------------------------------------------------
# Vocabularies
# ---------------------------------------------------------------------------


def test_case_types_are_exactly_claim_and_drift(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    assert c.get_vocabularies()["case_types"] == ["RULE_CLAIM", "RULE_DRIFT"]


def test_amendment_is_absent_everywhere(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    vocab = c.get_vocabularies()
    for name, values in vocab.items():
        for value in values:
            assert "AMENDMENT" not in value, f"AMENDMENT leaked into {name}"


def test_rule_categories_are_the_approved_ten(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    cats = c.get_vocabularies()["rule_categories"]
    assert cats == [
        "DEPOSITS",
        "WITHDRAWALS",
        "EMERGENCY_CONTROLS",
        "FEES",
        "YIELD_REWARDS",
        "COLLATERAL_LIQUIDATION",
        "GOVERNANCE_UPGRADES",
        "ORACLES",
        "ACCESS_ELIGIBILITY",
        "RISK_RESERVES",
    ]
    assert len(cats) == len(set(cats))
    assert "OTHER" not in cats and "CUSTOM" not in cats


def test_verdict_vocabulary(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    vocab = c.get_vocabularies()
    assert vocab["verdicts"] == ["ESTABLISHED", "NOT_ESTABLISHED", "INVALID"]
    # INVALID is contract-declared only and must never be a model output.
    assert vocab["model_verdicts"] == ["ESTABLISHED", "NOT_ESTABLISHED"]
    assert "INVALID" not in vocab["model_verdicts"]


def test_dimension_vocabulary_counts(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    vocab = c.get_vocabularies()
    claim = vocab["dimensions_claim"]
    drift = vocab["dimensions_drift"]
    assert len(claim) == 6
    assert len(drift) == 7
    assert claim == drift[:6]
    assert drift[6] == "EXISTING_RULE_CONSISTENCY"
    assert "EXISTING_RULE_CONSISTENCY" not in claim
    # Removed in Stage 1 and must not reappear.
    assert "IMPLEMENTATION_CONSISTENCY" not in drift
    assert "USER_IMPACT_CONSISTENCY" not in drift


def test_finding_vocabulary(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    assert c.get_vocabularies()["findings"] == [
        "SATISFIED",
        "NOT_SATISFIED",
        "UNCLEAR",
    ]


def test_weak_evidence_types_are_a_subset_of_evidence_types(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    vocab = c.get_vocabularies()
    assert set(vocab["weak_evidence_types"]) <= set(vocab["evidence_types"])
    assert vocab["weak_evidence_types"] == [
        "GOVERNANCE_PROPOSAL",
        "THIRD_PARTY_ANALYSIS",
    ]


def test_retrieval_modes_are_source_adaptive(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    assert c.get_vocabularies()["retrieval_modes"] == [
        "GET",
        "RENDER_TEXT",
        "RENDER_TEXT_WAIT",
    ]


def test_bond_states_exclude_payout_failed(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    states = c.get_vocabularies()["bond_states"]
    assert states == ["NONE", "LOCKED", "REFUNDABLE", "SLASHABLE", "SETTLED"]
    # emit_transfer is an asynchronous message that never reports failure, so
    # a persisted failure state would be unreachable by construction.
    assert "PAYOUT_FAILED" not in states


def test_challenge_grounds_are_bounded(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    grounds = c.get_vocabularies()["challenge_grounds"]
    # One ground per semantic dimension, plus a schema defect.
    assert len(grounds) == 8
    assert all(g.endswith("_ERROR") for g in grounds)
    assert "IMPLEMENTATION_CONTRADICTION_OMITTED" not in grounds


# ---------------------------------------------------------------------------
# Storage defaults
# ---------------------------------------------------------------------------


def test_no_protocols_or_rules_exist_at_initialization(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    counts = c.get_counts()
    assert counts["protocols"] == 0
    assert counts["protocol_seq"] == 0
    assert counts["rule_seq"] == 0
    assert counts["case_seq"] == 0
    assert counts["evidence_seq"] == 0
    assert counts["verdict_seq"] == 0
    assert counts["challenge_seq"] == 0
    assert counts["bond_seq"] == 0


def test_no_canonical_rules_exist_at_initialization(
    direct_vm, direct_deploy, direct_alice
):
    """A Rulebook starts empty. No canonical rule may exist without adjudication."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    assert c.get_counts()["rule_seq"] == 0


# ---------------------------------------------------------------------------
# Admin authority
# ---------------------------------------------------------------------------


def test_owner_can_pause_and_unpause(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)

    c.set_paused(True)
    assert c.get_config()["paused"] is True

    c.set_paused(False)
    assert c.get_config()["paused"] is False


def test_non_owner_cannot_pause(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        c.set_paused(True)

    direct_vm.sender = direct_alice
    assert c.get_config()["paused"] is False


def test_owner_has_no_rule_or_bond_authority(direct_vm, direct_deploy, direct_alice):
    """The admin surface is exactly one method: emergency pause.

    An owner must never be able to rewrite rules, erase evidence, alter
    verdicts or move bonds. The cheapest durable guarantee is that no such
    method exists at all.
    """
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)

    forbidden = [
        "set_rule_text",
        "delete_rule",
        "delete_evidence",
        "override_verdict",
        "set_verdict",
        "withdraw",
        "sweep",
        "transfer_bond",
        "seize_bond",
        "set_current_version",
    ]
    for name in forbidden:
        assert not hasattr(c, name), f"admin backdoor exposed: {name}"


def test_registrant_gains_no_official_protocol_authority(
    direct_vm, direct_deploy, direct_alice
):
    """Namespace registration must never imply protocol ownership.

    No 'official owner' concept may exist in the contract surface, and the
    deployer/owner is not represented as an authority over any protocol.
    """
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)

    for name in ["official_owner", "verify_protocol", "set_protocol_owner",
                 "claim_protocol", "endorse_protocol"]:
        assert not hasattr(c, name), f"identity overreach exposed: {name}"

    assert "official_owner" not in c.get_config()


# ---------------------------------------------------------------------------
# Stage boundary: later-stage methods must not exist yet
# ---------------------------------------------------------------------------


def test_no_placeholder_business_methods_are_exposed(
    direct_vm, direct_deploy, direct_alice
):
    """Later-stage writes are introduced with their state machines, not as no-ops."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)

    not_yet = [
        "adjudicate",
        "readjudicate",
        "challenge",
        "finalize",
        "settle_bond",
    ]
    for name in not_yet:
        assert not hasattr(c, name), f"must not be exposed before its stage: {name}"
