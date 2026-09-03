/** Runtime configuration. There is no backend: everything comes from env. */

import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;

export type ChainName = keyof typeof CHAINS;

function resolveChainName(): ChainName {
  const raw = (import.meta.env.VITE_CHAIN ?? "studionet") as string;
  return (raw in CHAINS ? raw : "studionet") as ChainName;
}

export const CHAIN_NAME = resolveChainName();
export const CHAIN = CHAINS[CHAIN_NAME];

/**
 * Empty until the contract is deployed. The app stays usable and says so
 * plainly, rather than rendering empty lists as though the registry were empty.
 */
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? "").trim();

export const IS_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

/** Mirrors the page cap the contract enforces; the contract clamps anyway. */
export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
