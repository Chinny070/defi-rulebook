import { useCallback, useEffect, useState } from "react";
import { CHAIN, CHAIN_NAME } from "../lib/config";

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface WalletState {
  available: boolean;
  address: string | null;
  chainId: string | null;
  wrongNetwork: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

function expectedChainIdHex(): string | null {
  const id = (CHAIN as unknown as { id?: number }).id;
  return typeof id === "number" ? `0x${id.toString(16)}` : null;
}

/**
 * Browser wallet connection.
 *
 * Reading never needs this. Only actions do, and the UI says so rather than
 * gating the explorer behind a connect button.
 */
export function useWallet(): WalletState {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("No browser wallet detected. Install one to take actions; reading needs none.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      setAddress(accounts[0] ?? null);
    };
    const onChain = (...args: unknown[]) => setChainId((args[0] as string) ?? null);
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const expected = expectedChainIdHex();
  const wrongNetwork =
    Boolean(address) && Boolean(expected) && chainId !== null && chainId !== expected;

  return {
    available: Boolean(provider),
    address,
    chainId,
    wrongNetwork,
    connecting,
    error: wrongNetwork ? `Wrong network. Switch your wallet to ${CHAIN_NAME}.` : error,
    connect,
    disconnect,
  };
}
