"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import ShareSheet from "@/components/share/ShareSheet";
import type { SharePayload } from "@/lib/share/types";
import type { ShareChannelSettings } from "@/lib/share/settings";

const DEFAULT_CHANNELS: ShareChannelSettings = {
  telegram: true,
  vk: true,
  native: true,
  copy: true,
  download: false,
};

interface ShareContextValue {
  openShare: (payload: SharePayload) => void;
  closeShare: () => void;
  /** Admin "share" feature toggle — buttons hide entirely when false. */
  enabled: boolean;
  channels: ShareChannelSettings;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export function ShareProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [channels, setChannels] = useState<ShareChannelSettings>(DEFAULT_CHANNELS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/share/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean; channels?: ShareChannelSettings } | null) => {
        if (cancelled || !data) return;
        if (typeof data.enabled === "boolean") setEnabled(data.enabled);
        if (data.channels) setChannels({ ...DEFAULT_CHANNELS, ...data.channels });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const openShare = useCallback((next: SharePayload) => {
    setPayload(next);
  }, []);

  const closeShare = useCallback(() => {
    setPayload(null);
  }, []);

  return (
    <ShareContext.Provider value={{ openShare, closeShare, enabled, channels }}>
      {children}
      <ShareSheet payload={payload} onClose={closeShare} channels={channels} />
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
