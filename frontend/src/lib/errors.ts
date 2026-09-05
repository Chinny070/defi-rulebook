/**
 * Turn raw wallet / RPC errors into a specific, actionable sentence.
 *
 * A steward (or any user) should never see a bare stack message: every failure
 * path here says what happened and what to do next.
 */

interface ProviderError {
  code?: number;
  message?: string;
  data?: { message?: string };
  shortMessage?: string;
}

export function describeWalletError(err: unknown): string {
  const e = (err ?? {}) as ProviderError;
  const raw = (e.shortMessage || e.message || e.data?.message || String(err) || "").toLowerCase();

  switch (e.code) {
    case 4001:
      return "You rejected the request in your wallet. Nothing was sent.";
    case 4100:
      return "Your wallet has not authorized this action. Reconnect and try again.";
    case 4902:
      return "StudioNet is not in your wallet yet. Use “Switch to StudioNet” to add it.";
    case -32002:
      return "A wallet request is already pending. Open your wallet and finish (or dismiss) it, then retry.";
    case -32603:
      return "Your wallet could not reach the network. Check its RPC/connection and retry.";
    default:
      break;
  }

  if (raw.includes("user rejected") || raw.includes("user denied")) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  if (raw.includes("insufficient") && raw.includes("fund")) {
    return "This account does not have enough GEN to cover the bond plus fees on StudioNet.";
  }
  if (raw.includes("insufficient")) {
    return "The account balance is too low to complete this action on StudioNet.";
  }
  if (raw.includes("chain") && (raw.includes("mismatch") || raw.includes("wrong"))) {
    return "Your wallet is on the wrong network. Switch to StudioNet and retry.";
  }
  if (raw.includes("nonce")) {
    return "A pending transaction is blocking this one. Wait for it to settle (or reset the account nonce) and retry.";
  }
  if (raw.includes("timeout") || raw.includes("timed out")) {
    return "The network did not respond in time. The outcome is unknown — reload the page to check current state before retrying.";
  }

  const msg = e.shortMessage || e.message || e.data?.message;
  return msg ? `The wallet reported: ${msg}` : "The wallet request failed. Check your wallet and retry.";
}
