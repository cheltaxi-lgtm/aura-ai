"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  probeAppConnectivity,
  isNativeCapacitorClient,
  type AppConnectivityReason,
} from "@/lib/app-connectivity";
import { readAppShellFromDocument, shouldUseAppShellClient } from "@/lib/app-shell";

const GRACE_MS = 6_000;
const POLL_MS = 60_000;
const NETWORK_CHANGE_DEBOUNCE_MS = 2_500;
/** Consecutive automatic probe failures before the full-screen gate appears. */
const FAILURE_THRESHOLD = 5;

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
  const failureStreakRef = useRef(0);

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
    failureStreakRef.current = 0;
  }, [enabled]);

  const runProbe = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!enabled || !inShell) {
        if (!inShell) {
          setBlocked(null);
          setChecking(false);
          failureStreakRef.current = 0;
        }
        return;
      }

      setChecking(true);
      const reason = await probeAppConnectivity({
        bootstrap: !isNativeCapacitorClient(),
      });

      if (reason === null) {
        failureStreakRef.current = 0;
        setBlocked(null);
      } else if (opts?.force) {
        failureStreakRef.current = FAILURE_THRESHOLD;
        setBlocked(reason);
      } else {
        failureStreakRef.current += 1;
        if (failureStreakRef.current >= FAILURE_THRESHOLD) {
          setBlocked(reason);
        }
      }
      setChecking(false);
    },
    [enabled, inShell]
  );

  useEffect(() => {
    if (!enabled || !inShell) return;
    if (!isNativeCapacitorClient()) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        failureStreakRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const grace = window.setTimeout(() => void runProbe(), GRACE_MS);
    const poll = window.setInterval(() => void runProbe(), POLL_MS);
    const onOnline = () => void runProbe();
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(grace);
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
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
    let debounceTimer: number | undefined;
    void Promise.resolve(
      network.addListener("networkStatusChange", () => {
        if (cancelled) return;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          if (!cancelled) void runProbe();
        }, NETWORK_CHANGE_DEBOUNCE_MS);
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
      if (debounceTimer) window.clearTimeout(debounceTimer);
      handle?.remove();
    };
  }, [enabled, inShell, runProbe]);

  return {
    blocked,
    checking,
    retry: () => {
      void runProbe({ force: true });
    },
  };
}
