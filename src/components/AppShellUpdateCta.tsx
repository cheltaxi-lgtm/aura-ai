"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import AppUpdatePrompt, { type AppUpdatePromptState } from "@/components/AppUpdatePrompt";
import {
  APP_UPDATE_RECHECK_EVENT,
  useAppShellVersion,
  useNativeCapacitorApp,
} from "@/hooks/useAppShellVersion";
import { checkAndroidAppUpdate } from "@/lib/app-shell-update-check";
import { triggerAppHaptic } from "@/lib/app-haptics";

type Variant = "bar" | "cabinet" | "inline";

type Props = {
  variant?: Variant;
  className?: string;
};

/** Unified update CTA for app shell bar and cabinet. */
export default function AppShellUpdateCta({ variant = "inline", className = "" }: Props) {
  const nativeApp = useNativeCapacitorApp();
  const { installed, remote, ready } = useAppShellVersion();
  const [update, setUpdate] = useState<AppUpdatePromptState | null>(null);
  const [checking, setChecking] = useState(false);

  const updateAvailable =
    installed !== null && remote !== null && remote.versionCode > installed.versionCode;

  const handleCheck = useCallback(async () => {
    setChecking(true);
    void triggerAppHaptic("light");
    const next = await checkAndroidAppUpdate({ ignoreDismissed: true });
    setUpdate(next);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (variant !== "inline") return;
    const onRecheck = () => void handleCheck();
    window.addEventListener(APP_UPDATE_RECHECK_EVENT, onRecheck);
    return () => window.removeEventListener(APP_UPDATE_RECHECK_EVENT, onRecheck);
  }, [handleCheck, variant]);

  if (!nativeApp) return null;

  if (variant === "bar") {
    const versionLabel = installed
      ? `v${installed.versionName} (${installed.versionCode})`
      : remote
        ? `сборка ${remote.versionCode}`
        : ready
          ? "версия не определена"
          : "…";

    return (
      <div className={`app-shell-version-bar ${className}`.trim()} role="contentinfo" aria-live="polite">
        <span className="app-shell-version-bar__current">Zovus {versionLabel}</span>
        {updateAvailable && remote ? (
          <button
            type="button"
            className="app-shell-version-bar__update min-h-11 touch-manipulation"
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

  if (variant === "cabinet") {
    return (
      <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`.trim()}>
        <h3 className="text-sm font-semibold text-white">Приложение</h3>
        <dl className="mt-2 space-y-1 text-xs text-gray-400">
          <div className="flex justify-between gap-3">
            <dt>Установлено</dt>
            <dd className="text-gray-200">
              {installed ? `${installed.versionName} · сборка ${installed.versionCode}` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>На сервере</dt>
            <dd className="text-gray-200">
              {remote ? `${remote.versionName} · сборка ${remote.versionCode}` : "—"}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-2.5 text-xs font-medium text-aura-champagne touch-manipulation"
          disabled={checking}
          onClick={() => void handleCheck()}
        >
          {checking ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {updateAvailable ? "Скачать обновление" : "Проверить обновление"}
        </button>
        {update ? (
          <div className="mt-3">
            <AppUpdatePrompt update={update} onDismiss={() => setUpdate(null)} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-2.5 text-xs font-medium text-aura-champagne touch-manipulation ${className}`.trim()}
      disabled={checking}
      onClick={() => void handleCheck()}
    >
      <RefreshCw className={`h-4 w-4${checking ? " animate-spin" : ""}`} aria-hidden />
      Проверить обновление
    </button>
  );
}
