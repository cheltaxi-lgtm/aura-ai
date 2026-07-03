"use client";

import { useEffect, useState } from "react";
import {
  fetchAndroidReleaseInfo,
  getInstalledAppVersion,
  type AndroidReleaseInfo,
  type InstalledAppVersion,
} from "@/lib/app-shell-version";
import { shouldUseAppShellClient } from "@/lib/app-shell";

export const APP_UPDATE_RECHECK_EVENT = "zovus:check-app-update";

export function useAppShellVersion() {
  const [installed, setInstalled] = useState<InstalledAppVersion | null>(null);
  const [remote, setRemote] = useState<AndroidReleaseInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!shouldUseAppShellClient()) return;
    let cancelled = false;

    void (async () => {
      const [inst, rel] = await Promise.all([
        getInstalledAppVersion(),
        fetchAndroidReleaseInfo(),
      ]);
      if (cancelled) return;
      setInstalled(inst);
      setRemote(rel);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { installed, remote, ready };
}
