"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import PaywallModal, { type PaywallOpenOptions } from "@/components/PaywallModal";
import RateLimitToast from "@/components/RateLimitToast";
import { rateLimitMessage } from "@/lib/rate-limit-messages";

type RateLimitToastState = {
  message: string;
  retryAfter: number;
} | null;

interface PaywallContextValue {
  openPaywall: (options?: PaywallOpenOptions) => void;
  closePaywall: () => void;
  showRateLimit: (action?: string, retryAfter?: number) => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<PaywallOpenOptions>({});
  const [rateLimitToast, setRateLimitToast] = useState<RateLimitToastState>(null);
  const onCloseRef = useRef<(() => void | Promise<void>) | undefined>(undefined);

  const openPaywall = useCallback((opts?: PaywallOpenOptions) => {
    onCloseRef.current = opts?.onClose;
    setOptions(opts ?? {});
    setIsOpen(true);
  }, []);

  const closePaywall = useCallback(() => {
    setIsOpen(false);
    const onClose = onCloseRef.current;
    onCloseRef.current = undefined;
    if (onClose) void onClose();
  }, []);

  const showRateLimit = useCallback((action?: string, retryAfter?: number) => {
    setRateLimitToast({
      message: rateLimitMessage(action),
      retryAfter: retryAfter ?? 60,
    });
  }, []);

  return (
    <PaywallContext.Provider value={{ openPaywall, closePaywall, showRateLimit }}>
      {children}
      <PaywallModal
        isOpen={isOpen}
        onClose={closePaywall}
        options={options}
      />
      <RateLimitToast toast={rateLimitToast} onDismiss={() => setRateLimitToast(null)} />
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error("usePaywall must be used within PaywallProvider");
  }
  return ctx;
}

/** Safe hook for components that may render outside provider during SSR. */
export function usePaywallOptional(): PaywallContextValue | null {
  return useContext(PaywallContext);
}
