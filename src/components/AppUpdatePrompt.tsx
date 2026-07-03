"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import {
  downloadAndInstallApk,
  grantForcedUpdateGrace,
  markUpdateInstallFailed,
  openApkDownloadPage,
  openAppUninstallSettings,
  openPlayStoreUpdate,
  REINSTALL_UPDATE_HINT,
  UPDATE_SIGNATURE_MISMATCH,
} from "@/lib/app-update";
import { triggerAppHaptic } from "@/lib/app-haptics";

export type AppUpdatePromptState = {
  apkUrl: string;
  releaseNotes: string;
  versionName: string;
  versionCode: number;
  forced: boolean;
  playStoreUrl?: string;
  updateChannel?: "auto" | "play" | "apk";
  needsReinstall?: boolean;
  initialError?: string;
  installedBuildCode?: number;
};

type AppUpdatePromptProps = {
  update: AppUpdatePromptState;
  onDismiss?: () => void;
  onGraceContinue?: () => void;
};

type Phase = "idle" | "download" | "awaiting_confirm";

function parseReleaseNotes(notes: string): string[] {
  return notes
    .split(/\n|•|·|—/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 5);
}

function ctaLabel(phase: Phase, usePlayStore: boolean): string {
  if (usePlayStore) return "Обновить в Google Play";
  if (phase === "awaiting_confirm") return "Ждём подтверждения…";
  if (phase === "download") return "Скачиваем…";
  return "Скачать обновление";
}

function shouldUsePlayStore(update: AppUpdatePromptState): boolean {
  if (update.needsReinstall) return false;
  if (update.updateChannel === "play") return true;
  if (update.updateChannel === "apk") return false;
  return Boolean(update.playStoreUrl);
}

