# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

from dataclasses import dataclass

import time

# DEFI RULEBOOK - challengeable protocol commitments.
# Stage 2: storage foundation only. No adjudication, no web access, no payouts.

CONTRACT_NAME = "DEFI_RULEBOOK"
CONTRACT_VERSION = "0.2.0-stage2"
SCHEMA_VERSION = "1"

# ---------------------------------------------------------------------------
# Hard caps (Stage 1 approved)
# ---------------------------------------------------------------------------

MAX_PROTOCOLS = 500
MAX_RULES_PER_PROTOCOL = 100
MAX_VERSIONS_PER_RULE = 50
MAX_CASES_PER_RULE = 50
MAX_EVIDENCE_PER_CASE = 8
MAX_EVIDENCE_PER_SOURCE_KEY = 3
MAX_CHALLENGES_PER_CASE = 2
MAX_VERDICTS_PER_CASE = 3

MAX_PROTOCOL_ID_LEN = 64
MAX_RULE_ID_LEN = 80
MAX_DISPLAY_NAME_LEN = 80
MAX_URL_LEN = 400
MAX_SOURCE_KEY_LEN = 120
MAX_TITLE_LEN = 120
MAX_RULE_TEXT_LEN = 600
MAX_SCOPE_LEN = 200
MAX_EXCEPTIONS_LEN = 300
MAX_EFFECTIVE_BASIS_LEN = 120
MAX_RELEVANCE_NOTE_LEN = 300
MAX_ANCHORS_LEN = 200
MAX_ANCHOR_COUNT = 3
MAX_EXCERPT_LEN = 2000
MAX_DIMENSION_REASON_LEN = 240
MAX_VERDICT_SUMMARY_LEN = 400
MAX_CHALLENGE_ARGUMENT_LEN = 600

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50

# ---------------------------------------------------------------------------
# Economic configuration (values only; no payout logic in Stage 2)
# ---------------------------------------------------------------------------

DEFAULT_CASE_BOND = 1000000000000000000
DEFAULT_CHALLENGE_BOND_BPS = 5000
DEFAULT_CLAIM_SLASH_BPS = 5000
DEFAULT_DRIFT_SLASH_BPS = 2500
DEFAULT_CHALLENGE_WINDOW_SECONDS = 259200
DEFAULT_EVIDENCE_WINDOW_SECONDS = 604800
BPS_DENOMINATOR = 10000

# ---------------------------------------------------------------------------
# Canonical vocabularies. Stored as bounded strings, never as Python Enum:
# GenLayer storage does not support Enum, and bounded strings keep the
# extracted schema stable across stages.
# ---------------------------------------------------------------------------

CASE_TYPE_RULE_CLAIM = "RULE_CLAIM"
CASE_TYPE_RULE_DRIFT = "RULE_DRIFT"
CASE_TYPES = (CASE_TYPE_RULE_CLAIM, CASE_TYPE_RULE_DRIFT)

CASE_STATUS_OPEN = "OPEN"
CASE_STATUS_EVIDENCE_OPEN = "EVIDENCE_OPEN"
CASE_STATUS_EVIDENCE_FROZEN = "EVIDENCE_FROZEN"
CASE_STATUS_VERDICT_PROPOSED = "VERDICT_PROPOSED"
CASE_STATUS_CHALLENGED = "CHALLENGED"
CASE_STATUS_FINALIZED = "FINALIZED"
CASE_STATUS_INVALIDATED = "INVALIDATED"
CASE_STATUS_ABANDONED = "ABANDONED"
CASE_STATUSES = (
    CASE_STATUS_OPEN,
    CASE_STATUS_EVIDENCE_OPEN,
    CASE_STATUS_EVIDENCE_FROZEN,
    CASE_STATUS_VERDICT_PROPOSED,
    CASE_STATUS_CHALLENGED,
    CASE_STATUS_FINALIZED,
    CASE_STATUS_INVALIDATED,
    CASE_STATUS_ABANDONED,
)

RULE_CATEGORIES = (
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
)

RULE_STATUS_UNVERIFIED = "UNVERIFIED"
RULE_STATUS_ACTIVE = "ACTIVE"
RULE_STATUS_DISPUTED = "DISPUTED"
RULE_STATUS_WITHDRAWN = "WITHDRAWN"
RULE_STATUSES = (
    RULE_STATUS_UNVERIFIED,
    RULE_STATUS_ACTIVE,
    RULE_STATUS_DISPUTED,
    RULE_STATUS_WITHDRAWN,
)

