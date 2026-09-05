import { useCallback, useState } from "react";
import { getWriteClient, requireAddress } from "../lib/client";
import { runWrite, type WriteOutcome, type WriteProgress, type WriteState } from "../lib/writeFlow";
import type { ReceiptLike } from "../lib/consensus";

export interface ContractWrite<T> {
  functionName: string;
  args: unknown[];
  value?: bigint;
  /** Re-reads contract state and confirms the transition actually happened. */
  verify: () => Promise<{ ok: boolean; detail?: string; value?: T }>;
}

export interface WriteFlow<T> {
  state: WriteState;
  progress: WriteProgress | null;
  outcome: WriteOutcome<T> | null;
  busy: boolean;
  /**
   * Runs the write. `addressOverride` lets a caller that just connected in the
   * same click pass the fresh address, rather than waiting for a re-render.
   */
  run: (write: ContractWrite<T>, addressOverride?: string | null) => Promise<WriteOutcome<T>>;
  reset: () => void;
}

/**
 * The only way a component may write. Components never call writeContract
 * directly, so no screen can bypass the consensus check or the state re-read.
 */
export function useWriteFlow<T = unknown>(walletAddress: string | null): WriteFlow<T> {
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome<T> | null>(null);

  const reset = useCallback(() => {
    setProgress(null);
    setOutcome(null);
  }, []);

  const run = useCallback(
    async (write: ContractWrite<T>, addressOverride?: string | null): Promise<WriteOutcome<T>> => {
      setOutcome(null);
      const effectiveAddress = addressOverride ?? walletAddress;
      if (!effectiveAddress) {
        const failure: WriteOutcome<T> = {
          state: "FAILED",
          message: "Connect a wallet to take this action.",
        };
        setProgress({ state: "FAILED", message: failure.message });
        setOutcome(failure);
        return failure;
      }

      const address = requireAddress();

      // Acquiring the wallet client (which connects to StudioNet and the
      // GenLayer Snap) can itself fail or prompt. It is obtained inside the
      // flow's guarded submit step so any failure surfaces in the progress
      // panel instead of vanishing as an unhandled rejection; the same
      // instance is reused to wait for the receipt.
      let client: Awaited<ReturnType<typeof getWriteClient>> | null = null;

      const result = await runWrite<T>({
        submit: async () => {
          client = await getWriteClient(effectiveAddress);
          return client.writeContract({
            address,
            functionName: write.functionName,
            args: write.args,
            value: write.value ?? BigInt(0),
          });
        },
        waitForReceipt: async (hash) => {
          const c = client ?? (client = await getWriteClient(effectiveAddress));
          return c.waitForTransactionReceipt({ hash, status: "ACCEPTED" }) as Promise<ReceiptLike | null>;
        },
        verify: write.verify,
        onProgress: setProgress,
      });

      setOutcome(result);
      return result;
    },
    [walletAddress],
  );

  const state = progress?.state ?? "IDLE";
  const busy = state !== "IDLE" && !outcome;

  return { state, progress, outcome, busy, run, reset };
}
