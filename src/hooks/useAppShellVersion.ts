"use client";

import { useEffect, useState } from "react";
import {
  fetchAndroidReleaseInfo,
  getInstalledAppVersion,
  type AndroidReleaseInfo,
  type InstalledAppVersion,
} from "@/lib/app-shell-version";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";
import { waitForNativeCapacitor } from "@/lib/app-shell-update-check";

export const APP_UPDATE_RECHECK_EVENT = "zovus:check-app-update";

/** True only inside the installed Android app (Capacitor), not in browser with ?app=1. */
export function useNativeCapacitorApp() {
  const [native, setNative] = useState(() => isNativeCapacitorPlatform());

  useEffect(() => {
    if (native) return;
    let cancelled = false;
    void waitForNativeCapacitor(500).then((ok) => {
      if (!cancelled) setNative(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [native]);

  return native;
}

export function useAppShellVersion() {
  const nativeApp = useNativeCapacitorApp();
  const [installed, setInstalled] = useState<InstalledAppVersion | null>(null);
  const [remote, setRemote] = useState<AndroidReleaseInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!nativeApp) return;
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
  }, [nativeApp]);

  return { installed, remote, ready };
}
