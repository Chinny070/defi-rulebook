import { useState, type ReactNode } from "react";
import { useWriteFlow, type ContractWrite } from "../hooks/useWriteFlow";
import { useWalletContext } from "../walletContext";
import { isTerminal, type WriteState } from "../lib/writeFlow";
import { CHAIN_NAME } from "../lib/config";
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

/** Read the currently authorized account without prompting. */
async function currentAccount(): Promise<string | null> {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) return null;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Every write in the app goes through this button.
 *
 * A single click does whatever the action needs: if no wallet is connected it
 * opens the wallet; if the wallet is on the wrong network it offers to switch
 * to StudioNet; then it submits and — crucially — re-reads contract state to
 * confirm the change actually applied. It shows the whole pipeline, including
 * the consensus check and the state re-read that most apps skip. Undetermined,
 * Failed, and Not-confirmed are shown as distinct outcomes, each with a retry.
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
  const wallet = useWalletContext();
  const flow = useWriteFlow<T>(walletAddress);
  const [open, setOpen] = useState(false);
  // A local error for the pre-flight steps (connect / switch) before a tx exists.
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const runWithGuards = async () => {
    setPreflightError(null);
    setOpen(true);

    // 1. No wallet extension at all.
    if (!wallet.available) {
      setPreflightError(
        "No browser wallet detected. Install a wallet (e.g. MetaMask) to take actions — reading the explorer needs none.",
      );
      return;
    }

    // 2. Not connected: open the wallet, then use the freshly authorized account.
    let address = walletAddress;
    if (!address) {
      await wallet.connect();
      address = await currentAccount();
      if (!address) {
        setPreflightError(
          wallet.error ?? "The wallet did not return an account. Approve the connection and try again.",
        );
        return;
      }
    }

    // 3. Wrong network: offer a one-click switch/add of StudioNet.
    if (wallet.wrongNetwork) {
      const ok = await wallet.switchNetwork();
      if (!ok) {
        setPreflightError(
          wallet.error ?? `Switch your wallet to ${CHAIN_NAME}, then take this action again.`,
        );
        return;
      }
    }

    // 4. Submit and verify, using the address we just resolved.
    const result = await flow.run(build(), address);
    if (result.state === "SUCCESS") onConfirmed?.();
  };

  const dismiss = () => {
    flow.reset();
    setPreflightError(null);
    setOpen(false);
  };

  const stepIndex = STEPS.indexOf(flow.state);
  const terminalNonSuccess =
    flow.outcome && isTerminal(flow.outcome.state) && flow.outcome.state !== "SUCCESS";

  // What the button says before anything happens.
  const preClickLabel = !wallet.available
    ? label
    : !walletAddress
      ? `Connect wallet & ${label.toLowerCase()}`
      : wallet.wrongNetwork
        ? `Switch to ${CHAIN_NAME} & ${label.toLowerCase()}`
        : label;

  return (
    <div className="write-action">
      {children}

      {wallet.wrongNetwork && (
        <p className="small warn-text">
          Wallet is on the wrong network.{" "}
          <button className="link" onClick={() => wallet.switchNetwork()} disabled={wallet.switching}>
            {wallet.switching ? "Switching…" : `Switch to ${CHAIN_NAME}`}
          </button>
        </p>
      )}

      <button
        className="primary"
        onClick={runWithGuards}
        disabled={disabled || flow.busy || wallet.connecting || wallet.switching}
      >
        {flow.busy ? LABELS[flow.state] : preClickLabel}
      </button>

      {open && (preflightError || flow.progress) && (
        <div className={`write-progress ${flow.outcome?.state.toLowerCase() ?? ""}`}>
          {flow.progress && (
            <ol className="steps">
              {STEPS.map((step, i) => (
                <li
                  key={step}
                  className={flow.state === step ? "active" : stepIndex > i ? "done" : "todo"}
                >
                  {LABELS[step]}
                </li>
              ))}
            </ol>
          )}

          {preflightError && <p className="message error-text">{preflightError}</p>}
          {flow.progress && <p className="message">{flow.progress.message}</p>}

          {flow.progress?.hash && (
            <p className="small muted">
              Transaction <Hash value={flow.progress.hash} />
              {flow.progress.statusName ? ` - status ${flow.progress.statusName}` : ""}
            </p>
          )}

          {flow.outcome?.state === "UNDETERMINED" && (
            <p className="small">
              Consensus did not decide. This is not a failure and not a success - the safe
              action is to reload this page and check the current state before retrying.
            </p>
          )}

          {flow.outcome?.state === "STATE_MISMATCH" && (
            <p className="small">
              The transaction was committed but the contract does not show the expected
              change. Reload before retrying; do not assume it worked.
            </p>
          )}

          {flow.outcome?.error && <p className="small mono error-text">{flow.outcome.error}</p>}

          <div className="write-actions-row">
            {(preflightError || terminalNonSuccess) && (
              <button className="primary" onClick={runWithGuards} disabled={flow.busy}>
                Retry
              </button>
            )}
            {(flow.outcome || preflightError) && (
              <button className="ghost" onClick={dismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
