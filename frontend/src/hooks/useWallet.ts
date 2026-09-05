import { useCallback, useEffect, useState } from "react";
import { CHAIN, CHAIN_NAME } from "../lib/config";
import { describeWalletError } from "../lib/errors";

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
  switching: boolean;
  error: string | null;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<boolean>;
  disconnect: () => void;
}

const REMEMBER_KEY = "drb.wallet.connected";

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Private mode / storage disabled: connection simply won't survive reload.
  }
}

function wasRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function chainNumericId(): number | null {
  const id = (CHAIN as unknown as { id?: number }).id;
  return typeof id === "number" ? id : null;
}

function expectedChainIdHex(): string | null {
  const id = chainNumericId();
  return id === null ? null : `0x${id.toString(16)}`;
}

/** EIP-3085 params so a wallet that has never seen StudioNet can add it. */
function addChainParams() {
  const c = CHAIN as unknown as {
    id?: number;
    name?: string;
    nativeCurrency?: { name: string; symbol: string; decimals: number };
    rpcUrls?: { default?: { http?: string[] } };
    blockExplorers?: { default?: { url?: string } };
  };
  const hexId = expectedChainIdHex();
  if (!hexId) return null;
  const rpc = c.rpcUrls?.default?.http ?? [];
  const explorer = c.blockExplorers?.default?.url;
  return {
    chainId: hexId,
    chainName: c.name ?? CHAIN_NAME,
    nativeCurrency: c.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: rpc,
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  };
}

/**
 * Browser wallet connection.
 *
 * Reading never needs this. Only actions do, and the UI says so rather than
 * gating the explorer behind a connect button. The connection is remembered
 * across reloads and route changes: if the wallet still authorizes this site,
 * it is restored silently on load without prompting.
 */
export function useWallet(): WalletState {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!provider) {
      setError(
        "No browser wallet detected. Install a wallet (e.g. MetaMask) to take actions; reading the explorer needs none.",
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const next = accounts[0] ?? null;
      setAddress(next);
      remember(Boolean(next));
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(id);
    } catch (err) {
      setError(describeWalletError(err));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const switchNetwork = useCallback(async (): Promise<boolean> => {
    if (!provider) {
      setError("No browser wallet detected.");
      return false;
    }
    const target = expectedChainIdHex();
    if (!target) return false;
    setSwitching(true);
    setError(null);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target }],
      });
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(id);
      return id === target;
    } catch (err) {
      // 4902 = chain unknown to the wallet: add it, then it becomes current.
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        const params = addChainParams();
        if (params) {
          try {
            await provider.request({ method: "wallet_addEthereumChain", params: [params] });
            const id = (await provider.request({ method: "eth_chainId" })) as string;
            setChainId(id);
            return id === target;
          } catch (addErr) {
            setError(describeWalletError(addErr));
            return false;
          }
        }
      }
      setError(describeWalletError(err));
      return false;
    } finally {
      setSwitching(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setError(null);
    remember(false);
  }, []);

  // Eager, promptless reconnect after a reload or deep-link navigation.
  useEffect(() => {
    if (!provider || !wasRemembered()) return;
    let cancelled = false;
    (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (cancelled) return;
        const next = accounts[0] ?? null;
        if (!next) {
          remember(false);
          return;
        }
        setAddress(next);
        const id = (await provider.request({ method: "eth_chainId" })) as string;
        if (!cancelled) setChainId(id);
      } catch {
        // Ignore: user can connect manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      const next = accounts[0] ?? null;
      setAddress(next);
      if (!next) remember(false);
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
    switching,
    error: wrongNetwork ? `Wrong network. Switch your wallet to ${CHAIN_NAME}.` : error,
    connect,
    switchNetwork,
    disconnect,
  };
}
