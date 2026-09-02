"""Stage 3 direct-mode tests: deterministic lifecycle through evidence freeze.

No web retrieval, no adjudication, no canonical versions minted by public ABI.
"""

import pytest

from _helpers import freeze_with_bond, lock_bond

CONTRACT = "contracts/defi_rulebook.py"

URL_A = "https://docs.example.com/faq/withdrawals"
URL_B = "https://gov.example.org/proposals/42"
URL_C = "https://spec.example.net/v3/pausing"

ANCHORS = ["emergency pause", "72 hours"]
NOTE = "States the maximum emergency pause duration."


def deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    return direct_deploy(CONTRACT)


def a_protocol(c, pid="example-v3"):
    c.register_protocol(pid, "Example V3", "https://example.com", "")
    return pid


def a_rule(c, pid="example-v3", title="Emergency Withdrawals"):
    return c.propose_rule(pid, "EMERGENCY_CONTROLS", title)


def a_claim(c, rule_id):
    return c.open_rule_claim(
        rule_id,
        "Emergency withdrawals may be paused for at most 72 hours.",
        "ethereum mainnet",
        "",
    )


def add_evidence(c, case_id, url=URL_A, mode="RENDER_TEXT",
                 kind="OFFICIAL_DOCUMENTATION", anchors=None):
    # `is None`, not `or`: an empty anchor list is a case under test, not a
    # request for the default.
    use = ANCHORS if anchors is None else anchors
    return c.submit_evidence(case_id, url, mode, use, kind, NOTE, 0, False)


def seed_canonical_version(c, rule_id, version=3, fingerprint="fp_v3"):
    """Seed canonical state directly in storage.

    Stage 3 exposes no way to mint a canonical version - that is the point -
    so drift tests reach past the ABI into storage rather than the contract
    growing an unsafe public setup method.
    """
    from genlayer.py.types import u256

    rule = c.rules[rule_id]
    rule.current_version = u256(version)
    rule.current_fingerprint = fingerprint
    rule.version_count = u256(version)
    rule.status = "ACTIVE"


# ---------------------------------------------------------------------------
# Protocol registration
# ---------------------------------------------------------------------------


