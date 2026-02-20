"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const PARA_API_KEY = process.env.NEXT_PUBLIC_PARA_API_KEY || "";

const ParaReadyContext = createContext(false);

export function useParaReady() {
  return useContext(ParaReadyContext);
}

/**
 * Dynamically loads @getpara/react-sdk only when PARA_API_KEY is set.
 * SDK loads lazily — not in the critical render path.
 *
 * For Phase 0, this is a no-op wrapper since the SDK isn't installed.
 * When ready to integrate:
 *   1. pnpm add @getpara/react-sdk
 *   2. Set NEXT_PUBLIC_PARA_API_KEY in .env.local
 *   3. Uncomment the dynamic import block below
 */
export default function ParaWrapper({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!PARA_API_KEY) return;

    // Uncomment when @getpara/react-sdk is installed:
    // import("@getpara/react-sdk").then(({ ParaProvider }) => {
    //   setParaWrap(...)
    // });
    setReady(true);
  }, []);

  return (
    <ParaReadyContext.Provider value={ready}>
      {children}
    </ParaReadyContext.Provider>
  );
}
