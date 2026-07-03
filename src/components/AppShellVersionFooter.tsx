"use client";

import { useEffect, useState } from "react";
import {
  fetchAndroidReleaseInfo,
  getInstalledAppVersion,
  type AndroidReleaseInfo,
  type InstalledAppVersion,
} from "@/lib/app-shell-version";

export const APP_UPDATE_RECHECK_EVENT = "zovus:check-app-update";

/**
 * Compact footer for the native app shell: shows the installed app version and,
 * when the server has a newer build, a tap-to-update link that re-opens the
 * update prompt (even if it was dismissed earlier in the session).
 */
export default function AppShellVersionFooter() {
  const [installed, setInstalled] = useState<InstalledAppVersion | null>(null);
  const [remote, setRemote] = useState<AndroidReleaseInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [inst, rel] = await Promise.all([
        getInstalledAppVersion(),
        fetchAndroidReleaseInfo(),
      ]);
      if (cancelled) return;
      setInstalled(inst);
      setRemote(rel);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!installed) return null;

  const updateAvailable = remote !== null && remote.versionCode > installed.versionCode;

  return (
    <footer className="app-version-footer" role="contentinfo">
      <span className="app-version-footer__current">
        Zovus&nbsp;v{installed.versionName}&nbsp;({installed.versionCode})
      </span>
      {updateAvailable ? (
        <button
          type="button"
          className="app-version-footer__update"
          onClick={() => window.dispatchEvent(new Event(APP_UPDATE_RECHECK_EVENT))}
        >
          Доступно обновление v{remote.versionName} ({remote.versionCode}) — установить
        </button>
      ) : (
        <span className="app-version-footer__latest">актуальная версия</span>
      )}
    </footer>
  );
}