VERSION_STATUS_CURRENT = "CURRENT"
VERSION_STATUS_SUPERSEDED = "SUPERSEDED"
VERSION_STATUSES = (VERSION_STATUS_CURRENT, VERSION_STATUS_SUPERSEDED)

VERDICT_ESTABLISHED = "ESTABLISHED"
VERDICT_NOT_ESTABLISHED = "NOT_ESTABLISHED"
VERDICT_INVALID = "INVALID"
VERDICTS = (VERDICT_ESTABLISHED, VERDICT_NOT_ESTABLISHED, VERDICT_INVALID)

# INVALID is contract-declared only; the semantic model may never return it.
MODEL_VERDICTS = (VERDICT_ESTABLISHED, VERDICT_NOT_ESTABLISHED)

DIM_SOURCE_AUTHORITY = "SOURCE_AUTHORITY"
DIM_SOURCE_INDEPENDENCE = "SOURCE_INDEPENDENCE"
DIM_GOVERNANCE_LEGITIMACY = "GOVERNANCE_LEGITIMACY"
DIM_TEMPORAL_VALIDITY = "TEMPORAL_VALIDITY"
DIM_CLAIM_SUPPORT = "CLAIM_SUPPORT"
DIM_CONTRADICTORY_EVIDENCE = "CONTRADICTORY_EVIDENCE"
DIM_EXISTING_RULE_CONSISTENCY = "EXISTING_RULE_CONSISTENCY"

DIMENSIONS_CLAIM = (
    DIM_SOURCE_AUTHORITY,
    DIM_SOURCE_INDEPENDENCE,
    DIM_GOVERNANCE_LEGITIMACY,
    DIM_TEMPORAL_VALIDITY,
    DIM_CLAIM_SUPPORT,
    DIM_CONTRADICTORY_EVIDENCE,
)
DIMENSIONS_DRIFT = DIMENSIONS_CLAIM + (DIM_EXISTING_RULE_CONSISTENCY,)
DIMENSION_SET_VERSION = "1"

FINDING_SATISFIED = "SATISFIED"
FINDING_NOT_SATISFIED = "NOT_SATISFIED"
FINDING_UNCLEAR = "UNCLEAR"
FINDINGS = (FINDING_SATISFIED, FINDING_NOT_SATISFIED, FINDING_UNCLEAR)

EVIDENCE_TYPES = (
    "OFFICIAL_DOCUMENTATION",
    "FINALIZED_GOVERNANCE_DECISION",
    "GOVERNANCE_PROPOSAL",
    "PROTOCOL_SPECIFICATION",
    "OFFICIAL_ANNOUNCEMENT",
    "SECURITY_DISCLOSURE_OR_AUDIT",
    "IMPLEMENTATION_EVIDENCE",
    "THIRD_PARTY_ANALYSIS",
)

# Evidence types that cannot, on their own, establish an operative rule.
WEAK_EVIDENCE_TYPES = ("GOVERNANCE_PROPOSAL", "THIRD_PARTY_ANALYSIS")

RETRIEVAL_GET = "GET"
RETRIEVAL_RENDER_TEXT = "RENDER_TEXT"
RETRIEVAL_RENDER_TEXT_WAIT = "RENDER_TEXT_WAIT"
RETRIEVAL_MODES = (RETRIEVAL_GET, RETRIEVAL_RENDER_TEXT, RETRIEVAL_RENDER_TEXT_WAIT)

EVIDENCE_STATE_SUBMITTED = "SUBMITTED"
EVIDENCE_STATE_SNAPSHOTTED = "SNAPSHOTTED"
EVIDENCE_STATE_FAILED = "FAILED"
EVIDENCE_STATES = (
    EVIDENCE_STATE_SUBMITTED,
    EVIDENCE_STATE_SNAPSHOTTED,
    EVIDENCE_STATE_FAILED,
)

CHALLENGE_GROUNDS = (
    "AUTHORITATIVE_EVIDENCE_MISCLASSIFIED",
    "TEMPORAL_ORDERING_ERROR",
    "GOVERNANCE_STATUS_ERROR",
    "SOURCE_INDEPENDENCE_ERROR",
    "RULE_CONSISTENCY_ERROR",
    "CLAIM_OVERREACH",
    "MALFORMED_ADJUDICATION",
)