def test_register_protocol(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    assert c.register_protocol("aave-v3", "Aave V3", "https://aave.com", "") == "aave-v3"

    p = c.get_protocol("aave-v3")
    assert p["display_name"] == "Aave V3"
    assert p["registrant"].lower() == ("0x" + direct_alice.hex()).lower()
    assert p["rule_count"] == 0
    assert c.get_counts()["protocols"] == 1


def test_registration_is_community_maintained_only(direct_vm, direct_deploy, direct_alice):
    """The record must never assert verified or official identity."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    p = c.get_protocol("example-v3")
    assert p["community_maintained"] is True
    assert p["officially_verified"] is False
    assert "official_owner" not in p
    # No field may assert ownership or verification of the real protocol.
    for key in p:
        assert key in ("officially_verified",) or "verified" not in key
        assert "owner" not in key


def test_duplicate_protocol_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    with pytest.raises(Exception, match=r"PROTOCOL_EXISTS"):
        c.register_protocol("example-v3", "Impostor", "", "")


def test_protocol_id_is_case_normalized(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    assert c.register_protocol("  Aave-V3  ", "Aave", "", "") == "aave-v3"
    with pytest.raises(Exception, match=r"PROTOCOL_EXISTS"):
        c.register_protocol("AAVE-V3", "Aave again", "", "")


@pytest.mark.parametrize(
    "bad",
    ["", " ", "   ", "a", "has space", "UPPER!", "emoji-x–y", "--", "dots.here"],
)
def test_invalid_protocol_ids_rejected(direct_vm, direct_deploy, direct_alice, bad):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception):
        c.register_protocol(bad, "Name", "", "")


def test_protocol_id_length_cap(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.register_protocol("a" * 65, "Name", "", "")


def test_registrant_cannot_censor_other_users(direct_vm, direct_deploy,
                                              direct_alice, direct_bob):
    """A namespace registrant has no gatekeeping power over the Rulebook."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)

    direct_vm.sender = direct_bob
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    add_evidence(c, case_id)
    assert c.get_rule(rule_id)["creator"].lower() == ("0x" + direct_bob.hex()).lower()


def test_pause_blocks_registration(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    c.set_paused(True)
    with pytest.raises(Exception, match=r"PAUSED"):
        c.register_protocol("late-comer", "Late", "", "")


# ---------------------------------------------------------------------------
# Rule shells
# ---------------------------------------------------------------------------


def test_rule_shell_has_no_canonical_content(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)

    r = c.get_rule(rule_id)
    assert r["current_version"] == 0
    assert r["current_fingerprint"] == ""
    assert r["has_canonical_version"] is False
    assert r["status"] == "UNVERIFIED"
    assert r["version_count"] == 0
    # A shell is a topic, not a commitment: it carries no rule text at all.
    assert "text" not in r
    assert c.get_protocol("example-v3")["rule_count"] == 1


def test_rule_requires_existing_protocol(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match=r"PROTOCOL_NOT_FOUND"):
        c.propose_rule("nope", "FEES", "Some Rule")


def test_rule_category_must_be_in_vocabulary(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    for bad in ["OTHER", "CUSTOM", "fees", "GOVERNANCE"]:
        with pytest.raises(Exception, match=r"INVALID_INPUT"):
            c.propose_rule("example-v3", bad, "Some Rule")


def test_duplicate_rule_rejected(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    a_rule(c)
    with pytest.raises(Exception, match=r"DUPLICATE_RULE"):
        c.propose_rule("example-v3", "EMERGENCY_CONTROLS", "  emergency   WITHDRAWALS ")


def test_same_title_different_category_is_allowed(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    a_rule(c)
    assert c.propose_rule("example-v3", "FEES", "Emergency Withdrawals") == "r_2"


def test_rule_title_bounds(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.propose_rule("example-v3", "FEES", "ab")
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.propose_rule("example-v3", "FEES", "x" * 121)


def test_pause_blocks_rule_creation(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    c.set_paused(True)
    with pytest.raises(Exception, match=r"PAUSED"):
        a_rule(c)


# ---------------------------------------------------------------------------
# RULE_CLAIM
# ---------------------------------------------------------------------------


def test_open_rule_claim(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)

    case = c.get_case(case_id)
    assert case["case_type"] == "RULE_CLAIM"
    assert case["status"] == "EVIDENCE_OPEN"
    assert case["expected_version"] == 0
    assert case["expected_fingerprint"] == ""
    assert case["case_fingerprint"] == ""
    assert case["evidence_count"] == 0
    assert case["evidence_deadline"] > case["opened_at"]
    assert c.get_rule(rule_id)["active_case_id"] == case_id


def test_claim_rejected_when_canonical_version_exists(direct_vm, direct_deploy,
                                                      direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    seed_canonical_version(c, rule_id)

    with pytest.raises(Exception, match=r"RULE_ALREADY_ESTABLISHED"):
        a_claim(c, rule_id)


def test_claim_text_bounds(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_rule_claim(rule_id, "short", "", "")
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.open_rule_claim(rule_id, "x" * 601, "", "")


def test_one_active_case_per_rule(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    a_claim(c, rule_id)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"ACTIVE_CASE_EXISTS"):
        a_claim(c, rule_id)


def test_pause_blocks_case_opening(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    c.set_paused(True)
    with pytest.raises(Exception, match=r"PAUSED"):
        a_claim(c, rule_id)


# ---------------------------------------------------------------------------
# RULE_DRIFT
# ---------------------------------------------------------------------------


def test_drift_requires_canonical_version(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    with pytest.raises(Exception, match=r"NO_CANONICAL_RULE"):
        c.open_rule_drift(rule_id, 0, "", "Withdrawal fee is now 1%.", "", "")


def test_drift_binds_exact_version_and_fingerprint(direct_vm, direct_deploy,
                                                   direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    seed_canonical_version(c, rule_id, 3, "fp_v3")

    case_id = c.open_rule_drift(rule_id, 3, "fp_v3", "Pause limit is now 7 days.", "", "")
    case = c.get_case(case_id)
    assert case["case_type"] == "RULE_DRIFT"
    assert case["expected_version"] == 3
    assert case["expected_fingerprint"] == "fp_v3"
    assert c.get_rule(rule_id)["status"] == "DISPUTED"


def test_drift_rejects_wrong_version(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    seed_canonical_version(c, rule_id, 3, "fp_v3")
    with pytest.raises(Exception, match=r"STALE_CASE"):
        c.open_rule_drift(rule_id, 2, "fp_v3", "Pause limit is now 7 days.", "", "")


def test_drift_rejects_wrong_fingerprint(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    seed_canonical_version(c, rule_id, 3, "fp_v3")
    with pytest.raises(Exception, match=r"STALE_CASE"):
        c.open_rule_drift(rule_id, 3, "fp_WRONG", "Pause limit is now 7 days.", "", "")


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------


def test_submit_evidence(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    eid = add_evidence(c, case_id)

    e = c.get_evidence(eid)
    assert e["state"] == "SUBMITTED"
    assert e["anchors"] == ANCHORS
    assert e["claimed_type_is_submitter_assertion"] is True
    # Nothing is fetched or hashed in Stage 3.
    assert e["snapshot_fingerprint"] == ""
    assert e["snapshot_at"] == 0
    assert c.get_case(case_id)["evidence_count"] == 1


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("HTTPS://Docs.Example.COM/FAQ", "https://docs.example.com/FAQ"),
        ("https://docs.example.com/faq/", "https://docs.example.com/faq"),
        ("https://docs.example.com", "https://docs.example.com/"),
        ("https://docs.example.com:443/faq", "https://docs.example.com/faq"),
        ("http://docs.example.com:80/faq", "http://docs.example.com/faq"),
        ("https://docs.example.com/faq#section-3", "https://docs.example.com/faq"),
        ("https://docs.example.com/faq?v=2", "https://docs.example.com/faq?v=2"),
    ],
)
def test_url_normalization(direct_vm, direct_deploy, direct_alice, raw, expected):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    eid = add_evidence(c, case_id, url=raw)
    assert c.get_evidence(eid)["url_key"] == expected


def test_url_normalization_preserves_meaning(direct_vm, direct_deploy, direct_alice):
    """Query order and path case are semantic and must survive untouched."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    eid = add_evidence(c, case_id, url="https://ex.example.com/Docs/Fees?b=2&a=1")
    assert c.get_evidence(eid)["url_key"] == "https://ex.example.com/Docs/Fees?b=2&a=1"


@pytest.mark.parametrize(
    "bad",
    [
        "", "   ", "ftp://example.com/x", "javascript:alert(1)",
        "file:///etc/passwd", "https://", "not a url",
        "https://user:pw@example.com/x", "https://localhost/x",
    ],
)
def test_invalid_urls_rejected(direct_vm, direct_deploy, direct_alice, bad):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception):
        add_evidence(c, case_id, url=bad)


def test_duplicate_url_rejected_within_case(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    add_evidence(c, case_id, url=URL_A)
    with pytest.raises(Exception, match=r"DUPLICATE_EVIDENCE"):
        add_evidence(c, case_id, url="HTTPS://DOCS.EXAMPLE.COM/faq/withdrawals#x")


def test_source_key_groups_same_host_family(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    eid = add_evidence(c, case_id, url="https://www.docs.example.com/faq/a")
    assert c.get_evidence(eid)["source_key"] == "docs.example.com/faq"


def test_per_source_cap(direct_vm, direct_deploy, direct_alice):
    """Three from one source family is the cap; a fourth is refused."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    for i in range(3):
        add_evidence(c, case_id, url=f"https://docs.example.com/faq/p{i}")
    with pytest.raises(Exception, match=r"SOURCE_CAP"):
        add_evidence(c, case_id, url="https://docs.example.com/faq/p9")


def test_evidence_cap(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    for i in range(8):
        add_evidence(c, case_id, url=f"https://h{i}.example.com/doc")
    with pytest.raises(Exception, match=r"EVIDENCE_CAP"):
        add_evidence(c, case_id, url="https://h9.example.com/doc")


@pytest.mark.parametrize(
    "anchors",
    [[], ["a"], ["ok", "ok"], ["OK", "ok"], ["x" * 61], ["a", "b", "c", "d"]],
)
def test_invalid_anchors_rejected(direct_vm, direct_deploy, direct_alice, anchors):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception):
        add_evidence(c, case_id, anchors=anchors)


def test_authority_vocabulary_enforced(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    for bad in ["OFFICIAL_VERIFIED", "OFFICIAL", "random"]:
        with pytest.raises(Exception, match=r"INVALID_INPUT"):
            add_evidence(c, case_id, kind=bad)


def test_retrieval_mode_vocabulary_enforced(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        add_evidence(c, case_id, mode="RENDER_HTML")


def test_unknown_publication_time_is_explicit(direct_vm, direct_deploy, direct_alice):
    """Zero must never masquerade as a real timestamp."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))

    unknown = c.get_evidence(add_evidence(c, case_id, url=URL_A))
    assert unknown["claimed_published_known"] is False
    assert unknown["claimed_published_at"] == 0

    eid = c.submit_evidence(
        case_id, URL_B, "GET", ANCHORS, "GOVERNANCE_PROPOSAL", NOTE, 1740000000, True
    )
    known = c.get_evidence(eid)
    assert known["claimed_published_known"] is True
    assert known["claimed_published_at"] == 1740000000


def test_known_publication_time_requires_a_value(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception, match=r"INVALID_INPUT"):
        c.submit_evidence(
            case_id, URL_A, "GET", ANCHORS, "OFFICIAL_DOCUMENTATION", NOTE, 0, True
        )


def test_pause_blocks_evidence_submission(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    c.set_paused(True)
    with pytest.raises(Exception, match=r"PAUSED"):
        add_evidence(c, case_id)


# ---------------------------------------------------------------------------
# Freeze
# ---------------------------------------------------------------------------


def test_freeze_requires_minimum_evidence(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception, match=r"MIN_EVIDENCE"):
        freeze_with_bond(c, direct_vm, case_id)


def test_freeze_binds_ordered_evidence_and_fingerprint(direct_vm, direct_deploy,
                                                       direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    e1 = add_evidence(c, case_id, url=URL_A)
    e2 = add_evidence(c, case_id, url=URL_B, kind="GOVERNANCE_PROPOSAL")

    fingerprint = freeze_with_bond(c, direct_vm, case_id)
    assert len(fingerprint) == 64

    frozen = c.get_case_frozen_evidence(case_id)
    assert frozen["is_frozen"] is True
    assert frozen["evidence_ids"] == [e1, e2]
    assert frozen["case_fingerprint"] == fingerprint
    assert frozen["case_fingerprint_scheme"] == "DRB-CASE-FP-v1"
    assert c.get_case(case_id)["status"] == "EVIDENCE_FROZEN"


def test_fingerprint_is_deterministic_and_input_sensitive(direct_vm, direct_deploy,
                                                          direct_alice):
    """Same inputs, same hash; any change to a bound input changes it.

    One deployment: the SDK permits only one contract per loaded module, so
    each variant is a separate rule inside the same contract.
    """
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)

    def build(title, text, url):
        rule_id = c.propose_rule("example-v3", "EMERGENCY_CONTROLS", title)
        case_id = c.open_rule_claim(rule_id, text, "", "")
        add_evidence(c, case_id, url=url)
        return freeze_with_bond(c, direct_vm, case_id)

    text_a = "Emergency pause is capped at 72 hours."
    text_b = "Emergency pause is capped at 7 days."

    base = build("Rule One", text_a, URL_A)
    same_inputs = build("Rule Two", text_a, URL_A)
    other_text = build("Rule Three", text_b, URL_A)
    other_url = build("Rule Four", text_a, URL_C)

    # Every bound input is part of the preimage - including the rule id - so
    # four differently-bound cases must yield four distinct fingerprints.
    assert len(base) == 64
    assert len({base, same_inputs, other_text, other_url}) == 4


def test_fingerprint_matches_the_documented_preimage(direct_vm, direct_deploy,
                                                     direct_alice):
    """Recompute the fingerprint independently from the documented format.

    If this ever fails, either the contract or docs/STAGE_3 has drifted.
    """
    import hashlib

    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    text = "Emergency withdrawals may be paused for at most 72 hours."
    case_id = c.open_rule_claim(rule_id, text, "ethereum mainnet", "")
    e1 = add_evidence(c, case_id, url=URL_A)
    e2 = add_evidence(c, case_id, url=URL_B, mode="GET", kind="GOVERNANCE_PROPOSAL")
    produced = freeze_with_bond(c, direct_vm, case_id)

    def field(value):
        return f"{len(value)}:{value}"

    parts = [
        field("DRB-CASE-FP-v1"),
        field("RULE_CLAIM"),
        field("example-v3"),
        field(rule_id),
        field("0"),
        field(""),
        field(text),
        field("ethereum mainnet"),
        field(""),
        field("1"),          # dimension set version
        field("2"),          # evidence count
    ]
    expected_evidence = [
        (e1, URL_A, "OFFICIAL_DOCUMENTATION", "RENDER_TEXT"),
        (e2, URL_B, "GOVERNANCE_PROPOSAL", "GET"),
    ]
    for eid, url, kind, mode in expected_evidence:
        parts.append(field(eid))
        parts.append(field(url))
        parts.append(field(kind))
        parts.append(field(mode))
        parts.append(field("\x1f".join(ANCHORS)))

    preimage = "|".join(parts)
    assert produced == hashlib.sha256(preimage.encode("utf-8")).hexdigest()


def test_cannot_submit_evidence_after_freeze(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    add_evidence(c, case_id)
    freeze_with_bond(c, direct_vm, case_id)
    with pytest.raises(Exception, match=r"CASE_NOT_OPEN"):
        add_evidence(c, case_id, url=URL_B)


def test_cannot_freeze_twice(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    add_evidence(c, case_id)
    freeze_with_bond(c, direct_vm, case_id)
    with pytest.raises(Exception, match=r"CASE_NOT_OPEN"):
        freeze_with_bond(c, direct_vm, case_id)


def test_only_reporter_may_freeze(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    add_evidence(c, case_id)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match=r"NOT_REPORTER"):
        freeze_with_bond(c, direct_vm, case_id)


def test_freeze_allowed_while_paused(direct_vm, direct_deploy, direct_alice):
    """Pause stops new exposure; it must never strand an open case."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    add_evidence(c, case_id)
    lock_bond(c, direct_vm, case_id)

    c.set_paused(True)
    c.freeze_evidence(case_id)
    assert c.get_case(case_id)["status"] == "EVIDENCE_FROZEN"


def test_case_inputs_immutable_after_freeze(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    e1 = add_evidence(c, case_id)
    freeze_with_bond(c, direct_vm, case_id)

    before = c.get_case(case_id)
    with pytest.raises(Exception):
        add_evidence(c, case_id, url=URL_B)
    after = c.get_case(case_id)

    for field in ["claimed_text", "expected_version", "expected_fingerprint",
                  "case_fingerprint", "protocol_id", "rule_id", "evidence_count"]:
        assert before[field] == after[field]
    assert c.get_case_frozen_evidence(case_id)["evidence_ids"] == [e1]


# ---------------------------------------------------------------------------
# Stale-case protection
# ---------------------------------------------------------------------------


def test_stale_claim_cannot_freeze(direct_vm, direct_deploy, direct_alice):
    """A claim frozen after someone else established v1 would mint a second v1."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    add_evidence(c, case_id)

    seed_canonical_version(c, rule_id, 1, "fp_v1")

    with pytest.raises(Exception, match=r"STALE_CASE"):
        freeze_with_bond(c, direct_vm, case_id)


def test_stale_drift_cannot_freeze(direct_vm, direct_deploy, direct_alice):
    """A case bound to v3 must never be able to act on v4."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    seed_canonical_version(c, rule_id, 3, "fp_v3")
    case_id = c.open_rule_drift(rule_id, 3, "fp_v3", "Pause limit is now 7 days.", "", "")
    add_evidence(c, case_id)

    seed_canonical_version(c, rule_id, 4, "fp_v4")

    with pytest.raises(Exception, match=r"STALE_CASE"):
        freeze_with_bond(c, direct_vm, case_id)


def test_invalidate_stale_case_releases_the_lock(direct_vm, direct_deploy,
                                                 direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    add_evidence(c, case_id)
    seed_canonical_version(c, rule_id, 1, "fp_v1")

    direct_vm.sender = direct_bob  # permissionless
    c.invalidate_stale_case(case_id)

    case = c.get_case(case_id)
    assert case["status"] == "INVALIDATED"
    assert case["invalid_reason"] == "STALE_VERSION_BINDING"
    assert c.get_rule(rule_id)["active_case_id"] == ""
    # Evidence survives: closing records an outcome, it never erases history.
    assert c.get_case(case_id)["evidence_count"] == 1


def test_cannot_invalidate_a_current_case(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception, match=r"NOT_STALE"):
        c.invalidate_stale_case(case_id)


def test_abandon_requires_expired_window(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    case_id = a_claim(c, a_rule(c))
    with pytest.raises(Exception, match=r"WINDOW_OPEN"):
        c.abandon_expired_case(case_id)


def test_abandon_expired_case_releases_the_lock(direct_vm, direct_deploy,
                                                direct_alice, direct_bob):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)

    # Imported after deploy: the SDK is only on sys.path once a contract loads.
    from genlayer.py.types import u256

    c.cases[case_id].evidence_deadline = u256(1)  # window already closed

    direct_vm.sender = direct_bob  # permissionless
    c.abandon_expired_case(case_id)

    assert c.get_case(case_id)["status"] == "ABANDONED"
    assert c.get_rule(rule_id)["active_case_id"] == ""

    direct_vm.sender = direct_alice
    assert a_claim(c, rule_id) == "c_2"  # rule is usable again


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


def test_protocol_pagination(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    for i in range(5):
        c.register_protocol(f"proto-{i}", f"Proto {i}", "", "")

    assert len(c.list_protocols(0, 2)) == 2
    assert c.list_protocols(2, 2)[0]["protocol_id"] == "proto-2"
    assert len(c.list_protocols(4, 10)) == 1
    assert c.list_protocols(99, 10) == []


def test_page_size_is_capped(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    for i in range(3):
        c.register_protocol(f"proto-{i}", f"Proto {i}", "", "")
    # An absurd limit is clamped, never honoured.
    assert len(c.list_protocols(0, 100000)) == 3
    assert len(c.list_protocols(0, 0)) == 3


def test_rule_case_and_evidence_pagination(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    add_evidence(c, case_id, url=URL_A)
    add_evidence(c, case_id, url=URL_B)

    assert len(c.list_rules("example-v3", 0, 10)) == 1
    assert len(c.list_rule_cases(rule_id, 0, 10)) == 1
    assert len(c.list_case_evidence(case_id, 0, 1)) == 1
    assert c.list_case_evidence(case_id, 1, 1)[0]["url_key"] == URL_B


def test_views_reject_unknown_ids(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match=r"PROTOCOL_NOT_FOUND"):
        c.get_protocol("nope")
    with pytest.raises(Exception, match=r"RULE_NOT_FOUND"):
        c.get_rule("r_99")
    with pytest.raises(Exception, match=r"CASE_NOT_FOUND"):
        c.get_case("c_99")
    with pytest.raises(Exception, match=r"EVIDENCE_NOT_FOUND"):
        c.get_evidence("e_99")


# ---------------------------------------------------------------------------
# Stage boundary
# ---------------------------------------------------------------------------


def test_no_canonical_version_can_be_created_via_public_abi(direct_vm, direct_deploy,
                                                            direct_alice):
    """Run the whole Stage 3 lifecycle; no canonical version may appear."""
    c = deploy(direct_vm, direct_deploy, direct_alice)
    a_protocol(c)
    rule_id = a_rule(c)
    case_id = a_claim(c, rule_id)
    add_evidence(c, case_id)
    freeze_with_bond(c, direct_vm, case_id)

    rule = c.get_rule(rule_id)
    assert rule["current_version"] == 0
    assert rule["has_canonical_version"] is False
    assert rule["version_count"] == 0
    assert c.get_counts()["verdict_seq"] == 0


def test_later_stage_methods_are_absent(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_vm, direct_deploy, direct_alice)
    for name in ["adjudicate", "readjudicate", "challenge",
                 "finalize", "settle_bond", "set_rule_version", "admin_set_rule",
                 "force_establish", "accept_claim"]:
        assert not hasattr(c, name), f"Stage 3 must not expose {name}"
