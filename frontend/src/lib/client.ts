/** GenLayer client. Direct contract access only - there is no backend. */

import { createAccount, createClient } from "genlayer-js";
import { CHAIN, CHAIN_NAME, CONTRACT_ADDRESS } from "./config";

type AnyClient = {
  readContract: (args: {
    address: string;
    functionName: string;
    args: unknown[];
  }) => Promise<unknown>;
  writeContract: (args: {
    address: string;
    functionName: string;
    args: unknown[];
    value?: bigint;
  }) => Promise<string>;
  waitForTransactionReceipt: (args: {
    hash: string;
    status?: string;
    retries?: number;
    interval?: number;
  }) => Promise<unknown>;
  connect?: (chain: string) => Promise<unknown>;
};

let readClient: AnyClient | null = null;

/** A read-only client. Uses a throwaway account: views cost nothing. */
export function getReadClient(): AnyClient {
  if (!readClient) {
    readClient = createClient({
      chain: CHAIN,
      account: createAccount(),
    }) as unknown as AnyClient;
  }
  return readClient;
}

/**
 * True when an error is only about MetaMask Snap methods being unsupported.
 *
 * genlayer-js `connect()` calls `wallet_getSnaps` / `wallet_requestSnaps`,
 * which exist only in MetaMask. Non-MetaMask wallets answer with JSON-RPC
 * -32601 ("method has no corresponding handler"). The Snap is a signing
 * convenience, not a requirement: the underlying write is a normal EVM
 * transaction to the consensus contract, which any wallet on StudioNet can
 * sign. So this specific failure is tolerated and the write proceeds.
 */
function isSnapUnsupported(err: unknown): boolean {
  const e = (err ?? {}) as { code?: number; message?: string };
  if (e.code === -32601) return true;
  const msg = (e.message ?? String(err ?? "")).toLowerCase();
  return msg.includes("wallet_getsnaps") || msg.includes("wallet_requestsnaps") || msg.includes("snap");
}

/** A client bound to a connected browser wallet, for writes. */
export async function getWriteClient(address: string): Promise<AnyClient> {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const client = createClient({
    chain: CHAIN,
    account: address as `0x${string}`,
    ...(provider ? { provider } : {}),
  } as Parameters<typeof createClient>[0]) as unknown as AnyClient;
  if (client.connect) {
    try {
      // connect() adds/switches to StudioNet, then requests the GenLayer Snap.
      await client.connect(CHAIN_NAME);
    } catch (err) {
      if (!isSnapUnsupported(err)) throw err;
      // Snap unsupported: make sure the wallet is on StudioNet ourselves, then
      // fall through to sign a plain EVM transaction.
      await ensureChain(provider);
    }
  }
  return client;
}

/** EIP-3085/3326: add StudioNet if unknown, then switch to it. */
async function ensureChain(provider: typeof window.ethereum): Promise<void> {
  if (!provider) return;
  const c = CHAIN as unknown as {
    id?: number;
    name?: string;
    nativeCurrency?: { name: string; symbol: string; decimals: number };
    rpcUrls?: { default?: { http?: string[] } };
    blockExplorers?: { default?: { url?: string } };
  };
  if (typeof c.id !== "number") return;
  const chainId = `0x${c.id.toString(16)}`;
  try {
    const current = (await provider.request({ method: "eth_chainId" })) as string;
    if (current === chainId) return;
  } catch {
    // fall through and try to switch
  }
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: c.name ?? CHAIN_NAME,
            nativeCurrency: c.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
            rpcUrls: c.rpcUrls?.default?.http ?? [],
            ...(c.blockExplorers?.default?.url ? { blockExplorerUrls: [c.blockExplorers.default.url] } : {}),
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export class ContractNotConfiguredError extends Error {
  constructor() {
    super(
      "No contract address configured. Set VITE_CONTRACT_ADDRESS to the deployed DEFI RULEBOOK address.",
    );
    this.name = "ContractNotConfiguredError";
  }
}

export function requireAddress(): string {
  if (!CONTRACT_ADDRESS) throw new ContractNotConfiguredError();
  return CONTRACT_ADDRESS;
}