CHALLENGE_STATUS_OPEN = "OPEN"
CHALLENGE_STATUS_EVALUATING = "EVALUATING"
CHALLENGE_STATUS_UPHELD = "UPHELD"
CHALLENGE_STATUS_REJECTED = "REJECTED"
CHALLENGE_STATUSES = (
    CHALLENGE_STATUS_OPEN,
    CHALLENGE_STATUS_EVALUATING,
    CHALLENGE_STATUS_UPHELD,
    CHALLENGE_STATUS_REJECTED,
)

# No PAYOUT_FAILED state: a synchronous outbound transfer failure may revert the
# transaction, so a persisted failure status is not representable.
BOND_STATE_NONE = "NONE"
BOND_STATE_HELD = "HELD"
BOND_STATE_READY_FOR_PAYOUT = "READY_FOR_PAYOUT"
BOND_STATE_SETTLED = "SETTLED"
BOND_STATES = (
    BOND_STATE_NONE,
    BOND_STATE_HELD,
    BOND_STATE_READY_FOR_PAYOUT,
    BOND_STATE_SETTLED,
)

BOND_ROLE_REPORTER = "REPORTER"
BOND_ROLE_CHALLENGER = "CHALLENGER"
BOND_ROLES = (BOND_ROLE_REPORTER, BOND_ROLE_CHALLENGER)

BOND_DISPOSITION_PENDING = "PENDING"
BOND_DISPOSITION_REFUND = "REFUND"
BOND_DISPOSITION_SLASH = "SLASH"
BOND_DISPOSITIONS = (
    BOND_DISPOSITION_PENDING,
    BOND_DISPOSITION_REFUND,
    BOND_DISPOSITION_SLASH,
)

# Error prefixes so validators can classify failures consistently.
ERROR_EXPECTED = "[EXPECTED]"

# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------


def _now() -> u256:
    """Transaction time in Unix seconds. Deterministic across validators."""
    return u256(int(time.time()))


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise Exception(ERROR_EXPECTED + " " + message)


def _in_vocabulary(value: str, vocabulary: tuple, label: str) -> None:
    _require(value in vocabulary, "invalid " + label + ": " + value)


def _bounded(value: str, max_len: int, label: str) -> None:
    _require(len(value) > 0, label + " must not be empty")
    _require(len(value) <= max_len, label + " exceeds " + str(max_len) + " chars")


def _page_bounds(offset: u256, limit: u256, total: int) -> tuple:
    """Clamp a pagination request to a bounded window. Never enumerates all."""
    size = int(limit)
    if size <= 0:
        size = DEFAULT_PAGE_SIZE
    if size > MAX_PAGE_SIZE:
        size = MAX_PAGE_SIZE
    start = int(offset)
    if start < 0:
        start = 0
    if start > total:
        start = total
    end = start + size
    if end > total:
        end = total
    return (start, end)


def _is_ascii_id(value: str) -> bool:
    """Namespace ids are restricted to a conservative, collision-legible set."""
    if len(value) == 0:
        return False
    for ch in value:
        ok = ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch == "-" or ch == "_"
        if not ok:
            return False
    return True


# ---------------------------------------------------------------------------
# Storage records
# ---------------------------------------------------------------------------


@allow_storage
@dataclass
class ProtocolRecord:
    protocol_id: str
    display_name: str
    homepage_url: str
    docs_root_url: str
    # Namespace registrant only. This is NOT an official protocol owner and
    # carries no authority over rules, cases, verdicts or bonds.
    registrant: Address
    created_at: u256
    rule_count: u256
    open_case_count: u256


@allow_storage
@dataclass
class RuleRecord:
    rule_id: str
    protocol_id: str
    category: str
    title: str
    status: str
    # 0 means no adjudicated canonical version exists yet. A rule shell never
    # carries canonical text; only an adjudicated RuleVersionRecord does.
    current_version: u256
    current_fingerprint: str
    version_count: u256
    case_count: u256
    open_case_id: str
    created_at: u256


@allow_storage
@dataclass
class RuleVersionRecord:
    rule_id: str
    version: u256
    text: str
    scope: str
    exceptions: str
    predecessor: u256
    originating_case_id: str
    effective_basis: str
    status: str
    established_at: u256
    fingerprint: str


@allow_storage
@dataclass
class CaseRecord:
    case_id: str
    case_type: str
    protocol_id: str
    rule_id: str
    reporter: Address
    expected_version: u256
    expected_fingerprint: str
    claimed_text: str
    claimed_scope: str
    claimed_exceptions: str
    status: str
    case_fingerprint: str
    evidence_count: u256
    challenge_count: u256
    verdict_count: u256
    bond_id: str
    opened_at: u256
    frozen_at: u256
    verdict_at: u256
    finalized_at: u256


