"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import ShareSheet from "@/components/share/ShareSheet";
import type { SharePayload } from "@/lib/share/types";

interface ShareContextValue {
  openShare: (payload: SharePayload) => void;
  closeShare: () => void;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export function ShareProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);

  const openShare = useCallback((next: SharePayload) => {
    setPayload(next);
  }, []);

  const closeShare = useCallback(() => {
    setPayload(null);
  }, []);

  return (
    <ShareContext.Provider value={{ openShare, closeShare }}>
      {children}
      <ShareSheet payload={payload} onClose={closeShare} />
    </ShareContext.Provider>
  );
}

export function useShare(): ShareContextValue {
  const ctx = useContext(ShareContext);
  if (!ctx) {
    throw new Error("useShare must be used within ShareProvider");
  }
  return ctx;
}

export function useShareOptional(): ShareContextValue | null {
  return useContext(ShareContext);
}
