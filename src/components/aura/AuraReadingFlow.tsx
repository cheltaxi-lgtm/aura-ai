"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ImagePlus, Loader2, RefreshCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";

import AuraHalo from "@/components/aura/AuraHalo";
import AuraMap from "@/components/aura/AuraMap";
import CrossProductNextSteps from "@/components/CrossProductNextSteps";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { canAffordRunes } from "@/lib/rune-afford-client";
import { compressImageForUpload } from "@/lib/compress-image-client";
import { isAppCameraAvailable, pickPhotoFromApp } from "@/lib/app-camera";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import { parseInsufficientRunes } from "@/lib/api-errors";
import { confirmAgeGateOnServer, fetchServerAgeGateConfirmed } from "@/lib/age-gate";
import { trackProductFunnel } from "@/lib/seo/product-funnel";
import {
  AURA_VERDICT_LABELS,
  type AuraSnapshot,
  type AuraTeaserSnapshot,
} from "@/lib/aura-constants";

type FlowStep =
  | "capture"
  | "processing"
  | "teaser"
  | "claimed"
  | "paying"
  | "report"
  | "error";

type AuraPricing = {
  baseCost: number;
  effectiveCost: number;
  firstAuraDiscount: boolean;
};

/** Teaser subset pre-payment; layers/chakras arrive with the paid report. */
type FlowSnapshot = AuraTeaserSnapshot &
  Partial<Pick<AuraSnapshot, "layers" | "chakras">>;

/** Light archive row from GET /api/aura/readings. */
type AuraPastItem = {
  snapshotId: string | null;
  historyId: string | null;
  paid: boolean;
  createdAt: string;
  dominantColor: { key: string; name: string; hex: string } | null;
  verdict: keyof typeof AURA_VERDICT_LABELS | null;
  teaser: string | null;
};

function formatPastDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

const PROCESSING_PHRASES = [
  "Считываю цветовое поле…",
  "Сверяю слои и чакры…",
  "Собираю снимок вашей ауры…",
] as const;

const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_POLL_TIMEOUT_MS = 300_000;

function formatRunes(n: number): string {
  return `${n} ᚢ`;
}

