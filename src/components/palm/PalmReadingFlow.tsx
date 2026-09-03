"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";

import CrossProductNextSteps from "@/components/CrossProductNextSteps";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import PalmInsightCards from "@/components/palm/PalmInsightCards";
import PalmPhotoStage from "@/components/palm/PalmPhotoStage";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { canAffordRunes } from "@/lib/rune-afford-client";
import { compressImageForUpload } from "@/lib/compress-image-client";
import { isAppCameraAvailable, pickPhotoFromApp } from "@/lib/app-camera";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import { parseInsufficientRunes } from "@/lib/api-errors";
import { confirmAgeGateOnServer, fetchServerAgeGateConfirmed } from "@/lib/age-gate";
import { trackSeoEvent } from "@/lib/seo/metrika";
import { trackProductFunnel } from "@/lib/seo/product-funnel";
import { parseAcceptedAsyncReport } from "@/lib/client/wait-for-async-job";
import { isPalmMoscowToday } from "@/lib/palm-cadence";
import {
  blobToPalmDataUrl,
  clearPalmPreview,
  readPalmPreview,
  revokePalmObjectUrl,
  writePalmPreview,
} from "@/lib/palm-preview-session";
import {
  PALM_HAND_LABELS,
  PALM_HAND_SHAPE_LABELS,
  PALM_HAND_SHAPE_MEANINGS,
  PALM_VERDICT_LABELS,
  type PalmHand,
  type PalmSnapshot,
  type PalmTeaserSnapshot,
} from "@/lib/palm-constants";

type FlowStep =
  | "capture"
  | "preview"
  | "processing"
  | "teaser"
  | "claimed"
  | "paying"
  | "accepted"
  | "report"
  | "error";

type PalmPricing = {
  unlimited?: boolean;
  baseCost: number;
  effectiveCost: number;
  firstPalmDiscount: boolean;
  todayPaid?: boolean;
  todayHistoryId?: string | null;
  todaySnapshotId?: string | null;
};

type FlowSnapshot = PalmTeaserSnapshot &
  Partial<Pick<PalmSnapshot, "majorLines" | "mounts" | "marks">>;

type PalmPastItem = {
  snapshotId: string | null;
  historyId: string | null;
  paid: boolean;
  createdAt: string;
  whichHand: PalmHand;
  handShape: PalmSnapshot["handShape"];
  verdict: PalmSnapshot["verdict"];
  teaser: string | null;
};

function formatPastDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pastItemId(item: PalmPastItem): string {
  return item.snapshotId ?? item.historyId ?? "";
}

const PROCESSING_PHRASES = [
  "Изучаем форму ладони",
  "Определяем основные линии",
  "Готовим интерпретацию",
] as const;

const PAYING_PHRASES = [
  "Мастер читает линии и холмы…",
  "Собираю полный разбор…",
  "Проверяю текст перед отправкой…",
] as const;

const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_POLL_TIMEOUT_MS = 300_000;

function formatRunes(n: number): string {
  return `${n} ᚢ`;
}

