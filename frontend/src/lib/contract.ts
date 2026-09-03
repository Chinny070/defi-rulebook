/**
 * Typed read layer over the contract views.
 *
 * Every list read is paginated: no call here can ask for an unbounded page,
 * and the contract clamps anything larger than its own cap regardless.
 */

import { getReadClient, requireAddress } from "./client";
import { MAX_PAGE_SIZE, PAGE_SIZE } from "./config";
import type {
  Bond,
  Caps,
  Case,
  Challenge,
  ChallengeWindow,
  Config,
  Counts,
  CurrentRule,
  DisputeStatus,
  EconomicConfig,
  Evidence,
  FrozenEvidence,
  Protocol,
  Rule,
  RuleVersion,
  Snapshot,
  SnapshotStatus,
  Verdict,
  Vocabularies,
} from "./types";

/** Raised when the contract rejects a read, e.g. an unknown id. */
export class ContractReadError extends Error {
  readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = "ContractReadError";
    const match = /\[([A-Z_]+)\]/.exec(message);
    this.code = match?.[1] ?? "READ_FAILED";
  }
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const client = getReadClient();
  try {
    return (await client.readContract({
      address: requireAddress(),
      functionName,
      args,
    })) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ContractReadError(message);
  }
}

/** Clamp a page request before it ever leaves the browser. */
export function boundedLimit(limit = PAGE_SIZE): number {
  if (!Number.isFinite(limit) || limit <= 0) return PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}

// -- configuration ---------------------------------------------------------

export const getConfig = () => read<Config>("get_config");
export const getCaps = () => read<Caps>("get_caps");
export const getCounts = () => read<Counts>("get_counts");
export const getVocabularies = () => read<Vocabularies>("get_vocabularies");
export const getEconomicConfig = () => read<EconomicConfig>("get_economic_config");

// -- registry --------------------------------------------------------------

export const getProtocol = (protocolId: string) =>
  read<Protocol>("get_protocol", [protocolId]);

export const listProtocols = (offset = 0, limit = PAGE_SIZE) =>
  read<Protocol[]>("list_protocols", [offset, boundedLimit(limit)]);

export const getRule = (ruleId: string) => read<Rule>("get_rule", [ruleId]);

export const listRules = (protocolId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Rule[]>("list_rules", [protocolId, offset, boundedLimit(limit)]);

// -- integration feed ------------------------------------------------------

export const getCurrentRules = (protocolId: string, offset = 0, limit = PAGE_SIZE) =>
  read<CurrentRule[]>("get_current_rules", [protocolId, offset, boundedLimit(limit)]);

export const getDisputeStatus = (ruleId: string) =>
  read<DisputeStatus>("get_dispute_status", [ruleId]);

// -- versions --------------------------------------------------------------

export const getRuleVersion = (ruleId: string, version: number) =>
  read<RuleVersion>("get_rule_version", [ruleId, version]);

export const listRuleVersions = (ruleId: string, offset = 0, limit = PAGE_SIZE) =>
  read<RuleVersion[]>("list_rule_versions", [ruleId, offset, boundedLimit(limit)]);

export const getCurrentRuleVersion = (ruleId: string) =>
  read<RuleVersion & { has_canonical_version: boolean }>(
    "get_current_rule_version",
    [ruleId],
  );

// -- cases -----------------------------------------------------------------

export const getCase = (caseId: string) => read<Case>("get_case", [caseId]);

export const listRuleCases = (ruleId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Case[]>("list_rule_cases", [ruleId, offset, boundedLimit(limit)]);

export const getCaseFrozenEvidence = (caseId: string) =>
  read<FrozenEvidence>("get_case_frozen_evidence", [caseId]);

// -- evidence and snapshots ------------------------------------------------

export const getEvidence = (evidenceId: string) =>
  read<Evidence>("get_evidence", [evidenceId]);

export const listCaseEvidence = (caseId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Evidence[]>("list_case_evidence", [caseId, offset, boundedLimit(limit)]);

export const getEvidenceSnapshot = (evidenceId: string) =>
  read<Snapshot>("get_evidence_snapshot", [evidenceId]);

export const listCaseSnapshots = (caseId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Snapshot[]>("list_case_snapshots", [caseId, offset, boundedLimit(limit)]);

export const getCaseSnapshotStatus = (caseId: string) =>
  read<SnapshotStatus>("get_case_snapshot_status", [caseId]);

export const getCaseSnapshotDigest = (caseId: string) =>
  read<{ case_id: string; case_fingerprint: string; snapshot_count: number; snapshot_set_digest: string }>(
    "get_case_snapshot_digest",
    [caseId],
  );

// -- verdicts and challenges -----------------------------------------------

export const getVerdict = (verdictId: string) =>
  read<Verdict>("get_verdict", [verdictId]);

export const listCaseVerdicts = (caseId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Verdict[]>("list_case_verdicts", [caseId, offset, boundedLimit(limit)]);

export const getChallenge = (challengeId: string) =>
  read<Challenge>("get_challenge", [challengeId]);

export const listCaseChallenges = (caseId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Challenge[]>("list_case_challenges", [caseId, offset, boundedLimit(limit)]);

export const getChallengeWindow = (caseId: string) =>
  read<ChallengeWindow>("get_challenge_window", [caseId]);

// -- bonds -----------------------------------------------------------------

export const getBondState = (caseId: string) => read<Bond>("get_bond_state", [caseId]);

export const listCaseBonds = (caseId: string, offset = 0, limit = PAGE_SIZE) =>
  read<Bond[]>("list_case_bonds", [caseId, offset, boundedLimit(limit)]);
