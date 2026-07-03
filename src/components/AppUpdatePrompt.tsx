"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import {
  downloadAndInstallApk,
  openApkDownloadPage,
  openPlayStoreUpdate,
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
};

type AppUpdatePromptProps = {
  update: AppUpdatePromptState;
  onDismiss?: () => void;
};

type Phase = "idle" | "download" | "install";

function parseReleaseNotes(notes: string): string[] {
  return notes
    .split(/\n|•|·|—/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 5);
}

function ctaLabel(phase: Phase, usePlayStore: boolean): string {
  if (usePlayStore) return "Обновить в Google Play";
  if (phase === "install") return "Устанавливаем…";
  if (phase === "download") return "Скачиваем…";
  return "Скачать обновление";
}

function shouldUsePlayStore(update: AppUpdatePromptState): boolean {
  if (update.updateChannel === "play") return true;
  if (update.updateChannel === "apk") return false;
  return Boolean(update.playStoreUrl);
}

export default function AppUpdatePrompt({ update, onDismiss }: AppUpdatePromptProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usePlayStore = shouldUsePlayStore(update);
  const bullets = useMemo(() => parseReleaseNotes(update.releaseNotes), [update.releaseNotes]);
  const busy = phase !== "idle";

  useEffect(() => {
    if (phase === "download" && progress != null && progress >= 99) {
      setPhase("install");
    }
  }, [phase, progress]);

  const handleUpdate = async () => {
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
      setPhase("install");
      void triggerAppHaptic("heavy");
    } catch (err) {
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
          {phase === "install"
            ? "Запуск установки…"
            : progress != null && progress > 0
              ? `Загрузка ${progress}%`
              : "Подключение к серверу…"}
        </span>
      </div>
    ) : null;

  const actions = (
    <>
      {error ? <p className="app-shell-update__error">{error}</p> : null}
      {progressBlock}
      <div className="app-shell-update__actions">
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
        {error && !usePlayStore ? (
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
          <p className="app-shell-update-gate__title">Нужно обновление</p>
          <p className="app-shell-update-gate__version">Версия {update.versionName}</p>
          {notesBlock}
          {actions}
          <p className="app-shell-update-gate__hint">
            После загрузки подтвердите установку в системном окне Android.
          </p>
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
          <p className="app-shell-update-banner__eyebrow">Новая версия</p>
          <p className="app-shell-update-banner__title">{update.versionName}</p>
          {notesBlock}
        </div>
        {actions}
      </div>
    </div>
  );
}
