"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import AppUpdatePrompt, { type AppUpdatePromptState } from "@/components/AppUpdatePrompt";
import { checkAndroidAppUpdate } from "@/lib/app-shell-update-check";
import { fetchAndroidReleaseInfo } from "@/lib/app-shell-version";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { triggerAppHaptic } from "@/lib/app-haptics";

export default function CabinetAppVersion() {
  const [installed, setInstalled] = useState<{ version: string; build: string } | null>(null);
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof fetchAndroidReleaseInfo>>>(null);
  const [update, setUpdate] = useState<AppUpdatePromptState | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!shouldUseAppShellClient()) return;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        setInstalled({ version: info.version, build: info.build });
      } catch {
        /* web */
      }
      setRemote(await fetchAndroidReleaseInfo());
    })();
  }, []);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    void triggerAppHaptic("light");
    const next = await checkAndroidAppUpdate();
    setUpdate(next);
    setRemote(await fetchAndroidReleaseInfo());
    setChecking(false);
  }, []);

  if (!shouldUseAppShellClient()) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">Приложение</h3>
      <dl className="mt-2 space-y-1 text-xs text-gray-400">
        <div className="flex justify-between gap-3">
          <dt>Установлено</dt>
          <dd className="text-gray-200">
            {installed ? `${installed.version} (${installed.build})` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>На сервере</dt>
          <dd className="text-gray-200">
            {remote ? `${remote.versionName} (${remote.versionCode})` : "—"}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-3 py-2 text-xs font-medium text-aura-champagne"
        disabled={checking}
        onClick={() => void handleCheck()}
      >
        <RefreshCw className={`h-3.5 w-3.5${checking ? " animate-spin" : ""}`} aria-hidden />
        Проверить обновление
      </button>
      {update ? (
        <div className="mt-3">
          <AppUpdatePrompt update={update} onDismiss={() => setUpdate(null)} />
        </div>
      ) : null}
    </section>
  );
}
