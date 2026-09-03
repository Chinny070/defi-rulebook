import { createContext, useContext } from "react";
import type { WalletState } from "./hooks/useWallet";

const fallback: WalletState = {
  available: false,
  address: null,
  chainId: null,
  wrongNetwork: false,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
};

export const WalletContext = createContext<WalletState>(fallback);

export function useWalletContext(): WalletState {
  return useContext(WalletContext);
}
