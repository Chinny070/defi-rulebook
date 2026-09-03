import { useState, type ReactNode } from "react";
import { useWriteFlow, type ContractWrite } from "../hooks/useWriteFlow";
import type { WriteState } from "../lib/writeFlow";
import { Hash } from "./ui";

const STEPS: WriteState[] = [
  "AWAITING_SIGNATURE",
  "SUBMITTED",
  "PROCESSING",
  "CONSENSUS_CHECK",
  "STATE_REVALIDATING",
  "SUCCESS",
];

const LABELS: Record<WriteState, string> = {
  IDLE: "Ready",
  AWAITING_SIGNATURE: "Sign in wallet",
  SUBMITTED: "Submitted",
  PROCESSING: "Awaiting network",
  CONSENSUS_CHECK: "Checking consensus",
  STATE_REVALIDATING: "Verifying on-chain state",
  SUCCESS: "Confirmed",
  FAILED: "Failed",
  STATE_MISMATCH: "Not confirmed",
  UNDETERMINED: "Undetermined",
};

/**
 * Every write in the app goes through this button.
 *
 * It shows the whole pipeline, including the two steps most apps skip: the
 * consensus check and the state re-read. An Undetermined result is displayed
 * as its own outcome, never collapsed into success or failure.
 */
export function WriteAction<T>({
  label,
  walletAddress,
  build,
  onConfirmed,
  disabled,
  children,
}: {
  label: string;
  walletAddress: string | null;
  build: () => ContractWrite<T>;
  onConfirmed?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const flow = useWriteFlow<T>(walletAddress);
  const [open, setOpen] = useState(false);

  const onClick = async () => {
    setOpen(true);
    const result = await flow.run(build());
    if (result.state === "SUCCESS") onConfirmed?.();
  };

  const stepIndex = STEPS.indexOf(flow.state);

  return (
    <div className="write-action">
      {children}
      <button
        className="primary"
        onClick={onClick}
        disabled={disabled || flow.busy || !walletAddress}
        title={walletAddress ? undefined : "Connect a wallet to take this action"}
      >
        {flow.busy ? LABELS[flow.state] : label}
      </button>

      {open && flow.progress && (
        <div className={`write-progress ${flow.outcome?.state.toLowerCase() ?? ""}`}>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className={
                  flow.state === step ? "active" : stepIndex > i ? "done" : "todo"
                }
              >
                {LABELS[step]}
              </li>
            ))}
          </ol>

          <p className="message">{flow.progress.message}</p>

          {flow.progress.hash && (
            <p className="small muted">
              Transaction <Hash value={flow.progress.hash} />
              {flow.progress.statusName ? ` - status ${flow.progress.statusName}` : ""}
            </p>
          )}

          {flow.outcome?.state === "UNDETERMINED" && (
            <p className="small">
              Consensus did not decide. This is not a failure and not a success - the
              safe action is to reload this page and check the current state before
              retrying.
            </p>
          )}

          {flow.outcome?.state === "STATE_MISMATCH" && (
            <p className="small">
              The transaction was committed but the contract does not show the expected
              change. Reload before retrying; do not assume it worked.
            </p>
          )}

          {flow.outcome?.error && <p className="small mono error-text">{flow.outcome.error}</p>}

          {flow.outcome && (
            <button
              className="ghost"
              onClick={() => {
                flow.reset();
                setOpen(false);
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
