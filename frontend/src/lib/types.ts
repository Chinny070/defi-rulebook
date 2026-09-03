/** Shapes returned by the contract view methods. */

export interface Protocol {
  protocol_id: string;
  display_name: string;
  homepage_url: string;
  docs_root_url: string;
  registrant: string;
  community_maintained: boolean;
  officially_verified: boolean;
  created_at: number;
  rule_count: number;
  open_case_count: number;
}

export interface Rule {
  rule_id: string;
  protocol_id: string;
  category: string;
  title: string;
  status: string;
  current_version: number;
  current_fingerprint: string;
  has_canonical_version: boolean;
  version_count: number;
  case_count: number;
  active_case_id: string;
  creator: string;
  created_at: number;
}

export interface RuleVersion {
  version_id: string;
  rule_id: string;
  version: number;
  text: string;
  scope: string;
  exceptions: string;
  predecessor: number;
  originating_case_id: string;
  originating_verdict_id: string;
  evidence_digest: string;
  effective_basis: string;
  status: string;
  established_at: number;
  fingerprint: string;
}

export interface CurrentRule {
  protocol_id: string;
  rule_id: string;
  category: string;
  title: string;
  version: number;
  text: string;
  scope: string;
  exceptions: string;
  effective_basis: string;
  originating_case_id: string;
  originating_verdict_id: string;
  evidence_digest: string;
  fingerprint: string;
  established_at: number;
  rule_status: string;
  disputed: boolean;
  community_maintained: boolean;
  officially_verified: boolean;
}

export interface DisputeStatus {
  rule_id: string;
  protocol_id: string;
  rule_status: string;
  has_canonical_version: boolean;
  current_version: number;
  disputed: boolean;
  active_case_id: string;
  active_case_type: string;
  active_case_status: string;
  active_drift_case: boolean;
}

export interface Case {
  case_id: string;
  case_type: string;
  protocol_id: string;
  rule_id: string;
  reporter: string;
  expected_version: number;
  expected_fingerprint: string;
  claimed_text: string;
  claimed_scope: string;
  claimed_exceptions: string;
  status: string;
  invalid_reason: string;
  case_fingerprint: string;
  evidence_count: number;
  frozen_evidence_count: number;
  verdict_count: number;
  challenge_count: number;
  open_challenge_id: string;
  final_verdict_id: string;
  opened_at: number;
  evidence_deadline: number;
  frozen_at: number;
  verdict_at: number;
  challenge_deadline: number;
  finalized_at: number;
}

export interface Evidence {
  evidence_id: string;
  case_id: string;
  submitter: string;
  url: string;
  url_key: string;
  source_key: string;
  retrieval_mode: string;
  anchors: string[];
  claimed_type: string;
  claimed_type_is_submitter_assertion: boolean;
  relevance_note: string;
  claimed_published_at: number;
  claimed_published_known: boolean;
  state: string;
  snapshot_status: string;
  snapshot_fingerprint: string;
  excerpt_length: number;
  snapshot_at: number;
  submitted_at: number;
}

export interface Snapshot {
  evidence_id: string;
  case_id: string;
  url_key: string;
  retrieval_method: string;
  anchors: string[];
  retrieval_status: string;
  failure_reason: string;
  attempts: number;
  retrieved_at: number;
  normalized_excerpt: string;
  excerpt_is_untrusted_external_content: boolean;
  excerpt_length: number;
  max_excerpt_length: number;
  excerpt_lead_chars: number;
  fingerprint: string;
  fingerprint_scheme: string;
}

export interface DimensionFinding {
  name: string;
  result: string;
  reason: string;
}

export interface Verdict {
  verdict_id: string;
  case_id: string;
  index: number;
  decision: string;
  summary: string;
  dimensions: DimensionFinding[];
  evidence_used: string[];
  case_fingerprint: string;
  replaces_verdict_id: string;
  created_at: number;
}

export interface Challenge {
  challenge_id: string;
  case_id: string;
  challenger: string;
  ground: string;
  argument: string;
  argument_is_participant_assertion: boolean;
  cited_evidence_ids: string[];
  status: string;
  target_verdict_id: string;
  resulting_verdict_id: string;
  created_at: number;
  resolved_at: number;
}

export interface ChallengeWindow {
  case_id: string;
  status: string;
  challenge_deadline: number;
  in_challenge_window: boolean;
  open_to_new_challenges: boolean;
  finalizable: boolean;
  open_challenge_id: string;
  challenge_count: number;
  max_challenges: number;
}

export interface Bond {
  case_id: string;
  has_bond: boolean;
  state: string;
  required_amount: string;
  bond_id?: string;
  role?: string;
  depositor?: string;
  amount?: string;
  disposition?: string;
  refund_amount?: string;
  slash_amount?: string;
  refund_recipient?: string;
  slash_recipient?: string;
  locked_at?: number;
  settled_at?: number;
  payout_owed?: boolean;
}

export interface SnapshotStatus {
  case_id: string;
  status: string;
  frozen_evidence_count: number;
  snapshot_complete: number;
  snapshot_failed: number;
  snapshot_pending: number;
  ready_for_adjudication: boolean;
}

export interface FrozenEvidence {
  case_id: string;
  status: string;
  is_frozen: boolean;
  case_fingerprint: string;
  case_fingerprint_scheme: string;
  frozen_at: number;
  evidence_ids: string[];
}

export interface Config {
  contract_name: string;
  contract_version: string;
  schema_version: string;
  dimension_set_version: string;
  case_fingerprint_scheme: string;
  snapshot_fingerprint_scheme: string;
  version_fingerprint_scheme: string;
  bond_required_before_freeze: boolean;
  excerpt_lead_chars: number;
  max_snapshot_attempts: number;
  render_wait: string;
  owner: string;
  sink_address: string;
  paused: boolean;
  case_bond: string;
  challenge_bond_bps: number;
  claim_slash_bps: number;
  drift_slash_bps: number;
  challenge_window_seconds: number;
  evidence_window_seconds: number;
}

export interface EconomicConfig {
  case_bond: string;
  bond_is_fixed_by_config: boolean;
  caller_selected_amounts: boolean;
  claim_slash_bps: number;
  drift_slash_bps: number;
  bps_denominator: number;
  slash_recipient: string;
  challenger_bonds: boolean;
  bond_visible_to_adjudication: boolean;
  bond_states: string[];
  bond_roles: string[];
}

export interface Counts {
  protocols: number;
  protocol_seq: number;
  rule_seq: number;
  case_seq: number;
  evidence_seq: number;
  verdict_seq: number;
  challenge_seq: number;
  bond_seq: number;
}

export interface Vocabularies {
  case_types: string[];
  case_statuses: string[];
  rule_categories: string[];
  rule_statuses: string[];
  verdicts: string[];
  dimensions_claim: string[];
  dimensions_drift: string[];
  findings: string[];
  evidence_types: string[];
  weak_evidence_types: string[];
  retrieval_modes: string[];
  snapshot_statuses: string[];
  snapshot_failure_reasons: string[];
  challenge_grounds: string[];
  challenge_statuses: string[];
  bond_states: string[];
  bond_roles: string[];
}

export interface Caps {
  max_protocols: number;
  max_rules_per_protocol: number;
  max_versions_per_rule: number;
  max_cases_per_rule: number;
  max_evidence_per_case: number;
  max_challenges_per_case: number;
  max_excerpt_len: number;
  max_anchor_count: number;
  max_url_len: number;
  max_rule_text_len: number;
  max_dimension_reason_len: number;
  max_verdict_summary_len: number;
  min_challenge_argument_len: number;
  default_page_size: number;
  max_page_size: number;
}
