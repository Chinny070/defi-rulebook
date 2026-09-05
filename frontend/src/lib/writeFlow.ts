/**
 * The one write path.
 *
 * A GenLayer transaction can return a hash - and even a plausible value -
 * while consensus never committed the state change. So a receipt is never
 * treated as success here. Every write goes:
 *
 *   submit -> await receipt -> classify consensus -> RE-READ STATE -> verify
 *
 * and only reports SUCCESS when the contract itself confirms the change. If
 * the caller supplies no verifier, the flow refuses to claim success: it
 * reports STATE_MISMATCH rather than guessing.
 */

import { classifyReceipt, explainVerdict, type ConsensusVerdict, type ReceiptLike } from "./consensus";
import { describeWalletError } from "./errors";

export type WriteState =
  | "IDLE"
  | "AWAITING_SIGNATURE"
  | "SUBMITTED"
  | "PROCESSING"
  | "CONSENSUS_CHECK"
  | "STATE_REVALIDATING"
  | "SUCCESS"
  | "FAILED"
  | "STATE_MISMATCH"
  | "UNDETERMINED";

export const TERMINAL_STATES: readonly WriteState[] = [
  "SUCCESS",
  "FAILED",
  "STATE_MISMATCH",
  "UNDETERMINED",
];

export function isTerminal(state: WriteState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Only one state may be shown to a user as a completed, applied change. */
export function isSuccess(state: WriteState): boolean {
  return state === "SUCCESS";
}

export interface WriteProgress {
  state: WriteState;
  hash?: string;
  consensus?: ConsensusVerdict;
  statusName?: string;
  message: string;
  error?: string;
}

export interface WriteRequest<T> {
  /** Submits the transaction and resolves with its hash. */
  submit: () => Promise<string>;
  /** Waits for a receipt. Resolves with whatever the SDK returns. */
  waitForReceipt: (hash: string) => Promise<ReceiptLike | null>;
  /**
   * Re-reads authoritative contract state and returns whether the intended
   * transition actually happened. Required: without it there is no basis for
   * claiming success.
   */
  verify: () => Promise<{ ok: boolean; detail?: string; value?: T }>;
  onProgress?: (progress: WriteProgress) => void;
}

export interface WriteOutcome<T> {
  state: WriteState;
  hash?: string;
  consensus?: ConsensusVerdict;
  statusName?: string;
  message: string;
  error?: string;
  value?: T;
}

function statusNameOf(receipt: ReceiptLike | null | undefined): string | undefined {
  if (!receipt) return undefined;
  const raw = receipt.statusName ?? receipt.status;
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Run a write to completion. Never throws for an on-chain outcome: an
 * unresolved consensus is a result the user must see, not an exception to
 * swallow. Only programming errors propagate.
 */
export async function runWrite<T>(request: WriteRequest<T>): Promise<WriteOutcome<T>> {
  const report = (progress: WriteProgress) => request.onProgress?.(progress);

  report({ state: "AWAITING_SIGNATURE", message: "Waiting for you to sign in your wallet." });

  let hash: string;
  try {
    hash = await request.submit();
  } catch (error) {
    const outcome: WriteOutcome<T> = {
      state: "FAILED",
      message: describeWalletError(error),
      error: error instanceof Error ? error.message : String(error),
    };
    report({ ...outcome, state: "FAILED" });
    return outcome;
  }

  report({ state: "SUBMITTED", hash, message: "Transaction submitted." });
  report({ state: "PROCESSING", hash, message: "Waiting for the network." });

  let receipt: ReceiptLike | null = null;
  try {
    receipt = await request.waitForReceipt(hash);
  } catch (error) {
    // A timeout waiting for a receipt tells us nothing about whether the
    // change applied, so it is UNDETERMINED, never a failure.
    const message = error instanceof Error ? error.message : String(error);
    const outcome: WriteOutcome<T> = {
      state: "UNDETERMINED",
      hash,
      consensus: "UNDETERMINED",
      message:
        "No receipt was returned in time. The outcome is unknown - re-read the page before retrying.",
      error: message,
    };
    report({ ...outcome, state: "UNDETERMINED" });
    return outcome;
  }

  const statusName = statusNameOf(receipt);
  const consensus = classifyReceipt(receipt);
  report({
    state: "CONSENSUS_CHECK",
    hash,
    consensus,
    statusName,
    message: explainVerdict(consensus, statusName),
  });

  if (consensus !== "COMMITTED") {
    const state: WriteState = consensus === "FAILED" ? "FAILED" : "UNDETERMINED";
    const outcome: WriteOutcome<T> = {
      state,
      hash,
      consensus,
      statusName,
      message: explainVerdict(consensus, statusName),
    };
    report({ ...outcome, state });
    return outcome;
  }

  // Committed is still not success. Ask the contract.
  report({
    state: "STATE_REVALIDATING",
    hash,
    consensus,
    statusName,
    message: "Consensus committed. Re-reading contract state to confirm.",
  });

  let verified: { ok: boolean; detail?: string; value?: T };
  try {
    verified = await request.verify();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome: WriteOutcome<T> = {
      state: "STATE_MISMATCH",
      hash,
      consensus,
      statusName,
      message: "Could not confirm the change by re-reading contract state.",
      error: message,
    };
    report({ ...outcome, state: "STATE_MISMATCH" });
    return outcome;
  }

  if (!verified.ok) {
    const outcome: WriteOutcome<T> = {
      state: "STATE_MISMATCH",
      hash,
      consensus,
      statusName,
      message:
        verified.detail ??
        "Consensus committed, but contract state does not show the expected change.",
    };
    report({ ...outcome, state: "STATE_MISMATCH" });
    return outcome;
  }

  const outcome: WriteOutcome<T> = {
    state: "SUCCESS",
    hash,
    consensus,
    statusName,
    message: "Confirmed on-chain.",
    value: verified.value,
  };
  report({ ...outcome, state: "SUCCESS" });
  return outcome;
}