export default function AppUpdatePrompt({ update, onDismiss, onGraceContinue }: AppUpdatePromptProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(update.initialError ?? null);
  const usePlayStore = shouldUsePlayStore(update);
  const bullets = useMemo(() => parseReleaseNotes(update.releaseNotes), [update.releaseNotes]);
  const busy = phase === "download";
  const signatureMismatch = error === UPDATE_SIGNATURE_MISMATCH || Boolean(update.needsReinstall);

  useEffect(() => {
    let handle: { remove: () => void } | undefined;
    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        setPhase((current) => (current === "download" || current === "awaiting_confirm" ? "idle" : current));
        setProgress(null);
        void App.getInfo().then((info) => {
          const build = Number.parseInt(String(info.build), 10);
          if (Number.isFinite(build) && build >= update.versionCode) {
            setError(null);
            onDismiss?.();
          }
        });
      }).then((listener) => {
        handle = listener;
      });
    });
    return () => handle?.remove();
  }, [onDismiss, update.versionCode]);

  const handleUpdate = async () => {
    if (signatureMismatch) return;
    setError(null);
    void triggerAppHaptic("medium");
    if (usePlayStore) {
      try {
        await openPlayStoreUpdate(update.playStoreUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось открыть Google Play");
      }
      return;
    }
    setPhase("download");
    setProgress(0);
    try {
      await downloadAndInstallApk(update.apkUrl, setProgress);
      setPhase("awaiting_confirm");
      setProgress(null);
      void triggerAppHaptic("light");
    } catch (err) {
      markUpdateInstallFailed(update.versionCode);
      setError(err instanceof Error ? err.message : "Не удалось обновить приложение");
      setPhase("idle");
      setProgress(null);
    }
  };

  const progressBlock =
    busy && !usePlayStore ? (
      <div className="app-shell-update__progress" aria-live="polite">
        <div className="app-shell-update__progress-bar">
          <span
            className="app-shell-update__progress-fill app-shell-update__progress-fill--shimmer"
            style={{ width: `${Math.max(4, progress ?? 8)}%` }}
          />
        </div>
        <span className="app-shell-update__progress-label">
          {progress != null && progress > 0 ? `Загрузка ${progress}%` : "Подключение к серверу…"}
        </span>
      </div>
    ) : null;

  const awaitingBlock =
    phase === "awaiting_confirm" && !signatureMismatch ? (
      <p className="app-shell-update__body app-shell-update__reinstall-hint">
        Откройте системное окно Android и подтвердите установку. Если появилась ошибка о конфликте
        пакетов — удалите Zovus и установите APK заново через браузер.
      </p>
    ) : null;

  const actions = (
    <>
      {error ? (
        <div className="app-shell-update__error-block">
          <p className="app-shell-update__error">
            {signatureMismatch ? "Нужна переустановка приложения" : error}
          </p>
          {signatureMismatch ? (
            <p className="app-shell-update__body app-shell-update__reinstall-hint">{REINSTALL_UPDATE_HINT}</p>
          ) : null}
        </div>
      ) : null}
      {awaitingBlock}
      {progressBlock}
      <div className="app-shell-update__actions">
        {signatureMismatch ? (
          <>
            <button
              type="button"
              className="app-shell-update__cta"
              onClick={() => {
                void triggerAppHaptic("medium");
                void openAppUninstallSettings();
              }}
            >
              Открыть удаление приложения
            </button>
            <button
              type="button"
              className="app-shell-update__dismiss"
              onClick={() => {
                void triggerAppHaptic("light");
                openApkDownloadPage(update.apkUrl);
              }}
            >
              Скачать APK в браузере
            </button>
          </>
        ) : (
          <button
            type="button"
            className="app-shell-update__cta"
            disabled={busy}
            onClick={() => void handleUpdate()}
          >
            {busy ? (
              <Loader2 className="app-shell-update__cta-spin" aria-hidden />
            ) : usePlayStore ? null : (
              <Download className="app-shell-update__cta-icon" aria-hidden />
            )}
            {ctaLabel(phase, usePlayStore)}
          </button>
        )}
        {phase === "awaiting_confirm" && !signatureMismatch ? (
          <button
            type="button"
            className="app-shell-update__dismiss"
            onClick={() => {
              markUpdateInstallFailed(update.versionCode);
              setError(UPDATE_SIGNATURE_MISMATCH);
              setPhase("idle");
            }}
          >
            Была ошибка установки
          </button>
        ) : null}
        {error && !usePlayStore && !signatureMismatch ? (
          <button
            type="button"
            className="app-shell-update__dismiss"
            onClick={() => {
              void triggerAppHaptic("light");
              openApkDownloadPage(update.apkUrl);
            }}
          >
            Скачать в браузере
          </button>
        ) : null}
        {error && update.forced && onGraceContinue ? (
          <button
            type="button"
            className="app-shell-update__dismiss"
            onClick={() => {
              void triggerAppHaptic("light");
              grantForcedUpdateGrace(update.versionCode);
              onGraceContinue();
            }}
          >
            Продолжить без обновления (24 ч)
          </button>
        ) : null}
        {!update.forced && onDismiss ? (
          <button
            type="button"
            className="app-shell-update__dismiss"
            disabled={busy}
            onClick={() => {
              void triggerAppHaptic("light");
              onDismiss();
            }}
          >
            Позже
          </button>
        ) : null}
      </div>
    </>
  );

  const notesBlock =
    bullets.length > 1 ? (
      <ul className="app-shell-update__bullets">
        {bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : (
      <p className="app-shell-update__body">{update.releaseNotes}</p>
    );

  if (update.forced) {
    return (
      <div className="app-shell-update-gate" role="alertdialog" aria-modal="true">
        <div className="app-shell-update-gate__backdrop" aria-hidden />
        <div className="app-shell-update-gate__card">
          <div className="app-shell-update-gate__badge" aria-hidden>
            <Sparkles className="app-shell-update-gate__badge-icon" strokeWidth={1.5} />
          </div>
          <p className="app-shell-update-gate__title">
            {signatureMismatch ? "Нужна переустановка" : "Нужно обновление"}
          </p>
          <p className="app-shell-update-gate__version">
            {update.installedBuildCode != null
              ? `У вас сборка ${update.installedBuildCode} → нужна ${update.versionName} (${update.versionCode})`
              : `${update.versionName} · сборка ${update.versionCode}`}
          </p>
          {notesBlock}
          {actions}
          {!signatureMismatch ? (
            <p className="app-shell-update-gate__hint">
              После загрузки подтвердите установку в системном окне Android.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-update-banner" role="status">
      <div className="app-shell-update-banner__inner">
        {!update.forced && onDismiss ? (
          <button
            type="button"
            className="app-shell-update-banner__close"
            aria-label="Скрыть"
            disabled={busy}
            onClick={onDismiss}
          >
            <X strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        <div className="app-shell-update-banner__copy">
          <p className="app-shell-update-banner__eyebrow">
            {signatureMismatch ? "Переустановка" : "Новая версия"}
          </p>
          <p className="app-shell-update-banner__title">
            {update.installedBuildCode != null
              ? `Сборка ${update.installedBuildCode} → ${update.versionName} (${update.versionCode})`
              : `${update.versionName} · сборка ${update.versionCode}`}
          </p>
          {notesBlock}
        </div>
        {actions}
      </div>
    </div>
  );
}
