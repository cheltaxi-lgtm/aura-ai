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

function useAppShellVersion() {
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

/**
 * Fixed strip above the tab bar (or at the bottom in chat) — always visible in the app shell.
 */
export function AppShellVersionBar() {
  const { installed, remote, ready } = useAppShellVersion();

  const updateAvailable =
    installed !== null && remote !== null && remote.versionCode > installed.versionCode;

  const versionLabel = installed
    ? `v${installed.versionName} (${installed.versionCode})`
    : remote
      ? `сборка ${remote.versionCode}`
      : ready
        ? "версия не определена"
        : "…";

  return (
    <div className="app-shell-version-bar" role="contentinfo" aria-live="polite">
      <span className="app-shell-version-bar__current">Zovus {versionLabel}</span>
      {updateAvailable && remote ? (
        <button
          type="button"
          className="app-shell-version-bar__update"
          onClick={() => window.dispatchEvent(new Event(APP_UPDATE_RECHECK_EVENT))}
        >
          обновление v{remote.versionName}
        </button>
      ) : ready && installed ? (
        <span className="app-shell-version-bar__ok">актуально</span>
      ) : null}
    </div>
  );
}

/** @deprecated Layout footer — use AppShellVersionBar in AppShellBridge instead. */
export default function AppShellVersionFooter() {
  return <AppShellVersionBar />;
}
