"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";

import AuraCadenceHint from "@/components/aura/AuraCadenceHint";
import AuraHalo from "@/components/aura/AuraHalo";
import AuraMap from "@/components/aura/AuraMap";
import AuraSubjectPicker, {
  type AuraPickerSubject,
} from "@/components/aura/AuraSubjectPicker";
import CrossProductNextSteps from "@/components/CrossProductNextSteps";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { useAuth } from "@/lib/useAuth";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { auraSubjectNameKey } from "@/lib/aura-subject-name";
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
  todayPaid?: boolean;
  todayHistoryId?: string | null;
  todaySnapshotId?: string | null;
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
  subjectId?: string | null;
  subjectKind?: "self" | "other" | null;
  subjectName?: string | null;
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
  const { auraOtherSubjectsEnabled, featuresLoaded } = usePlatformFeatures();
  const { config } = useRuneConfig();
  const othersOn = featuresLoaded && auraOtherSubjectsEnabled === true;

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
  /** Today's snapshot already exists — do not offer a new shoot. */
  const [dayLocked, setDayLocked] = useState(false);
  const [todayReady, setTodayReady] = useState(false);
  const [subjects, setSubjects] = useState<AuraPickerSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [subjectKind, setSubjectKind] = useState<"self" | "other">("self");
  const [creatingOther, setCreatingOther] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [recentAck, setRecentAck] = useState<false | "new">(false);
  const [nameClash, setNameClash] = useState<AuraPickerSubject | null>(null);
  const [similarColorHint, setSimilarColorHint] = useState<string | null>(null);

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

  const refreshSubjects = useCallback(() => {
    if (!isLoggedIn || !othersOn) return;
    void fetch("/api/aura/subjects", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.subjects)) return;
        setSubjects(data.subjects as AuraPickerSubject[]);
      })
      .catch(() => undefined);
  }, [isLoggedIn, othersOn]);

  useEffect(() => {
    if (authLoading || !featuresLoaded) return;
    refreshSubjects();
  }, [authLoading, featuresLoaded, refreshSubjects]);

  // Load pricing + balance once auth state is known.
  useEffect(() => {
    if (authLoading || !featuresLoaded) return;
    const qs =
      othersOn && selectedSubjectId
        ? `?subject=${encodeURIComponent(selectedSubjectId)}`
        : "";
    void fetch(`/api/aura/pricing${qs}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.effectiveCost === "number") {
          setPricing({
            baseCost: data.baseCost,
            effectiveCost: data.effectiveCost,
            firstAuraDiscount: data.firstAuraDiscount === true,
            todayPaid: data.todayPaid === true,
            todayHistoryId: typeof data.todayHistoryId === "string" ? data.todayHistoryId : null,
            todaySnapshotId:
              typeof data.todaySnapshotId === "string" ? data.todaySnapshotId : null,
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
  }, [authLoading, isLoggedIn, featuresLoaded, othersOn, selectedSubjectId]);

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

  // Resume today's snapshot without a new photo (account or guest cookie).
  useEffect(() => {
    if (authLoading || !featuresLoaded) return;
    if (othersOn && creatingOther && !selectedSubjectId) {
      setDayLocked(false);
      setTodayReady(true);
      return;
    }
    let cancelled = false;
    const qs =
      othersOn && selectedSubjectId
        ? `?subject=${encodeURIComponent(selectedSubjectId)}`
        : "";
    void fetch(`/api/aura/today${qs}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.snapshot && typeof data.snapshotId === "string") {
          setSnapshot(data.snapshot as FlowSnapshot);
          setSnapshotId(data.snapshotId);
          setDayLocked(true);
          setReusedKind("today");
          if (typeof data.subjectId === "string") setSelectedSubjectId(data.subjectId);
          if (data.subjectKind === "other" || data.subjectKind === "self") {
            setSubjectKind(data.subjectKind);
          }
          if (typeof data.subjectName === "string") setDraftName(data.subjectName);
          if (data.paid === true && typeof data.report === "string" && data.report.trim()) {
            setReport(data.report);
            setStep("report");
          } else if (data.claimed === true || isLoggedIn) {
            setStep("claimed");
          } else {
            setStep("teaser");
          }
        } else {
          setDayLocked(false);
          if (othersOn && (selectedSubjectId || creatingOther)) {
            setSnapshot(null);
            setSnapshotId(null);
            setReport(null);
            setReusedKind(null);
            setStep("capture");
          }
        }
        setTodayReady(true);
      })
      .catch(() => {
        if (!cancelled) setTodayReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn, featuresLoaded, othersOn, selectedSubjectId, creatingOther]);

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
          setDayLocked(true);
          setStep((prev) => (prev === "report" ? prev : "claimed"));
          if (typeof data.subjectId === "string") setSelectedSubjectId(data.subjectId);
          if (data.subjectKind === "other" || data.subjectKind === "self") {
            setSubjectKind(data.subjectKind);
          }
          if (typeof data.subjectName === "string") setDraftName(data.subjectName);
          refreshSubjects();
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
    setDayLocked(false);
    setSimilarColorHint(null);
    setError(null);
    setStep("capture");
  }, [photoUrl]);

  const selectSelf = useCallback(() => {
    const self = subjects.find((s) => s.kind === "self");
    setCreatingOther(false);
    setRecentAck(false);
    setNameClash(null);
    setSubjectKind("self");
    setSelectedSubjectId(self?.id ?? null);
    setDraftName("");
    setSimilarColorHint(null);
    setError(null);
    setDayLocked(self?.shotToday === true);
    setTodayReady(false);
  }, [subjects]);

  const selectExisting = useCallback((id: string) => {
    const found = subjects.find((s) => s.id === id);
    setCreatingOther(false);
    setRecentAck(false);
    setNameClash(null);
    setSubjectKind(found?.kind === "other" ? "other" : "self");
    setSelectedSubjectId(id);
    setDraftName(found?.displayName ?? "");
    setSimilarColorHint(null);
    setError(null);
    setDayLocked(found?.shotToday === true);
    setTodayReady(false);
  }, [subjects]);

  const startCreateOther = useCallback(() => {
    setCreatingOther(true);
    setSelectedSubjectId(null);
    setSubjectKind("other");
    setDraftName("");
    setRecentAck(false);
    setNameClash(null);
    setDayLocked(false);
    setSnapshot(null);
    setSnapshotId(null);
    setReport(null);
    setReusedKind(null);
    setSimilarColorHint(null);
    setError(null);
    setTodayReady(true);
    setStep("capture");
  }, []);

  const canOpenCamera = !othersOn
    ? !dayLocked
    : !dayLocked &&
      (subjectKind === "self" ||
        Boolean(selectedSubjectId) ||
        (creatingOther &&
          draftName.trim().length > 0 &&
          (subjects.filter((s) => s.kind === "other").length === 0 || recentAck === "new") &&
          !nameClash));

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
      if (entry.subjectKind === "other" || entry.subjectKind === "self") {
        setSubjectKind(entry.subjectKind);
        setCreatingOther(false);
      }
      if (typeof entry.subjectName === "string") setDraftName(entry.subjectName);
      if (typeof entry.subjectId === "string") setSelectedSubjectId(entry.subjectId);
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
        if (othersOn) {
          form.append("kind", subjectKind);
          if (selectedSubjectId) form.append("subjectId", selectedSubjectId);
          if (subjectKind === "other" && draftName.trim()) {
            form.append("subjectName", draftName.trim());
          }
        }

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
        if (res.status === 409 && data?.code === "NAME_EXISTS" && data.subject) {
          setNameClash(data.subject as AuraPickerSubject);
          setError(data.message ?? "Такое имя уже есть — откройте существующий слот.");
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
        setDayLocked(true);
        setCreatingOther(false);
        if (typeof data.subjectId === "string") setSelectedSubjectId(data.subjectId);
        if (data.subjectKind === "other" || data.subjectKind === "self") {
          setSubjectKind(data.subjectKind);
        }
        if (typeof data.subjectName === "string") setDraftName(data.subjectName);
        setSimilarColorHint(
          typeof data.similarColorHint === "string" ? data.similarColorHint : null
        );
        refreshSubjects();
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
          if (data.reused === "today") {
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
    [isLoggedIn, photoUrl, othersOn, subjectKind, selectedSubjectId, draftName, refreshSubjects]
  );

  const onFilePicked = useCallback(
    (file: File | null) => {
      if (!file || !canOpenCamera) return;
      void runTeaser(file);
    },
    [runTeaser, canOpenCamera]
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
  }, [runTeaser, canOpenCamera]);

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
  }, [runTeaser, stopCamera, canOpenCamera]);

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
      if (res.status === 409 && data?.code === "ALREADY_PAID_TODAY") {
        setPricing((prev) => (prev ? { ...prev, todayPaid: true } : prev));
        setError(
          typeof data.message === "string"
            ? data.message
            : "Разбор на сегодня уже оплачен. Новый будет доступен завтра."
        );
        if (pricing?.todayHistoryId || pricing?.todaySnapshotId) {
          void openPast({
            snapshotId: pricing.todaySnapshotId ?? null,
            historyId: pricing.todayHistoryId ?? null,
            paid: true,
            createdAt: new Date().toISOString(),
            dominantColor: null,
            verdict: null,
            teaser: null,
          });
          return;
        }
        setStep("claimed");
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
        setPricing((prev) =>
          prev ? { ...prev, todayPaid: true, todayHistoryId: data.historyId ?? prev.todayHistoryId } : prev
        );
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
  }, [snapshotId, pollJob, pricing, openPast]);

  const blockedByRunes =
    isLoggedIn &&
    config.enabled &&
    runeBalance !== null &&
    !canAffordRunes({ enabled: config.enabled, balance: runeBalance, cost: auraCost });

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
            initial={false}
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
            ) : ageReady === null ? (
              <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-sm text-white/55">Готовим разбор…</p>
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
                  цвета и состояния поля.
                </p>
                {othersOn ? (
                  <AuraSubjectPicker
                    subjects={subjects}
                    selectedId={selectedSubjectId}
                    creating={creatingOther}
                    draftName={draftName}
                    recentAck={recentAck}
                    nameClash={nameClash}
                    loggedIn={isLoggedIn}
                    disabled={!todayReady}
                    onSelectSelf={selectSelf}
                    onSelectExisting={selectExisting}
                    onStartCreate={startCreateOther}
                    onDraftName={(name) => {
                      setDraftName(name);
                      const key = auraSubjectNameKey(name);
                      const hit =
                        key.length > 0
                          ? subjects.find(
                              (s) =>
                                s.kind === "other" && auraSubjectNameKey(s.displayName) === key
                            )
                          : undefined;
                      setNameClash(hit ?? null);
                    }}
                    onAckNewPerson={() => {
                      setRecentAck("new");
                      setNameClash(null);
                    }}
                    onConfirmClash={() => {
                      if (nameClash) selectExisting(nameClash.id);
                    }}
                    onDismissClash={() => {
                      setNameClash(null);
                      setDraftName("");
                    }}
                  />
                ) : null}
                <AuraCadenceHint
                  locked={dayLocked}
                  slot={othersOn && subjectKind === "other" ? "other" : "self"}
                />
                {!todayReady ? (
                  <p className="text-center text-sm text-white/45">
                    Проверяю снимок на сегодня…
                  </p>
                ) : canOpenCamera ? (
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
                ) : dayLocked && othersOn && subjectKind === "self" ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={startCreateOther}
                      className="btn-luxe btn-luxe--md btn-luxe--ghost"
                    >
                      Снять другому человеку
                    </button>
                  </div>
                ) : othersOn && creatingOther && !canOpenCamera ? (
                  <p className="text-center text-sm text-white/45">
                    Напишите имя и подтвердите, что это новый человек — камера откроется после этого.
                  </p>
                ) : null}

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
                                  {item.subjectKind === "other" && item.subjectName
                                    ? item.dominantColor
                                      ? `${item.subjectName}: ${item.dominantColor.name}`
                                      : `Аура ${item.subjectName}`
                                    : item.dominantColor
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
            {photoUrl ? (
              <AuraHalo snapshot={snapshot} photoUrl={photoUrl} veiled={step === "teaser"} />
            ) : null}

            <AuraMap
              snapshot={snapshot}
              veiled
              subjectKind={othersOn ? subjectKind : "self"}
              subjectName={othersOn && subjectKind === "other" ? draftName : null}
            />

            {reusedKind === "photo" ? (
              <p role="status" className="text-center text-xs leading-relaxed text-white/60">
                Это тот же портрет: возвращаю сохранённый снимок, без нового кручения.
              </p>
            ) : null}
            <AuraCadenceHint
              locked={dayLocked}
              slot={othersOn && subjectKind === "other" ? "other" : "self"}
            />
            {similarColorHint ? (
              <p role="status" className="text-center text-xs leading-relaxed text-white/60">
                {similarColorHint}
              </p>
            ) : null}

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
                {pricing?.todayPaid ? (
                  <p className="text-sm text-white/60">
                    Разбор на сегодня уже готов. Повторно руны не спишутся — новый снимок
                    завтра.
                  </p>
                ) : (
                  <>
                    {pricing?.firstAuraDiscount && (
                      <p className="text-sm text-aura-gold/90">
                        Первый разбор со скидкой 50% — {formatRunes(auraCost)} вместо{" "}
                        {formatRunes(auraBaseCost)}
                      </p>
                    )}
                    <p className="text-sm text-white/55">
                      Полный разбор — один на этого человека в сутки. Повтор сегодня откроет
                      тот же текст, руны не спишутся.
                    </p>
                  </>
                )}
                {pricing?.todayPaid && (pricing.todayHistoryId || pricing.todaySnapshotId) ? (
                  <button
                    type="button"
                    disabled={openingPast}
                    onClick={() =>
                      void openPast({
                        snapshotId: pricing.todaySnapshotId ?? null,
                        historyId: pricing.todayHistoryId ?? null,
                        paid: true,
                        createdAt: new Date().toISOString(),
                        dominantColor: snapshot?.dominantColor ?? null,
                        verdict: snapshot?.verdict ?? null,
                        teaser: snapshot?.teaser ?? null,
                      })
                    }
                    className="btn-luxe btn-luxe--md btn-luxe--gold"
                  >
                    {openingPast ? "Открываю…" : "Разбор на сегодня готов"}
                  </button>
                ) : pricing?.todayPaid ? (
                  <p className="text-sm text-white/50">Новый разбор будет доступен завтра.</p>
                ) : blockedByRunes ? (
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
                {othersOn && isLoggedIn && subjectKind === "self" ? (
                  <button
                    type="button"
                    onClick={startCreateOther}
                    className="btn-luxe btn-luxe--md btn-luxe--ghost"
                  >
                    Снять другому человеку
                  </button>
                ) : null}
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
            {photoUrl ? <AuraHalo snapshot={snapshot} photoUrl={photoUrl} /> : null}

            <AuraMap
              snapshot={snapshot}
              subjectKind={othersOn ? subjectKind : "self"}
              subjectName={othersOn && subjectKind === "other" ? draftName : null}
            />

            <AuraCadenceHint
              locked={dayLocked}
              slot={othersOn && subjectKind === "other" ? "other" : "self"}
            />

            <div className="photo-flow-panel">
              <PremiumReadingBody content={report} className="text-sm text-white/85" />
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <CrossProductNextSteps context="aura" />
              {othersOn && isLoggedIn && subjectKind === "self" ? (
                <button
                  type="button"
                  onClick={startCreateOther}
                  className="btn-luxe btn-luxe--md btn-luxe--ghost"
                >
                  Снять другому человеку
                </button>
              ) : null}
              <Link href="/cabinet" className="btn-luxe btn-luxe--md btn-luxe--ghost">
                Открыть в кабинете
              </Link>
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