export default function PalmReadingFlow() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const { config } = useRuneConfig();
  const reduceMotion = useReducedMotion();
  const fadeUp = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 };

  const [step, setStep] = useState<FlowStep>("capture");
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FlowSnapshot | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PalmPricing | null>(null);
  const [runeBalance, setRuneBalance] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [ageReady, setAgeReady] = useState<boolean | null>(null);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [reusedKind, setReusedKind] = useState<"today" | "photo" | null>(null);
  const [whichHand, setWhichHand] = useState<PalmHand>("right");
  const [acceptedEta, setAcceptedEta] = useState<string | null>(null);
  const [pastReadings, setPastReadings] = useState<PalmPastItem[] | null>(null);
  const [deletingPastId, setDeletingPastId] = useState<string | null>(null);
  const [confirmPastDeleteId, setConfirmPastDeleteId] = useState<string | null>(null);
  const [openingPast, setOpeningPast] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pendingFileRef = useRef<File | Blob | null>(null);
  const previewDataRef = useRef<string | null>(null);

  const palmCost = pricing?.effectiveCost ?? config.costs.PALM_READING ?? 100;
  const palmBaseCost = pricing?.baseCost ?? config.costs.PALM_READING ?? 100;
  const canOpenCamera = ageReady === true;

  useEffect(() => {
    if (step !== "processing" && step !== "paying") return;
    const phrases = step === "paying" ? PAYING_PHRASES : PROCESSING_PHRASES;
    const t = window.setInterval(() => setPhraseIdx((i) => (i + 1) % phrases.length), 2600);
    return () => window.clearInterval(t);
  }, [step]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pollAbortRef.current?.abort();
      revokePalmObjectUrl(photoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchServerAgeGateConfirmed().then((ok) => {
      if (!cancelled) setAgeReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/palm/pricing", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPricing({
          unlimited: data.unlimited === true,
          baseCost: Number(data.baseCost) || 100,
          effectiveCost: Number(data.effectiveCost) || 100,
          firstPalmDiscount: data.firstPalmDiscount === true,
          todayPaid: data.todayPaid === true,
          todayHistoryId: data.todayHistoryId ?? null,
          todaySnapshotId: data.todaySnapshotId ?? null,
        });
      })
      .catch(() => undefined);
    void fetch("/api/runes/balance", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.balance === "number") setRuneBalance(data.balance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    void (async () => {
        // Auth redirects remount the flow; the HttpOnly claim cookie is the
        // authority for restoring the same guest photo after registration.
        let claimed = null;
        if (isLoggedIn) {
          const response = await fetch("/api/palm/claim", { method: "POST", credentials: "include" });
          const claimData = await response.json().catch(() => null);
          if (response.ok) claimed = claimData;
          else if (claimData?.code !== "NO_CLAIM_TOKEN") throw new Error("palm_claim_failed");
        }
        const response = await fetch("/api/palm/today", { credentials: "include", cache: "no-store" });
        const today = response.ok ? await response.json() : null;
        // An older paid hand must not replace a newly claimed guest hand.
        const data = claimed?.ok && claimed.snapshot && claimed.snapshotId !== today?.snapshotId
          ? { ...claimed, claimed: true, paid: false, report: null }
          : today;
        if (cancelled || !data?.snapshot) return;
        const nextId = typeof data.snapshotId === "string" ? data.snapshotId : null;
        setSnapshot(data.snapshot as FlowSnapshot);
        setSnapshotId(nextId);
        if (data.snapshot.whichHand === "left" || data.snapshot.whichHand === "right") {
          setWhichHand(data.snapshot.whichHand);
        }
        const stored = readPalmPreview(nextId);
        if (stored) setPhotoUrl(stored);
        if (data.paid && typeof data.report === "string" && data.report.trim()) {
          setReport(data.report);
          setStep("report");
        } else {
          setStep(data.claimed ? "claimed" : "teaser");
        }
        if (claimed?.ok) {
          trackProductFunnel("claim_complete", { product: "palm", source: "palm_flow" });
          trackSeoEvent("palm_guest_claim_complete");
        }
      })().catch(() => {
        if (!cancelled) setError("Не удалось восстановить снимок. Проверьте подключение и обновите страницу.");
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn]);

  const resetAll = useCallback(() => {
    pollAbortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    revokePalmObjectUrl(photoUrl);
    clearPalmPreview(snapshotId);
    previewDataRef.current = null;
    setPhotoUrl(null);
    setSnapshot(null);
    setSnapshotId(null);
    setReport(null);
    setError(null);
    setReusedKind(null);
    setAcceptedEta(null);
    setStep("capture");
  }, [photoUrl, snapshotId]);

  const goHome = useCallback(() => {
    pollAbortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setError(null);
    setAcceptedEta(null);
    setStep("capture");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    void fetch("/api/palm/readings", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.readings)) return;
        setPastReadings(data.readings as PalmPastItem[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, step]);

  useEffect(() => {
    if (!confirmPastDeleteId) return;
    const timer = window.setTimeout(() => setConfirmPastDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmPastDeleteId]);

  const openPast = useCallback(
    async (item: PalmPastItem) => {
      const id = pastItemId(item);
      if (!id) return;
      setOpeningPast(true);
      setError(null);
      try {
        const res = await fetch(`/api/palm/readings/${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        const entry = data?.entry;
        if (!res.ok || !entry?.snapshot) {
          setError("Не удалось открыть снимок. Попробуйте ещё раз.");
          return;
        }
        revokePalmObjectUrl(photoUrl);
        setPhotoUrl(null);
        setSnapshot(entry.snapshot as FlowSnapshot);
        setSnapshotId(typeof entry.snapshotId === "string" ? entry.snapshotId : id);
        if (entry.paid && typeof entry.report === "string" && entry.report.trim()) {
          setReport(entry.report);
          setStep("report");
        } else {
          setReport(null);
          setStep("claimed");
        }
      } catch {
        setError("Ошибка сети. Попробуйте ещё раз.");
      } finally {
        setOpeningPast(false);
      }
    },
    [photoUrl]
  );

  const deletePast = useCallback(
    async (item: PalmPastItem) => {
      const id = pastItemId(item);
      if (!id) return;
      setConfirmPastDeleteId(null);
      setDeletingPastId(id);
      try {
        const res = await fetch(`/api/palm/readings/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("delete failed");
        setPastReadings((prev) =>
          (prev ?? []).filter((p) => pastItemId(p) !== id)
        );
        if (
          (item.snapshotId && item.snapshotId === snapshotId) ||
          (item.historyId && item.historyId === snapshotId)
        ) {
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

  const stagePhoto = useCallback(
    async (file: File | Blob) => {
      if (!canOpenCamera) return;
      setError(null);
      setPreparingImage(true);
      setStep("preview");
      try {
        const compressed = await compressImageForUpload(
          file instanceof File ? file : new File([file], "palm.jpg", { type: "image/jpeg" }),
          { maxWidth: 1280, maxHeight: 1280, maxBytes: 2_000_000 }
        );
        const staged = new File([compressed.blob], "palm.jpg", { type: compressed.mimeType });
        pendingFileRef.current = staged;
        const localUrl = URL.createObjectURL(compressed.blob);
        revokePalmObjectUrl(photoUrl);
        setPhotoUrl(localUrl);
        void blobToPalmDataUrl(compressed.blob)
          .then((dataUrl) => {
            previewDataRef.current = dataUrl;
          })
          .catch(() => undefined);
      } catch {
        pendingFileRef.current = null;
        setError("Не удалось прочитать фото. Попробуйте JPG или PNG при ровном свете.");
        setStep("capture");
      } finally {
        setPreparingImage(false);
      }
    },
    [canOpenCamera, photoUrl]
  );

  const discardStagedPhoto = useCallback(() => {
    pendingFileRef.current = null;
    revokePalmObjectUrl(photoUrl);
    setPhotoUrl(null);
    setError(null);
    setStep("capture");
  }, [photoUrl]);

  const runTeaser = useCallback(
    async (file: File | Blob) => {
      setError(null);
      setStep("processing");
      setPhraseIdx(0);
      trackProductFunnel("free_start", { product: "palm", source: "palm_flow" });
      trackSeoEvent("palm_snapshot_start");
      try {
        const compressed = await compressImageForUpload(
          file instanceof File ? file : new File([file], "palm.jpg", { type: "image/jpeg" }),
          { maxWidth: 1280, maxHeight: 1280, maxBytes: 2_000_000 }
        );
        const localUrl = URL.createObjectURL(compressed.blob);
        revokePalmObjectUrl(photoUrl);
        setPhotoUrl(localUrl);
        void blobToPalmDataUrl(compressed.blob)
          .then((dataUrl) => {
            previewDataRef.current = dataUrl;
          })
          .catch(() => undefined);

        const form = new FormData();
        form.append(
          "image",
          new File([compressed.blob], "palm.jpg", { type: compressed.mimeType })
        );
        form.append("whichHand", whichHand);

        const res = await fetch("/api/palm/teaser", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (res.status === 422 && data?.error === "NO_HAND") {
          setError(data.message ?? "Не видно раскрытой ладони.");
          setStep("capture");
          return;
        }
        if (res.status === 403) {
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

        setSnapshot(data.snapshot as FlowSnapshot);
        const nextId = typeof data.snapshotId === "string" ? data.snapshotId : null;
        setSnapshotId(nextId);
        if (nextId && previewDataRef.current) writePalmPreview(nextId, previewDataRef.current);
        setReusedKind(data.reused === "today" || data.reused === "photo" ? data.reused : null);
        trackProductFunnel("free_complete", { product: "palm", source: "palm_flow" });
        trackSeoEvent("palm_snapshot_complete");

        if (data.claimed === true) {
          setStep("claimed");
          return;
        }

        if (isLoggedIn) {
          const claimRes = await fetch("/api/palm/claim", {
            method: "POST",
            credentials: "include",
          });
          const claimData = await claimRes.json().catch(() => null);
          if (claimData?.ok) {
            if (typeof claimData.snapshotId === "string") {
              setSnapshotId(claimData.snapshotId);
              if (previewDataRef.current) {
                writePalmPreview(claimData.snapshotId, previewDataRef.current);
              }
            }
            trackProductFunnel("claim_complete", { product: "palm", source: "palm_flow" });
            trackSeoEvent("palm_guest_claim_complete");
            setStep("claimed");
            return;
          }
          if (data.reused === "today") {
            setStep("claimed");
            return;
          }
          setError("Не удалось привязать снимок. Снимите ладонь снова — это займёт меньше минуты.");
          setStep("capture");
          return;
        }

        setStep("teaser");
      } catch {
        setError("Не удалось обработать фото. Попробуйте другое фото при ровном свете.");
        setStep("capture");
      }
    },
    [isLoggedIn, photoUrl, whichHand]
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
    if (!canOpenCamera) return;
    setError(null);
    if (isNativeCapacitorPlatform() && isAppCameraAvailable()) {
      try {
        const file = await pickPhotoFromApp("camera");
        if (file) void stagePhoto(file);
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
        video: { facingMode: "environment", width: { ideal: 1080 }, height: { ideal: 1350 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch {
      setError("Нет доступа к камере. Разрешите доступ или загрузите фото из галереи.");
    }
  }, [stagePhoto, canOpenCamera]);

  const captureFrame = useCallback(() => {
    if (!canOpenCamera) return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const w = video.videoWidth || 1080;
    const h = video.videoHeight || 1350;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) void stagePhoto(blob);
      },
      "image/jpeg",
      0.92
    );
  }, [stagePhoto, stopCamera, canOpenCamera]);

  const pollJob = useCallback(async (jobId: string) => {
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
          if (data.result.snapshot && typeof data.result.snapshot === "object") {
            setSnapshot(data.result.snapshot as PalmSnapshot);
          }
          if (typeof data.result.runeBalance === "number") {
            setRuneBalance(data.result.runeBalance);
          }
          setPricing((prev) =>
            prev
              ? {
                  ...prev,
                  todayPaid: true,
                  todayHistoryId: data.result.historyId ?? prev.todayHistoryId,
                }
              : prev
          );
          setStep("report");
          return;
        }
        if (data.status === "failed" || data.status === "needs_regeneration") {
          setError(data.refunded === true
            ? "Не удалось получить разбор. Руны возвращены — попробуйте ещё раз."
            : data.status === "needs_regeneration"
              ? "Разбор требует повторной подготовки. Проверьте его статус в кабинете."
              : "Не удалось получить разбор. Проверьте статус оплаты в кабинете или обратитесь в поддержку.");
          setStep("claimed");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
  }, []);

  const startReport = useCallback(async () => {
    if (!snapshotId) return;
    setError(null);
    setStep("paying");
    setPhraseIdx(0);
    trackProductFunnel("paid_cta", { product: "palm", source: "palm_flow" });
    trackSeoEvent("palm_paid_cta");
    try {
      const res = await fetch("/api/palm/report", {
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
        window.location.assign(buildLoginHref("/gadanie-po-ladoni"));
        return;
      }
      if (res.status === 409 && data?.code === "ALREADY_PAID_TODAY") {
        setPricing((prev) => (prev ? { ...prev, todayPaid: true } : prev));
        setError(
          typeof data.message === "string"
            ? data.message
            : "Разбор этой ладони на сегодня уже открыт. Другую можно снять отдельно."
        );
        setStep("claimed");
        return;
      }
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Не удалось запустить разбор. Попробуйте ещё раз.");
        setStep("claimed");
        return;
      }
      if (typeof data?.report === "string") {
        setReport(data.report);
        if (data.snapshot && typeof data.snapshot === "object") {
          setSnapshot(data.snapshot as PalmSnapshot);
        }
        if (typeof data.runeBalance === "number") setRuneBalance(data.runeBalance);
        setPricing((prev) =>
          prev ? { ...prev, todayPaid: true, todayHistoryId: data.historyId ?? prev.todayHistoryId } : prev
        );
        setStep("report");
        return;
      }
      const accepted = parseAcceptedAsyncReport(data);
      if (accepted) {
        const min = accepted.etaRangeSec?.min ?? 60;
        const max = accepted.etaRangeSec?.max ?? 180;
        setAcceptedEta(`${Math.round(min / 60)}–${Math.round(max / 60)} мин`);
        setStep("accepted");
        void pollJob(accepted.jobId);
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
    !canAffordRunes({ enabled: config.enabled, unlimited: pricing?.unlimited, balance: runeBalance, cost: palmCost });

  const selectedHandTakenToday = (pastReadings ?? []).some(
    (item) => item.whichHand === whichHand && isPalmMoscowToday(item.createdAt)
  );

  const pastArchive =
    isLoggedIn && pastReadings && pastReadings.length > 0 ? (
      <div className="aura-past">
        <p className="aura-past__title">Ваши ладони</p>
        <ul className="aura-past__list">
          {pastReadings.map((item) => {
            const itemId = pastItemId(item);
            const deleting = deletingPastId === itemId;
            const confirming = confirmPastDeleteId === itemId;
            return (
              <li key={itemId} className="aura-past__item">
                <button
                  type="button"
                  disabled={openingPast}
                  onClick={() => void openPast(item)}
                  className="aura-past__open"
                >
                  <span className="aura-past__meta">
                    <span className="aura-past__name">
                      {PALM_HAND_LABELS[item.whichHand]}
                      {item.handShape ? ` · ${PALM_HAND_SHAPE_LABELS[item.handShape]}` : ""}
                    </span>
                    <span className="aura-past__date">
                      {formatPastDate(item.createdAt)}
                      {item.verdict ? ` · ${PALM_VERDICT_LABELS[item.verdict]}` : ""}
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
                    if (confirming) void deletePast(item);
                    else setConfirmPastDeleteId(itemId);
                  }}
                  className={`aura-past__delete ${confirming ? "aura-past__delete--confirm" : ""}`}
                  aria-label={confirming ? "Подтвердить удаление" : "Удалить снимок ладони"}
                  title={confirming ? "Нажмите ещё раз" : "Удалить"}
                >
                  {deleting ? "…" : confirming ? "Точно?" : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const captureActions =
    ageReady === true ? (
      <div className="palm-capture-surface">
        <p className="palm-capture-surface__hint">
          Раскройте ладонь пальцами вверх. Снимок не сохраняется — только линии и тип руки.
        </p>
        <div className="palm-capture-actions">
          <button
            type="button"
            onClick={() => void startCamera()}
            className="btn-luxe btn-luxe--md btn-luxe--gold order-1 sm:order-2"
          >
            <Camera className="mr-2 h-4 w-4" />
            Сфотографировать ладонь
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-luxe btn-luxe--md btn-luxe--ghost order-2 sm:order-1"
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Загрузить фото
          </button>
        </div>
        <ul className="palm-guide">
          <li>Ладонь целиком, пальцы расправлены</li>
          <li>Ровный свет, без сильных теней</li>
          <li>Одна ладонь на снимке</li>
        </ul>
        {selectedHandTakenToday ? (
          <p className="text-center text-sm text-white/50">
            {PALM_HAND_LABELS[whichHand]} уже есть в списке — откройте или удалите. Другую ладонь
            можно снять отдельно.
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file && canOpenCamera) void stagePhoto(file);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file && canOpenCamera) void stagePhoto(file);
        }}
      />

      <AnimatePresence mode="wait">
        {step === "capture" && (
          <motion.div
            key="capture"
            initial={fadeUp}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {ageReady === null && (
              <p className="text-center text-sm text-white/55">Проверяю доступ…</p>
            )}

            {ageReady === false && (
              <div className="glass-panel space-y-3 p-5">
                <p className="text-sm text-white/80">
                  Гадание по ладони доступно с 18 лет. Подтвердите возраст, чтобы снять или
                  загрузить фото.
                </p>
                <button
                  type="button"
                  onClick={() => void confirmAge()}
                  disabled={ageConfirming}
                  className="btn-luxe btn-luxe--md btn-luxe--gold"
                >
                  {ageConfirming ? "Подтверждаем…" : "Мне есть 18"}
                </button>
              </div>
            )}

            {cameraActive ? (
              <div className="space-y-4">
                <div className="palm-camera-frame">
                  <video ref={videoRef} playsInline muted autoPlay />
                  <div className="palm-camera-frame__guide" aria-hidden />
                </div>
                <p className="text-center text-sm text-white/60">
                  Поместите открытую ладонь в рамку. Пальцы вверх, ровный свет.
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
                  <button type="button" onClick={stopCamera} className="btn-luxe btn-luxe--md btn-luxe--ghost">
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-center gap-2">
                  {(["right", "left"] as const).map((hand) => (
                    <button
                      key={hand}
                      type="button"
                      onClick={() => setWhichHand(hand)}
                      className={`min-h-11 rounded-full px-4 py-2 text-sm ${
                        whichHand === hand
                          ? "bg-aura-gold/20 text-aura-gold"
                          : "bg-white/5 text-white/60"
                      }`}
                    >
                      {PALM_HAND_LABELS[hand]}
                    </button>
                  ))}
                </div>
                {captureActions}
                {pricing ? (
                  <div className="palm-price">
                    {pricing.firstPalmDiscount && palmCost < palmBaseCost ? (
                      <span className="palm-price__was">{formatRunes(palmBaseCost)}</span>
                    ) : null}
                    <span className="palm-price__now">{formatRunes(palmCost)}</span>
                    {pricing.firstPalmDiscount && palmCost < palmBaseCost ? (
                      <span className="palm-price__note">Первый разбор −50%</span>
                    ) : (
                      <span className="palm-price__note">Полный разбор</span>
                    )}
                  </div>
                ) : null}
                <p className="palm-privacy">
                  Фото нужно, чтобы прочитать ладонь. Снимок не сохраняется — на сервере
                  остаётся только результат анализа.
                </p>
              </>
            )}
            {error && <p className="text-center text-sm text-rose-300/90">{error}</p>}
            {pastArchive}
          </motion.div>
        )}

        {step === "preview" && (
          <motion.div
            key="preview"
            initial={fadeUp}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {photoUrl ? (
              <PalmPhotoStage src={photoUrl} showFrame alt="Превью вашей ладони" />
            ) : (
              <div className="palm-photo-stage flex min-h-64 items-center justify-center">
                <Loader2
                  className={`h-7 w-7 text-aura-gold${reduceMotion ? "" : " animate-spin"}`}
                />
              </div>
            )}
            {preparingImage ? (
              <p className="text-center text-sm text-white/55" role="status">
                Подготавливаем фото…
              </p>
            ) : (
              <p className="text-center text-sm text-white/60">
                Ладонь целиком в кадре? Можно заменить снимок до анализа.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                disabled={preparingImage || !photoUrl}
                onClick={() => {
                  const file = pendingFileRef.current;
                  if (file) void runTeaser(file);
                }}
                className="btn-luxe btn-luxe--md btn-luxe--gold"
              >
                Использовать это фото
              </button>
              <button
                type="button"
                disabled={preparingImage}
                onClick={discardStagedPhoto}
                className="btn-luxe btn-luxe--md btn-luxe--ghost"
              >
                Выбрать другое
              </button>
            </div>
            {error && <p className="text-center text-sm text-rose-300/90">{error}</p>}
          </motion.div>
        )}

        {(step === "processing" || step === "paying") && (
          <motion.div
            key={step}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            {photoUrl ? <PalmPhotoStage src={photoUrl} compact alt="" /> : null}
            <Loader2
              className={`h-7 w-7 text-aura-gold${reduceMotion ? "" : " animate-spin"}`}
            />
            <p className="text-sm text-white/70">
              {(step === "paying" ? PAYING_PHRASES : PROCESSING_PHRASES)[
                phraseIdx % (step === "paying" ? PAYING_PHRASES.length : PROCESSING_PHRASES.length)
              ]}
            </p>
          </motion.div>
        )}

        {(step === "teaser" || step === "claimed") && snapshot && (
          <motion.div
            key="teaser"
            initial={fadeUp}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {photoUrl ? <PalmPhotoStage src={photoUrl} alt="Ваша ладонь" /> : null}
            <div className="space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-aura-gold/80">
                {PALM_HAND_LABELS[snapshot.whichHand]}
              </p>
              <h2 className="font-display text-2xl text-white">
                Тип руки — {PALM_HAND_SHAPE_LABELS[snapshot.handShape]}
              </h2>
              <p className="text-sm text-white/60">
                {PALM_HAND_SHAPE_MEANINGS[snapshot.handShape]}. Акцент:{" "}
                {PALM_VERDICT_LABELS[snapshot.verdict].toLowerCase()}.
              </p>
              <p className="text-white/75">{snapshot.teaser}</p>
              {reusedKind === "today" && (
                <p className="text-xs text-white/45">Повтор сегодня открывает тот же снимок.</p>
              )}
            </div>

            {step === "teaser" && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-white/60">
                  Чтобы открыть полный разбор линий и холмов, войдите в аккаунт.
                </p>
                <Link
                  href={buildRegisterHref("/gadanie-po-ladoni")}
                  onClick={() => {
                    trackProductFunnel("auth_cta", { product: "palm", source: "palm_flow" });
                    trackSeoEvent("palm_auth_cta");
                  }}
                  className="btn-luxe btn-luxe--md btn-luxe--gold"
                >
                  Продолжить и получить разбор
                </Link>
              </div>
            )}

            {step === "claimed" && (
              <div className="flex flex-col items-center gap-3">
                {pricing ? (
                  <div className="palm-price">
                    {pricing.firstPalmDiscount && palmCost < palmBaseCost ? (
                      <span className="palm-price__was">{formatRunes(palmBaseCost)}</span>
                    ) : null}
                    <span className="palm-price__now">{formatRunes(palmCost)}</span>
                    {pricing.firstPalmDiscount && palmCost < palmBaseCost ? (
                      <span className="palm-price__note">Первый разбор −50%</span>
                    ) : (
                      <span className="palm-price__note">Полный разбор</span>
                    )}
                  </div>
                ) : null}
                {blockedByRunes ? (
                  <Link href="/cabinet?shop=1" className="btn-luxe btn-luxe--md btn-luxe--gold">
                    Пополнить руны
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startReport()}
                    className="btn-luxe btn-luxe--md btn-luxe--gold"
                  >
                    Открыть полный разбор
                  </button>
                )}
              </div>
            )}
            {error && <p className="text-center text-sm text-rose-300/90">{error}</p>}
            <button type="button" onClick={goHome} className="btn-luxe btn-luxe--md btn-luxe--ghost mx-auto block">
              К ладоням
            </button>
            {pastArchive}
          </motion.div>
        )}

        {step === "accepted" && (
          <motion.div
            key="accepted"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4 py-8 text-center"
          >
            <p className="font-display text-2xl text-white">Отчёт принят</p>
            <p className="text-sm text-white/65">
              Мастер готовит разбор ладони
              {acceptedEta ? ` · обычно ${acceptedEta}` : ""}. Можно закрыть страницу — готовый
              текст придёт в кабинет.
            </p>
            <Link href="/cabinet" className="btn-luxe btn-luxe--md">
              В кабинет
            </Link>
          </motion.div>
        )}

        {step === "report" && report && snapshot && (
          <motion.div
            key="report"
            initial={fadeUp}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-aura-gold/80">Ваша ладонь</p>
              <h2 className="font-display text-2xl text-white">
                {PALM_HAND_LABELS[snapshot.whichHand]} ·{" "}
                {PALM_HAND_SHAPE_LABELS[snapshot.handShape]}
              </h2>
            </div>
            <div className="palm-result-hero">
              {photoUrl ? <PalmPhotoStage src={photoUrl} alt="Ваша ладонь" /> : null}
              {snapshot.majorLines ? <PalmInsightCards snapshot={snapshot as PalmSnapshot} /> : null}
            </div>
            <details className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer text-sm text-white/80">Полный разбор</summary>
              <PremiumReadingBody content={report} className="mt-3 text-sm text-white/85" />
            </details>
            <button type="button" onClick={goHome} className="btn-luxe btn-luxe--md btn-luxe--ghost mx-auto block">
              К ладоням
            </button>
            {pastArchive}
            <CrossProductNextSteps context="palm" />
            <Link href="/cabinet" className="btn-luxe btn-luxe--md mx-auto block">
              В кабинет
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
