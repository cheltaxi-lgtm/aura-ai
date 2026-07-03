"use client";

import { useCallback, useEffect, useState } from "react";
import {
  probeAppConnectivity,
  type AppConnectivityReason,
} from "@/lib/app-connectivity";
import { readAppShellFromDocument, shouldUseAppShellClient } from "@/lib/app-shell";

const GRACE_MS = 4_000;
const POLL_MS = 45_000;

type UseAppShellConnectivityOptions = {
  /** Wait until launch splash finished — avoids false blocks during cold start. */
  enabled?: boolean;
};

export function useAppShellConnectivity(
  options: UseAppShellConnectivityOptions = {}
): {
  blocked: AppConnectivityReason | null;
  checking: boolean;
  retry: () => void;
} {
  const enabled = options.enabled !== false;
  const [blocked, setBlocked] = useState<AppConnectivityReason | null>(null);
  const [checking, setChecking] = useState(false);
  const [inShell, setInShell] = useState(false);

  useEffect(() => {
    const sync = () => setInShell(shouldUseAppShellClient() || readAppShellFromDocument());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-shell"] });
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    setBlocked(null);
    setChecking(false);
  }, [enabled]);

  const runProbe = useCallback(async () => {
    if (!enabled || !inShell) {
      if (!inShell) {
        setBlocked(null);
        setChecking(false);
      }
      return;
    }

    setChecking(true);
    const reason = await probeAppConnectivity();
    setBlocked(reason);
    setChecking(false);
  }, [enabled, inShell]);

  useEffect(() => {
    if (!enabled || !inShell) return;
    const grace = window.setTimeout(() => void runProbe(), GRACE_MS);
    const poll = window.setInterval(() => void runProbe(), POLL_MS);
    const onOnline = () => void runProbe();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      clearTimeout(grace);
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, [enabled, inShell, runProbe]);

  useEffect(() => {
    if (!enabled || !inShell) return;
    const cap = (
      window as Window & {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          Plugins?: {
            Network?: {
              addListener: (
                event: "networkStatusChange",
                cb: () => void
              ) => Promise<{ remove: () => void }> | { remove: () => void };
            };
          };
        };
      }
    ).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const network = cap.Plugins?.Network;
    if (!network?.addListener) return;

    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    void Promise.resolve(
      network.addListener("networkStatusChange", () => {
        if (!cancelled) void runProbe();
      })
    )
      .then((listener) => {
        if (cancelled) {
          listener.remove();
          return;
        }
        handle = listener;
      })
      .catch(() => {
        /* plugin unavailable */
      });

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [enabled, inShell, runProbe]);

  return {
    blocked,
    checking,
    retry: () => {
      void runProbe();
    },
  };
}