@allow_storage
@dataclass
class EvidenceRecord:
    evidence_id: str
    case_id: str
    submitter: Address
    url: str
    source_key: str
    retrieval_mode: str
    anchors: str
    claimed_type: str
    relevance_note: str
    claimed_published_at: u256
    state: str
    snapshot: str
    snapshot_fingerprint: str
    snapshot_at: u256
    submitted_at: u256


@allow_storage
@dataclass
class DimensionFinding:
    name: str
    finding: str
    reason_code: str
    reason: str
    evidence_ids: DynArray[str]


@allow_storage
@dataclass
class VerdictRecord:
    verdict_id: str
    case_id: str
    index: u256
    verdict: str
    summary: str
    dimensions: DynArray[DimensionFinding]
    decisive_evidence_ids: DynArray[str]
    case_fingerprint: str
    replaces_verdict_id: str
    created_at: u256


@allow_storage
@dataclass
class ChallengeRecord:
    challenge_id: str
    case_id: str
    challenger: Address
    ground: str
    argument: str
    cited_evidence_ids: DynArray[str]
    status: str
    target_verdict_id: str
    bond_id: str
    created_at: u256
    resolved_at: u256


@allow_storage
@dataclass
class BondRecord:
    bond_id: str
    case_id: str
    role: str
    # Payout recipients derive from frozen state only; never caller-supplied.
    depositor: Address
    amount: u256
    state: str
    disposition: str
    refund_amount: u256
    slash_amount: u256
    created_at: u256
    settled_at: u256


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


