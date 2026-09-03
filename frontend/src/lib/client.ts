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

/** A client bound to a connected browser wallet, for writes. */
export async function getWriteClient(address: string): Promise<AnyClient> {
  const client = createClient({
    chain: CHAIN,
    account: address as `0x${string}`,
  }) as unknown as AnyClient;
  if (client.connect) {
    await client.connect(CHAIN_NAME);
  }
  return client;
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