export default function AuraReadingFlow() {
  const { isLoggedIn, loading: authLoading, refresh: refreshAuth } = useAuth();
  const { config } = useRuneConfig();

  const [step, setStep] = useState<FlowStep>("capture");
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FlowSnapshot | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [pricing, setPricing] = useState<AuraPricing | null>(null);
  const [runeBalance, setRuneBalance] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [pastReadings, setPastReadings] = useState<AuraPastItem[] | null>(null);
  const [openingPast, setOpeningPast] = useState(false);
  const [deletingPastId, setDeletingPastId] = useState<string | null>(null);
  const [confirmPastDeleteId, setConfirmPastDeleteId] = useState<string | null>(null);
  // null = still resolving; guests without the consent cookie get the inline
  // gate BEFORE shooting a photo instead of a failed upload after.
  const [ageReady, setAgeReady] = useState<boolean | null>(null);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [reusedKind, setReusedKind] = useState<"today" | "photo" | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const claimAttemptedRef = useRef(false);
  const pendingFileRef = useRef<File | Blob | null>(null);

  const auraCost = pricing?.effectiveCost ?? config.costs.AURA_READING ?? 50;
  const auraBaseCost = pricing?.baseCost ?? config.costs.AURA_READING ?? 50;

  // Rotate processing phrases.
  useEffect(() => {
    if (step !== "processing" && step !== "paying") return;
    const t = window.setInterval(
      () => setPhraseIdx((i) => (i + 1) % PROCESSING_PHRASES.length),
      2600
    );
    return () => window.clearInterval(t);
  }, [step]);

  // Cleanup camera stream + object URL + polling on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pollAbortRef.current?.abort();
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load pricing + balance once auth state is known.
  useEffect(() => {
    if (authLoading) return;
    void fetch("/api/aura/pricing", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.effectiveCost === "number") {
          setPricing({
            baseCost: data.baseCost,
            effectiveCost: data.effectiveCost,
            firstAuraDiscount: data.firstAuraDiscount === true,
          });
        }
      })
      .catch(() => undefined);
    if (isLoggedIn) {
      void fetch("/api/runes/balance", { credentials: "include", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (typeof data?.balance === "number") setRuneBalance(data.balance);
        })
        .catch(() => undefined);
    }
  }, [authLoading, isLoggedIn]);

  // Age gate: logged-in users are authorized server-side per profile; guests
  // need the HttpOnly consent cookie — resolve it upfront so the inline gate
  // appears before they shoot a photo, not after a rejected upload.
  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      setAgeReady(true);
      return;
    }
    let cancelled = false;
    void fetchServerAgeGateConfirmed().then((ok) => {
      if (!cancelled) setAgeReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn]);

  // Post-auth resume: claim the guest snapshot bound by the HttpOnly cookie.
  // Idempotent — NO_CLAIM_TOKEN simply means there is nothing to resume.
  useEffect(() => {
    if (authLoading || !isLoggedIn || claimAttemptedRef.current) return;
    claimAttemptedRef.current = true;
    void fetch("/api/aura/claim", { method: "POST", credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.ok && data.snapshot && typeof data.snapshotId === "string") {
          setSnapshot(data.snapshot as FlowSnapshot);
          setSnapshotId(data.snapshotId);
          setStep("claimed");
          trackProductFunnel("claim_complete", { product: "aura", source: "aura_flow" });
        }
      })
      .catch(() => undefined);
  }, [authLoading, isLoggedIn]);

  // Past auras archive — loaded whenever the capture step is shown to a
  // logged-in user (covers initial visit and post-reading reset).
  useEffect(() => {
    if (authLoading || !isLoggedIn || step !== "capture") return;
    let cancelled = false;
    void fetch("/api/aura/readings", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.readings)) return;
        setPastReadings(data.readings as AuraPastItem[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn, step]);

  // Auto-clear the two-tap delete confirm.
  useEffect(() => {
    if (!confirmPastDeleteId) return;
    const timer = window.setTimeout(() => setConfirmPastDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmPastDeleteId]);

  const resetAll = useCallback(() => {
    pollAbortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setSnapshot(null);
    setSnapshotId(null);
    setReport(null);
    setReusedKind(null);
    setError(null);
    setStep("capture");
  }, [photoUrl]);

  const openPast = useCallback(async (item: AuraPastItem) => {
    const id = item.historyId ?? item.snapshotId;
    if (!id) return;
    setError(null);
    setOpeningPast(true);
    try {
      const res = await fetch(`/api/aura/readings/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const entry = data?.entry;
      if (!res.ok || !entry?.snapshot) {
        setError("Не удалось открыть сохранённую ауру. Попробуйте ещё раз.");
        return;
      }
      setSnapshot(entry.snapshot as FlowSnapshot);
      setSnapshotId(typeof entry.snapshotId === "string" ? entry.snapshotId : null);
      setReport(typeof entry.report === "string" ? entry.report : null);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(null);
      setStep(entry.report ? "report" : "claimed");
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setOpeningPast(false);
    }
  }, [photoUrl]);

  const deletePast = useCallback(
    async (item: AuraPastItem) => {
      const id = item.snapshotId ?? item.historyId;
      if (!id) return;
      setConfirmPastDeleteId(null);
      setDeletingPastId(id);
      try {
        const res = await fetch(`/api/aura/readings/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("delete failed");
        const deletedId = item.snapshotId ?? item.historyId;
        setPastReadings((prev) =>
          (prev ?? []).filter((p) => (p.snapshotId ?? p.historyId) !== deletedId)
        );
        // If the deleted aura is currently loaded in the flow, reset the view.
        if (item.snapshotId && item.snapshotId === snapshotId) {
          resetAll();
        }
      } catch {
        setError("Не удалось удалить. Попробуйте ещё раз.");
      } finally {
        setDeletingPastId(null);
      }
    },
    [snapshotId, resetAll]
  );

  const runTeaser = useCallback(
    async (file: File | Blob) => {
      setError(null);
      setStep("processing");
      setPhraseIdx(0);
      trackProductFunnel("free_start", { product: "aura", source: "aura_flow" });
      try {
        const compressed = await compressImageForUpload(
          file instanceof File ? file : new File([file], "aura.jpg", { type: "image/jpeg" }),
          { maxWidth: 1280, maxHeight: 1280, maxBytes: 2_000_000 }
        );

        const localUrl = URL.createObjectURL(compressed.blob);
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        setPhotoUrl(localUrl);

        const form = new FormData();
        form.append(
          "image",
          new File([compressed.blob], "aura.jpg", { type: compressed.mimeType })
        );

        const res = await fetch("/api/aura/teaser", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (res.status === 422 && data?.error === "NO_FACE") {
          setError(data.message ?? "Не видно лица крупным планом.");
          setStep("capture");
          return;
        }
        if (res.status === 403) {
          // Age gate — keep the photo and retry automatically after consent.
          pendingFileRef.current = file;
          setAgeReady(false);
          setStep("capture");
          return;
        }
        if (!res.ok || !data?.snapshot) {
          setError(
            data?.message ?? "Сервис распознавания временно недоступен. Попробуйте через минуту."
          );
          setStep("capture");
          return;
        }

        const nextSnapshot = data.snapshot as FlowSnapshot;
        setSnapshot(nextSnapshot);
        setSnapshotId(typeof data.snapshotId === "string" ? data.snapshotId : null);
        setReusedKind(data.reused === "today" || data.reused === "photo" ? data.reused : null);
        trackProductFunnel("free_complete", { product: "aura", source: "aura_flow" });

        if (data.claimed === true) {
          setStep("claimed");
          return;
        }

        if (isLoggedIn) {
          // Authed user: bind the snapshot immediately, skip the register CTA.
          const claimRes = await fetch("/api/aura/claim", {
            method: "POST",
            credentials: "include",
          });
          const claimData = await claimRes.json().catch(() => null);
          if (claimData?.ok) {
            if (typeof claimData.snapshotId === "string") setSnapshotId(claimData.snapshotId);
            setStep("claimed");
            return;
          }
          // Cookie lost (Capacitor) — safe recovery, no token fallback.
          setError("Не удалось привязать снимок. Снимите ауру снова — это займёт меньше минуты.");
          setStep("capture");
          return;
        }

        setStep("teaser");
      } catch {
        setError("Не удалось обработать фото. Попробуйте другое фото при ровном свете.");
        setStep("capture");
      }
    },
    [isLoggedIn, photoUrl]
  );

  const onFilePicked = useCallback(
    (file: File | null) => {
      if (!file) return;
      void runTeaser(file);
    },
    [runTeaser]
  );

  const confirmAge = useCallback(async () => {
    if (ageConfirming) return;
    setAgeConfirming(true);
    setError(null);
    const ok = await confirmAgeGateOnServer();
    setAgeConfirming(false);
    if (!ok) {
      setError("Не удалось подтвердить возраст. Обновите страницу и попробуйте ещё раз.");
      return;
    }
    setAgeReady(true);
    const pending = pendingFileRef.current;
    pendingFileRef.current = null;
    if (pending) void runTeaser(pending);
  }, [ageConfirming, runTeaser]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);

    if (isNativeCapacitorPlatform() && isAppCameraAvailable()) {
      try {
        const file = await pickPhotoFromApp("camera");
        if (file) void runTeaser(file);
      } catch {
        setError("Камера недоступна. Разрешите доступ в настройках или загрузите фото.");
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Браузер не поддерживает камеру — загрузите фото из галереи.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1350 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      // Wait a tick so the <video> mounts before attaching the stream.
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setError(
          "Браузер заблокировал доступ к камере. Нажмите на значок камеры в адресной строке и разрешите доступ, затем попробуйте снова — или загрузите фото из галереи."
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("Камера не найдена на этом устройстве — загрузите фото из галереи.");
      } else if (name === "NotReadableError") {
        setError(
          "Камера занята другим приложением (Zoom, Teams, Skype). Закройте его и попробуйте снова — или загрузите фото."
        );
      } else {
        setError("Нет доступа к камере. Разрешите доступ или загрузите фото из галереи.");
      }
    }
  }, [runTeaser]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const w = video.videoWidth || 1080;
    const h = video.videoHeight || 1350;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the selfie frame so the captured photo matches what the user saw.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) void runTeaser(blob);
      },
      "image/jpeg",
      0.92
    );
  }, [runTeaser, stopCamera]);

  const pollJob = useCallback(
    async (jobId: string) => {
      pollAbortRef.current?.abort();
      const abort = new AbortController();
      pollAbortRef.current = abort;
      const startedAt = Date.now();

      for (;;) {
        if (abort.signal.aborted) return;
        if (Date.now() - startedAt > JOB_POLL_TIMEOUT_MS) {
          setError("Разбор занял больше времени, чем обычно. Откройте кабинет — отчёт появится там.");
          setStep("claimed");
          return;
        }
        await new Promise((r) => window.setTimeout(r, JOB_POLL_INTERVAL_MS));
        try {
          const res = await fetch(`/api/jobs/${jobId}`, {
            credentials: "include",
            cache: "no-store",
            signal: abort.signal,
          });
          const data = await res.json().catch(() => null);
          if (!data) continue;
          if (data.status === "completed" && data.result?.report) {
            setReport(String(data.result.report));
            // Paid payload carries the full snapshot (layers + chakras).
            if (data.result.snapshot && typeof data.result.snapshot === "object") {
              setSnapshot(data.result.snapshot as AuraSnapshot);
            }
            if (typeof data.result.runeBalance === "number") {
              setRuneBalance(data.result.runeBalance);
            }
            setStep("report");
            return;
          }
          if (data.status === "failed" || data.status === "needs_regeneration") {
            setError(
              "Не удалось получить разбор. Руны возвращены — попробуйте ещё раз."
            );
            setStep("claimed");
            return;
          }
        } catch {
          // Network hiccup — keep polling until timeout.
        }
      }
    },
    []
  );

  const startReport = useCallback(async () => {
    if (!snapshotId) return;
    setError(null);
    setStep("paying");
    setPhraseIdx(0);
    trackProductFunnel("paid_cta", { product: "aura", source: "aura_flow" });
    try {
      const res = await fetch("/api/aura/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ snapshotId, async: true }),
      });
      const data = await res.json().catch(() => null);

      const insufficient = parseInsufficientRunes(data);
      if (insufficient) {
        setError(
          `Не хватает рун: нужно ${formatRunes(insufficient.required)}, у вас ${formatRunes(insufficient.balance)}.`
        );
        setStep("claimed");
        return;
      }
      if (res.status === 401) {
        window.location.assign(buildLoginHref("/aura"));
        return;
      }
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Не удалось запустить разбор. Попробуйте ещё раз.");
        setStep("claimed");
        return;
      }

      // Sync fallback (worker not configured): report arrives inline.
      if (typeof data?.report === "string") {
        setReport(data.report);
        if (data.snapshot && typeof data.snapshot === "object") {
          setSnapshot(data.snapshot as AuraSnapshot);
        }
        if (typeof data.runeBalance === "number") setRuneBalance(data.runeBalance);
        setStep("report");
        return;
      }
      if (typeof data?.jobId === "string") {
        void pollJob(data.jobId);
        return;
      }
      setError("Неожиданный ответ сервера. Попробуйте ещё раз.");
      setStep("claimed");
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
      setStep("claimed");
    }
  }, [snapshotId, pollJob]);

  const blockedByRunes =
    isLoggedIn &&
    config.enabled &&
    runeBalance !== null &&
    !canAffordRunes({ enabled: config.enabled, balance: runeBalance, cost: auraCost });

  const palette = snapshot
    ? [snapshot.dominantColor, ...snapshot.secondaryColors]
    : [];

  return (
    <div className="aura-flow mx-auto w-full max-w-xl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          onFilePicked(file);
        }}
      />

      <AnimatePresence mode="wait">
        {step === "capture" && (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {cameraActive ? (
              <div className="space-y-4">
                <div className="aura-camera-frame">
                  <video ref={videoRef} playsInline muted autoPlay />
                  <div className="aura-camera-frame__oval" />
                </div>
                <p className="text-center text-sm text-white/60">
                  Расположите лицо в овале. Ровный свет, без очков и сильных теней.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={captureFrame}
                    className="btn-luxe btn-luxe--md btn-luxe--gold"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Снять
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="btn-luxe btn-luxe--md btn-luxe--ghost"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : ageReady === false ? (
              <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">
                  Подтверждение возраста
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Разбор ауры — сервис для взрослых. Подтвердите, что вам есть 18 лет,
                  и продолжим с того же фото.
                </p>
                <button
                  type="button"
                  disabled={ageConfirming}
                  onClick={() => void confirmAge()}
                  className="btn-luxe btn-luxe--md btn-luxe--gold mt-6 w-full"
                >
                  {ageConfirming ? "Подтверждаем…" : "Мне есть 18 лет — продолжить"}
                </button>
              </div>
            ) : (
              <>
                <div className="aura-stage mx-auto" aria-hidden>
                  <div className="aura-stage__halo aura-stage__halo--dim" />
                  <div className="aura-stage__plate" />
                </div>
                <p className="text-center text-sm text-white/60">
                  Портрет крупным планом, при ровном свете. Фото не сохраняется — только
                  цвета и состояния поля. Один снимок на день: повтор откроет тот же
                  результат, ядро не прыгает от кадра к кадру.
                </p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="btn-luxe btn-luxe--md btn-luxe--gold"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Снять с камеры
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-luxe btn-luxe--md btn-luxe--ghost"
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Загрузить фото
                  </button>
                </div>

                {isLoggedIn && pastReadings && pastReadings.length > 0 && (
                  <div className="aura-past">
                    <p className="aura-past__title">Ваши ауры</p>
                    <ul className="aura-past__list">
                      {pastReadings.map((item) => {
                        const itemId = item.snapshotId ?? item.historyId ?? "";
                        const deleting = deletingPastId != null && deletingPastId === itemId;
                        const confirming = confirmPastDeleteId === itemId;
                        return (
                          <li key={itemId} className="aura-past__item">
                            <button
                              type="button"
                              disabled={openingPast}
                              onClick={() => void openPast(item)}
                              className="aura-past__open"
                            >
                              {item.dominantColor && (
                                <span
                                  className="aura-chakra-dot h-3 w-3"
                                  style={{
                                    backgroundColor: item.dominantColor.hex,
                                    color: item.dominantColor.hex,
                                  }}
                                />
                              )}
                              <span className="aura-past__meta">
                                <span className="aura-past__name">
                                  {item.dominantColor
                                    ? `Аура: ${item.dominantColor.name}`
                                    : "Снимок ауры"}
                                </span>
                                <span className="aura-past__date">
                                  {formatPastDate(item.createdAt)}
                                  {item.verdict ? ` · ${AURA_VERDICT_LABELS[item.verdict]}` : ""}
                                </span>
                              </span>
                              <span
                                className={`aura-past__badge ${item.paid ? "" : "aura-past__badge--pending"}`}
                              >
                                {item.paid ? "Разбор" : "Снимок"}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => {
                                if (confirming) {
                                  void deletePast(item);
                                } else {
                                  setConfirmPastDeleteId(itemId);
                                }
                              }}
                              className={`aura-past__delete ${confirming ? "aura-past__delete--confirm" : ""}`}
                              aria-label={confirming ? "Подтвердить удаление" : "Удалить ауру"}
                              title={confirming ? "Нажмите ещё раз" : "Удалить"}
                            >
                              {deleting ? "…" : confirming ? "Точно?" : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {(step === "processing" || step === "paying") && (
          <motion.div
            key="busy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6 py-8 text-center"
          >
            {snapshot && photoUrl ? (
              <AuraHalo snapshot={snapshot} photoUrl={photoUrl} veiled />
            ) : (
              <div className="aura-stage mx-auto" aria-hidden>
                <div className="aura-stage__halo" />
                <div className="aura-stage__plate" />
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-sm text-aura-gold/90">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {step === "paying"
                  ? "Мастер готовит полный разбор вашей ауры…"
                  : PROCESSING_PHRASES[phraseIdx]}
              </span>
            </div>
            {step === "paying" && (
              <p className="text-xs text-white/45">
                Обычно 1–3 минуты. Можно не закрывать страницу.
              </p>
            )}
          </motion.div>
        )}

        {(step === "teaser" || step === "claimed") && snapshot && (
          <motion.div
            key="teaser"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <AuraHalo snapshot={snapshot} photoUrl={photoUrl} veiled={step === "teaser"} />

            <AuraMap snapshot={snapshot} veiled />

            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-aura-gold/70">
                {AURA_VERDICT_LABELS[snapshot.verdict]}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {palette.map((color) => (
                  <span key={color.key} className="aura-color-chip">
                    <span
                      className="aura-color-chip__dot"
                      style={{ backgroundColor: color.hex, color: color.hex }}
                    />
                    {color.name}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-center text-[15px] leading-relaxed text-white/80">
              {snapshot.teaser}
            </p>

            {reusedKind && (
              <p role="status" className="text-center text-xs leading-relaxed text-white/60">
                {reusedKind === "today"
                  ? "Аура на сегодня уже считана. Ядро поля стабильно — новый снимок будет завтра."
                  : "Это тот же портрет: возвращаю сохранённый снимок, без нового кручения."}
              </p>
            )}

            {step === "teaser" ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-white/55">
                  Полный разбор — семь слоёв поля, чакры и практика — после регистрации.
                  {pricing?.firstAuraDiscount !== false && (
                    <> Первый разбор — {formatRunes(auraCost)} вместо {formatRunes(auraBaseCost)}.</>
                  )}
                </p>
                <Link
                  href={buildRegisterHref("/aura")}
                  onClick={() =>
                    trackProductFunnel("auth_cta", { product: "aura", source: "aura_flow" })
                  }
                  className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Продолжить и получить разбор
                </Link>
                <p className="text-xs text-white/40">
                  Снимок сохранится — после входа вы продолжите с того же портрета.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                {pricing?.firstAuraDiscount && (
                  <p className="text-sm text-aura-gold/90">
                    Первый разбор со скидкой 50% — {formatRunes(auraCost)} вместо{" "}
                    {formatRunes(auraBaseCost)}
                  </p>
                )}
                {blockedByRunes ? (
                  <div className="space-y-2">
                    <p className="text-sm text-white/60">
                      Не хватает рун: нужно {formatRunes(auraCost)}, у вас{" "}
                      {formatRunes(runeBalance ?? 0)}.
                    </p>
                    <Link href="/tariffs" className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex">
                      Пополнить руны
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startReport()}
                    className="btn-luxe btn-luxe--md btn-luxe--gold"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Получить полный разбор · {formatRunes(auraCost)}
                  </button>
                )}
                <div>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-white/45 transition hover:text-white/75"
                  >
                    <RefreshCcw className="h-3 w-3" />
                    Вернуться к съёмке
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {step === "report" && snapshot && report && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <AuraHalo snapshot={snapshot} photoUrl={photoUrl} />

            <AuraMap snapshot={snapshot} />

            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-aura-gold/70">
                {AURA_VERDICT_LABELS[snapshot.verdict]}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {palette.map((color) => (
                  <span key={color.key} className="aura-color-chip">
                    <span
                      className="aura-color-chip__dot"
                      style={{ backgroundColor: color.hex, color: color.hex }}
                    />
                    {color.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="photo-flow-panel">
              <PremiumReadingBody content={report} className="text-sm text-white/85" />
            </div>

            <div className="space-y-3 text-center">
              <div className="flex flex-wrap justify-center gap-2">
                {(snapshot.layers ?? []).slice(0, 7).map((layer) => (
                  <div key={layer.key} className="aura-layer-row w-full">
                    <span className="aura-row__name">{layer.name}</span>
                    <span className="aura-row__state">{layer.state}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 text-left">
                {(snapshot.chakras ?? []).map((chakra) => (
                  <div key={chakra.key} className="aura-chakra-row">
                    <span
                      className="aura-chakra-dot"
                      style={{ backgroundColor: chakra.color, color: chakra.color }}
                    />
                    <span className="aura-row__name">{chakra.name}</span>
                    <span className="aura-row__state">
                      {chakra.openness === "open"
                        ? "открыта"
                        : chakra.openness === "blocked"
                          ? "закрыта"
                          : "в балансе"}
                      {chakra.note ? ` — ${chakra.note}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <CrossProductNextSteps context="aura" />
              <Link href="/cabinet" className="btn-luxe btn-luxe--md btn-luxe--ghost">
                Открыть в кабинете
              </Link>
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 text-xs text-white/45 transition hover:text-white/75"
              >
                <RefreshCcw className="h-3 w-3" />
                Снять другую ауру
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