class DefiRulebook(gl.Contract):
    # Configuration
    owner: Address
    paused: bool
    contract_version: str

    # Economics (configured now, executed in a later stage)
    case_bond: u256
    challenge_bond_bps: u256
    claim_slash_bps: u256
    drift_slash_bps: u256
    challenge_window_seconds: u256
    evidence_window_seconds: u256
    sink_address: Address

    # Global id counters
    protocol_seq: u256
    rule_seq: u256
    case_seq: u256
    evidence_seq: u256
    verdict_seq: u256
    challenge_seq: u256
    bond_seq: u256

    # Primary records, keyed by global id
    protocols: TreeMap[str, ProtocolRecord]
    rules: TreeMap[str, RuleRecord]
    rule_versions: TreeMap[str, RuleVersionRecord]
    cases: TreeMap[str, CaseRecord]
    evidence: TreeMap[str, EvidenceRecord]
    verdicts: TreeMap[str, VerdictRecord]
    challenges: TreeMap[str, ChallengeRecord]
    bonds: TreeMap[str, BondRecord]

    # Ordered indexes for bounded pagination
    protocol_ids: DynArray[str]
    rules_by_protocol: TreeMap[str, DynArray[str]]
    versions_by_rule: TreeMap[str, DynArray[str]]
    cases_by_rule: TreeMap[str, DynArray[str]]
    evidence_by_case: TreeMap[str, DynArray[str]]
    verdicts_by_case: TreeMap[str, DynArray[str]]
    challenges_by_case: TreeMap[str, DynArray[str]]

    # Deterministic uniqueness guards
    protocol_id_taken: TreeMap[str, bool]
    evidence_url_seen: TreeMap[str, bool]
    source_key_count: TreeMap[str, u256]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.sink_address = gl.message.sender_address
        self.paused = False
        self.contract_version = CONTRACT_VERSION
        self.case_bond = u256(DEFAULT_CASE_BOND)
        self.challenge_bond_bps = u256(DEFAULT_CHALLENGE_BOND_BPS)
        self.claim_slash_bps = u256(DEFAULT_CLAIM_SLASH_BPS)
        self.drift_slash_bps = u256(DEFAULT_DRIFT_SLASH_BPS)
        self.challenge_window_seconds = u256(DEFAULT_CHALLENGE_WINDOW_SECONDS)
        self.evidence_window_seconds = u256(DEFAULT_EVIDENCE_WINDOW_SECONDS)

    # -- internal helpers ---------------------------------------------------

    def _only_owner(self) -> None:
        _require(gl.message.sender_address == self.owner, "caller is not the owner")

    def _not_paused(self) -> None:
        _require(not self.paused, "contract is paused")

    def _next_id(self, prefix: str, current: u256) -> str:
        return prefix + "_" + str(int(current) + 1)

    def _version_key(self, rule_id: str, version: u256) -> str:
        return rule_id + ":v_" + str(int(version))

    # -- admin --------------------------------------------------------------

    @gl.public.write
    def set_paused(self, flag: bool) -> None:
        """Emergency pause. Owner may only stop NEW case activity.

        Pause cannot rewrite rules, erase evidence, alter verdicts, seize bonds,
        or block settlement of an already finalized bond disposition.
        """
        self._only_owner()
        self.paused = flag

    # -- views --------------------------------------------------------------

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "contract_name": CONTRACT_NAME,
            "contract_version": self.contract_version,
            "schema_version": SCHEMA_VERSION,
            "dimension_set_version": DIMENSION_SET_VERSION,
            "owner": self.owner.as_hex,
            "sink_address": self.sink_address.as_hex,
            "paused": self.paused,
            "case_bond": str(int(self.case_bond)),
            "challenge_bond_bps": int(self.challenge_bond_bps),
            "claim_slash_bps": int(self.claim_slash_bps),
            "drift_slash_bps": int(self.drift_slash_bps),
            "challenge_window_seconds": int(self.challenge_window_seconds),
            "evidence_window_seconds": int(self.evidence_window_seconds),
        }

    @gl.public.view
    def get_caps(self) -> dict:
        return {
            "max_protocols": MAX_PROTOCOLS,
            "max_rules_per_protocol": MAX_RULES_PER_PROTOCOL,
            "max_versions_per_rule": MAX_VERSIONS_PER_RULE,
            "max_cases_per_rule": MAX_CASES_PER_RULE,
            "max_evidence_per_case": MAX_EVIDENCE_PER_CASE,
            "max_evidence_per_source_key": MAX_EVIDENCE_PER_SOURCE_KEY,
            "max_challenges_per_case": MAX_CHALLENGES_PER_CASE,
            "max_verdicts_per_case": MAX_VERDICTS_PER_CASE,
            "max_protocol_id_len": MAX_PROTOCOL_ID_LEN,
            "max_rule_id_len": MAX_RULE_ID_LEN,
            "max_url_len": MAX_URL_LEN,
            "max_title_len": MAX_TITLE_LEN,
            "max_rule_text_len": MAX_RULE_TEXT_LEN,
            "max_relevance_note_len": MAX_RELEVANCE_NOTE_LEN,
            "max_anchors_len": MAX_ANCHORS_LEN,
            "max_anchor_count": MAX_ANCHOR_COUNT,
            "max_excerpt_len": MAX_EXCERPT_LEN,
            "default_page_size": DEFAULT_PAGE_SIZE,
            "max_page_size": MAX_PAGE_SIZE,
        }

    @gl.public.view
    def get_vocabularies(self) -> dict:
        return {
            "case_types": list(CASE_TYPES),
            "case_statuses": list(CASE_STATUSES),
            "rule_categories": list(RULE_CATEGORIES),
            "rule_statuses": list(RULE_STATUSES),
            "version_statuses": list(VERSION_STATUSES),
            "verdicts": list(VERDICTS),
            "model_verdicts": list(MODEL_VERDICTS),
            "dimensions_claim": list(DIMENSIONS_CLAIM),
            "dimensions_drift": list(DIMENSIONS_DRIFT),
            "findings": list(FINDINGS),
            "evidence_types": list(EVIDENCE_TYPES),
            "weak_evidence_types": list(WEAK_EVIDENCE_TYPES),
            "retrieval_modes": list(RETRIEVAL_MODES),
            "evidence_states": list(EVIDENCE_STATES),
            "challenge_grounds": list(CHALLENGE_GROUNDS),
            "challenge_statuses": list(CHALLENGE_STATUSES),
            "bond_states": list(BOND_STATES),
            "bond_roles": list(BOND_ROLES),
            "bond_dispositions": list(BOND_DISPOSITIONS),
        }

    @gl.public.view
    def get_counts(self) -> dict:
        return {
            "protocols": len(self.protocol_ids),
            "protocol_seq": int(self.protocol_seq),
            "rule_seq": int(self.rule_seq),
            "case_seq": int(self.case_seq),
            "evidence_seq": int(self.evidence_seq),
            "verdict_seq": int(self.verdict_seq),
            "challenge_seq": int(self.challenge_seq),
            "bond_seq": int(self.bond_seq),
        }
