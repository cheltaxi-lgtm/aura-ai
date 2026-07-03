"use client";

import { useCallback, useEffect, useState } from "react";
import {
  probeAppConnectivity,
  type AppConnectivityReason,
} from "@/lib/app-connectivity";
import { readAppShellFromDocument, shouldUseAppShellClient } from "@/lib/app-shell";

const GRACE_MS = 8_000;
const POLL_MS = 30_000;
const FAIL_THRESHOLD = 4;

export function useAppShellConnectivity(): {
  blocked: AppConnectivityReason | null;
  checking: boolean;
  retry: () => void;
} {
  const [blocked, setBlocked] = useState<AppConnectivityReason | null>(null);
  const [checking, setChecking] = useState(true);
  const [failStreak, setFailStreak] = useState(0);
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

  const runProbe = useCallback(async () => {
    if (!inShell) {
      setBlocked(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const reason = await probeAppConnectivity();
    if (reason) {
      setFailStreak((n) => {
        const next = n + 1;
        if (next >= FAIL_THRESHOLD) setBlocked(reason);
        return next;
      });
    } else {
      setFailStreak(0);
      setBlocked(null);
    }
    setChecking(false);
  }, [inShell]);

  useEffect(() => {
    if (!inShell) return;
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
  }, [inShell, runProbe]);

  return {
    blocked,
    checking,
    retry: () => {
      setFailStreak(0);
      void runProbe();
    },
  };
}
