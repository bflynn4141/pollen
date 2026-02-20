"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface WalletState {
  isConnected: boolean;
  address: string | null;
  isLoading: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  isConnected: false,
  address: null,
  isLoading: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const connect = useCallback(() => {
    // Para modal opening is handled by ConnectButton — this is a placeholder
    // for wallet state that gets set after Para connect completes
    setIsLoading(true);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsLoading(false);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected: !!address,
        address,
        isLoading,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

/**
 * Internal setter — called by ParaProvider after connection.
 * Not exposed to consumer components.
 */
export function _setConnectedAddress(setter: (addr: string | null) => void) {
  return setter;
}
