/**
 * Consensus classification.
 *
 * A GenLayer transaction can return a hash, and even a plausible value, while
 * consensus never committed the state change. Nothing in this app may treat a
 * receipt as proof. This module turns a receipt into one of three verdicts,
 * and only COMMITTED is ever allowed to become a success in the UI - and even
 * then the caller must still re-read contract state.
 */

/** Every status the SDK can report, mirrored so tests do not need the SDK. */
export const TX_STATUS = {
  UNINITIALIZED: "UNINITIALIZED",
  PENDING: "PENDING",
  PROPOSING: "PROPOSING",
  COMMITTING: "COMMITTING",
  REVEALING: "REVEALING",
  ACCEPTED: "ACCEPTED",
  UNDETERMINED: "UNDETERMINED",
  FINALIZED: "FINALIZED",
  CANCELED: "CANCELED",
  APPEAL_REVEALING: "APPEAL_REVEALING",
  APPEAL_COMMITTING: "APPEAL_COMMITTING",
  READY_TO_FINALIZE: "READY_TO_FINALIZE",
  VALIDATORS_TIMEOUT: "VALIDATORS_TIMEOUT",
  LEADER_TIMEOUT: "LEADER_TIMEOUT",
} as const;

export type TxStatus = (typeof TX_STATUS)[keyof typeof TX_STATUS];

/**
 * genlayer-js reports a transaction status as a numeric code as well as a
 * name. A receipt can arrive with only the number (or a numeric string), so
 * this table lets the classifier resolve either form. Mirrors the SDK's
 * transactionsStatusNumberToName so tests need no SDK.
 */
const STATUS_CODE_TO_NAME: Record<string, string> = {
  "0": TX_STATUS.UNINITIALIZED,
  "1": TX_STATUS.PENDING,
  "2": TX_STATUS.PROPOSING,
  "3": TX_STATUS.COMMITTING,
  "4": TX_STATUS.REVEALING,
  "5": TX_STATUS.ACCEPTED,
  "6": TX_STATUS.UNDETERMINED,
  "7": TX_STATUS.FINALIZED,
  "8": TX_STATUS.CANCELED,
  "9": TX_STATUS.APPEAL_REVEALING,
  "10": TX_STATUS.APPEAL_COMMITTING,
  "11": TX_STATUS.READY_TO_FINALIZE,
  "12": TX_STATUS.VALIDATORS_TIMEOUT,
  "13": TX_STATUS.LEADER_TIMEOUT,
};

/** Resolve a status name from a receipt's string name, string code, or number. */
export function statusToName(raw: string | number | undefined): string | undefined {
  if (typeof raw === "number") return STATUS_CODE_TO_NAME[String(raw)];
  if (typeof raw === "string") {
    const upper = raw.toUpperCase();
    // Already a known name?
    if (Object.values(TX_STATUS).includes(upper as TxStatus)) return upper;
    // A numeric string like "5"?
    if (raw in STATUS_CODE_TO_NAME) return STATUS_CODE_TO_NAME[raw];
  }
  return undefined;
}

export type ConsensusVerdict =
  /** Consensus committed the transaction. State MAY have changed - verify it. */
  | "COMMITTED"
  /** Consensus did not decide. State almost certainly did NOT change. */
  | "UNDETERMINED"
  /** Consensus decided against, or the transaction was canceled. */
  | "FAILED"
  /** Still in flight. Not an outcome. */
  | "PENDING";

/**
 * Statuses that mean consensus committed. Deliberately a short allowlist:
 * anything unrecognised is treated as not-committed rather than assumed good.
 */
const COMMITTED_STATUSES = new Set<string>([
  TX_STATUS.ACCEPTED,
  TX_STATUS.FINALIZED,
]);

/** Statuses that mean consensus could not reach a decision. */
const UNDETERMINED_STATUSES = new Set<string>([
  TX_STATUS.UNDETERMINED,
  TX_STATUS.VALIDATORS_TIMEOUT,
  TX_STATUS.LEADER_TIMEOUT,
]);

/** Statuses that mean the transaction will not take effect. */
const FAILED_STATUSES = new Set<string>([TX_STATUS.CANCELED]);

/** Statuses that are still in flight. */
const PENDING_STATUSES = new Set<string>([
  TX_STATUS.UNINITIALIZED,
  TX_STATUS.PENDING,
  TX_STATUS.PROPOSING,
  TX_STATUS.COMMITTING,
  TX_STATUS.REVEALING,
  TX_STATUS.APPEAL_COMMITTING,
  TX_STATUS.APPEAL_REVEALING,
  TX_STATUS.READY_TO_FINALIZE,
]);

export interface ReceiptLike {
  status?: string | number;
  statusName?: string;
  consensus_data?: { final?: boolean } | undefined;
}

/**
 * Classify a receipt.
 *
 * An unknown or missing status is UNDETERMINED, never COMMITTED: if we cannot
 * tell what happened, we must not tell the user it worked.
 */
export function classifyReceipt(receipt: ReceiptLike | null | undefined): ConsensusVerdict {
  if (!receipt) return "UNDETERMINED";

  const status = statusToName(receipt.statusName ?? receipt.status);
  if (!status) return "UNDETERMINED";

  if (UNDETERMINED_STATUSES.has(status)) return "UNDETERMINED";
  if (FAILED_STATUSES.has(status)) return "FAILED";
  if (PENDING_STATUSES.has(status)) return "PENDING";
  if (COMMITTED_STATUSES.has(status)) return "COMMITTED";
  return "UNDETERMINED";
}

/** True only for statuses this app is willing to build a success on. */
export function isCommitted(status: string | undefined): boolean {
  return typeof status === "string" && COMMITTED_STATUSES.has(status.toUpperCase());
}

/** Human-facing explanation. Never optimistic about an unresolved outcome. */
export function explainVerdict(verdict: ConsensusVerdict, status?: string): string {
  switch (verdict) {
    case "COMMITTED":
      return `Consensus committed the transaction (${status ?? "accepted"}). Verifying contract state.`;
    case "UNDETERMINED":
      return `Consensus did not reach a decision (${status ?? "unknown"}). Your change was almost certainly NOT applied. Nothing was lost - retry when the network settles.`;
    case "FAILED":
      return `The transaction was rejected by consensus (${status ?? "canceled"}). No state changed.`;
    case "PENDING":
      return `Still awaiting consensus (${status ?? "pending"}). No outcome yet.`;
  }
}
