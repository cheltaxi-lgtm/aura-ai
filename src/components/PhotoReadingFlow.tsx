"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  ImagePlus,
  Loader2,
  Sparkles,
  X,
  MessageCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { findShowcaseMaster } from "@/lib/showcase-masters";
import MessageAudioPlayer from "@/components/MessageAudioPlayer";
import { parseInsufficientRunes, getRateLimitPayload } from "@/lib/api-errors";
import { pickUserFacingError } from "@/lib/user-facing-error";
import { useRuneConfig } from "@/lib/useRuneConfig";
import {
  PHOTO_MIN_CARD_COUNT,
  isPhotoSpreadComplete,
  normalizeRedrawSpreadForMaster,
  createEmptyManualRedrawSpread,
  buildPartialRedrawSpread,
  filterRecognizedCardLabels,
  sanitizeRecognizedRedrawSpread,
  type RedrawSpread,
  redrawSpreadToDeckCards,
} from "@/lib/photo-spread-redraw";
import {
  confidenceLabel,
  parseRecognitionConfidence,
  MAX_PHOTO_CARDS as MAX_PHOTO_CARDS_LIMIT,
  type PhotoRecognitionConfidence,
} from "@/lib/photo-reading-constants";
import { canAffordRunes } from "@/lib/rune-afford-client";
import { blobFromBase64, compressBlobToLimit, compressImageForUpload } from "@/lib/compress-image-client";
import { consumePhotoAuthDraft, savePhotoAuthDraft, type PhotoAuthDraft } from "@/lib/photo-auth-draft";
import { useNativeInputSync } from "@/lib/use-native-input-sync";
import PhotoSpreadPreview from "@/components/PhotoSpreadPreview";
import SpreadReadingRitualPanel from "@/components/SpreadReadingRitualPanel";
import { prefetchDeckFaces } from "@/lib/prefetch-deck-faces";
import PhotoReadingGuide from "@/components/PhotoReadingGuide";
import DeckCardsRow from "@/components/DeckCardsRow";
import MasterAvatar from "@/components/MasterAvatar";
import BodyPortal from "@/components/BodyPortal";
import {
  buildPhotoFollowUpChips,
  ritualHrefForQuestion,
} from "@/lib/photo-followups";
import {
  appCameraErrorMessage,
  appCameraErrorReason,
  isAppCameraAvailable,
  pickPhotoFromApp,
} from "@/lib/app-camera";
import { trackPhotoReadingPhase } from "@/lib/photo-reading-analytics";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import ShareButton from "@/components/share/ShareButton";
import { chatSpreadToSharePayload } from "@/lib/share/payload-builders";
import {
  buildLoginHref,
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { trackRegistrationCtaClick } from "@/lib/seo/metrika";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

export const PHOTO_READING_RETURN = "/?photo=1";
const PHOTO_STREAM_URL = "/api/photo-reading/stream";
export type PhotoReadingEntryMode = "upload" | "mark";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Client-side compression target: preserve vision quality while staying below infra limits. */
const UPLOAD_TARGET_BYTES = 2_500_000;
const HEAVY_FILE_BYTES = 2_500_000;
const PHOTO_UPLOAD_REV = "photo-upload-v18";
const RECOGNIZE_URL = "/api/photo-reading/recognize";
const RECOGNIZE_MAX_ATTEMPTS = 3;
const RECOGNIZE_RETRY_BASE_MS = 600;
/** Vision + upload can take a minute on mobile networks. */
const RECOGNIZE_TIMEOUT_MS = 120_000;
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type FlowStep = "upload" | "confirm" | "result";

const FLOW_STEPS: { id: FlowStep; label: string }[] = [
  { id: "upload", label: "Фото" },
  { id: "confirm", label: "Проверка" },
  { id: "result", label: "Расшифровка" },
];

const CONFIRM_FACE_LOAD_PHRASES = [
  "Идёт распознавание ваших карт…",
  "Сверяю символы с колодой…",
  "Проявляю рисунки расклада…",
] as const;

/** Safety unlock so Confirm is never stuck if a face never reports ready. */
const CONFIRM_FACES_READY_TIMEOUT_MS = 12_000;

function PhotoFlowSteps({ step }: { step: FlowStep }) {
  const order: FlowStep[] = ["upload", "confirm", "result"];
  const currentIdx = order.indexOf(step);
  return (
    <ol className="photo-reading-steps" aria-label="Шаги фото-расклада">
      {FLOW_STEPS.map((item, index) => {
        const done = index < currentIdx;
        const active = item.id === step;
        return (
          <li
            key={item.id}
            className={`photo-reading-steps__item${active ? " photo-reading-steps__item--active" : ""}${done ? " photo-reading-steps__item--done" : ""}`}
          >
            <span className="photo-reading-steps__dot">{index + 1}</span>
            <span className="photo-reading-steps__label">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface PhotoReadingChatPayload {
  analysis: string;
  question?: string;
  detectedCards: string[];
  redrawSpread?: RedrawSpread;
  sessionId?: string;
  historyId?: string;
}

/** Fired on Confirm — parent opens chat + timer immediately, then runs interpret. */
export interface PhotoReadingConfirmPayload {
  question?: string;
  detectedCards: string[];
  redrawSpread: RedrawSpread;
  idempotencyKey: string;
}

interface PhotoReadingFlowProps {
  open: boolean;
  onClose: () => void;
  masters: ShowcaseMaster[];
  isLoggedIn: boolean;
  defaultMasterId?: string;
  sessionId?: string;
  userName?: string;
  onSpreadRitualStart?: (spread: RedrawSpread) => void;
  onSpreadRitualEnd?: () => void;
  onRuneBalanceChange?: (balance: number) => void;
  /** Immediate handoff: chat with spread + ritual timer; parent runs LLM. */
  onConfirmSpread?: (masterId: string, payload: PhotoReadingConfirmPayload) => void | Promise<void>;
  onContinueChat?: (masterId: string, payload: PhotoReadingChatPayload) => void | Promise<void>;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
  onSaved?: () => void;
  runeBalance?: number;
  isUnlimited?: boolean;
  onOpenPaywall?: () => void;
  initialMode?: PhotoReadingEntryMode;
}

/** Appends newly recognized cards to an already-confirmed spread (for long spreads split across two photos), capped at MAX_PHOTO_CARDS_LIMIT. */
function mergeSpreadCards(
  base: RedrawSpread,
  addition: RedrawSpread,
  masterId: string
): { spread: RedrawSpread; overflow: number } {
  const combinedCards = [...base.cards, ...addition.cards];
  const overflow = Math.max(0, combinedCards.length - MAX_PHOTO_CARDS_LIMIT);
  const merged: RedrawSpread = {
    system: base.system,
    deckType: base.deckType ?? addition.deckType,
    spreadType: undefined,
    cards: combinedCards.slice(0, MAX_PHOTO_CARDS_LIMIT),
  };
  return { spread: normalizeRedrawSpreadForMaster(merged, masterId), overflow };
}

function logPhotoClientError(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/photo-reading/client-log",
      new Blob([body], { type: "application/json" })
    );
    return;
  }
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photo-reading/client-log", false);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(body);
  } catch {
    // ignore logging failures
  }
}

function buildRecognizeFormData(blob: Blob, masterId: string, question: string): FormData {
  const formData = new FormData();
  formData.append("characterId", masterId);
  formData.append(
    "image",
    new File([blob], "spread.jpg", { type: blob.type || "image/jpeg" })
  );
  if (question.trim()) formData.append("question", question.trim());
  return formData;
}

function isRetriableRecognizeStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isRetriableRecognizeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network|timeout|xhr_network|upload_failed|xhr_timeout/i.test(msg);
}

function recognizeRetryDelayMs(attempt: number): number {
  return RECOGNIZE_RETRY_BASE_MS * attempt;
}

function postRecognizeXhr(formData: FormData): Promise<{ status: number; text: string }> {
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${RECOGNIZE_URL}` : RECOGNIZE_URL;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = RECOGNIZE_TIMEOUT_MS;
    xhr.withCredentials = true;
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText ?? "" });
    xhr.onerror = () => reject(new Error("xhr_network_error"));
    xhr.ontimeout = () => reject(new Error("xhr_timeout"));
    xhr.onabort = () => reject(new Error("xhr_aborted"));
    xhr.send(formData);
  });
}

/**
 * Single XHR upload — avoids duplicate aborted fetch + retry confusion on mobile.
 */
async function postRecognizeWithRetry(
  blob: Blob,
  masterId: string,
  question: string,
  onAttempt?: (attempt: number) => void
): Promise<{ status: number; text: string }> {
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= RECOGNIZE_MAX_ATTEMPTS; attempt++) {
    onAttempt?.(attempt);
    try {
      const response = await postRecognizeXhr(buildRecognizeFormData(blob, masterId, question));
      if (isRetriableRecognizeStatus(response.status) && attempt < RECOGNIZE_MAX_ATTEMPTS) {
        logPhotoClientError({
          phase: "recognize_retry_status",
          attempt,
          status: response.status,
          name: PHOTO_UPLOAD_REV,
        });
        await new Promise((resolve) => setTimeout(resolve, recognizeRetryDelayMs(attempt)));
        continue;
      }
      return response;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      logPhotoClientError({
        phase: "recognize_retry_error",
        attempt,
        error: lastErr.message,
        name: PHOTO_UPLOAD_REV,
      });
      if (!isRetriableRecognizeError(err) || attempt >= RECOGNIZE_MAX_ATTEMPTS) {
        throw lastErr;
      }
      await new Promise((resolve) => setTimeout(resolve, recognizeRetryDelayMs(attempt)));
    }
  }

  throw lastErr ?? new Error("upload_failed");
}

function isImageFile(file: File): boolean {
  const mime = file.type.toLowerCase().split(";")[0]?.trim();
  if (mime) return ALLOWED_IMAGE_MIMES.has(mime);
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}


function imageCacheKey(data: { base64: string; mimeType: string }): string {
  return `${data.mimeType}:${data.base64.length}:${data.base64.slice(0, 64)}`;
}

export default function PhotoReadingFlow({
  open,
  onClose,
  masters,
  isLoggedIn,
  defaultMasterId = "veronika",
  sessionId,
  onSpreadRitualStart,
  onSpreadRitualEnd,
  onRuneBalanceChange,
  onConfirmSpread,
  onContinueChat,
  onInsufficientRunes,
  onSaved,
  runeBalance = 0,
  isUnlimited = false,
  onOpenPaywall,
  initialMode = "upload",
}: PhotoReadingFlowProps) {
  const { config: runeConfig, cost: runeCost, formatRunes, formatRunesWithRub } = useRuneConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const appCameraBusyRef = useRef(false);
  const [appCameraBusy, setAppCameraBusy] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const sourcePhotoUrlRef = useRef<string | null>(null);
  const recognizeInFlightRef = useRef(false);
  const interpretIdempotencyKeyRef = useRef<string | null>(null);
  /** Set when the client asks to add cards from a second photo to an already-confirmed spread (long spreads that don't fit one frame). */
  const mergeBaseSpreadRef = useRef<RedrawSpread | null>(null);
  const [mergeBaseCount, setMergeBaseCount] = useState<number | null>(null);
  const recognizeCacheRef = useRef<
    Map<
      string,
      {
        spread: RedrawSpread;
        confidence: PhotoRecognitionConfidence;
        manual: boolean;
        notice?: string;
      }
    >
  >(new Map());
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  const [step, setStep] = useState<FlowStep>("upload");
  const [confirmFacesReady, setConfirmFacesReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string; blob: Blob } | null>(null);
  const [imageSource, setImageSource] = useState<"camera" | "gallery">("gallery");
  const [fileOriginalBytes, setFileOriginalBytes] = useState(0);
  const [masterId, setMasterId] = useState(defaultMasterId);
  const [question, setQuestion] = useState("");
  const [draftSaveFailedHref, setDraftSaveFailedHref] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const questionInputSyncRef = useNativeInputSync<HTMLTextAreaElement>(setQuestion);
  const [loading, setLoading] = useState(false);
  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0);
  const [preparingImage, setPreparingImage] = useState(false);
  const [recognizeAttempt, setRecognizeAttempt] = useState(0);
  const [error, setError] = useState("");
  const [redrawSpread, setRedrawSpread] = useState<RedrawSpread | null>(null);
  const [recognitionConfidence, setRecognitionConfidence] =
    useState<PhotoRecognitionConfidence>("unknown");
  const [manualMode, setManualMode] = useState(false);
  const [recognitionFailed, setRecognitionFailed] = useState(false);
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(null);
  const [showSourceCompare, setShowSourceCompare] = useState(false);
  const [showRescueActions, setShowRescueActions] = useState(false);
  const [result, setResult] = useState<{
    analysis: string;
    detectedCards: string[];
    deckType?: string;
    spreadType?: string;
    saved: boolean;
    historyId?: string;
  } | null>(null);
  const [streamingAnalysis, setStreamingAnalysis] = useState("");
  const [photoPricing, setPhotoPricing] = useState<{
    baseCost: number;
    effectiveCost: number;
    firstPhotoDiscount: boolean;
  } | null>(null);

  const selectedMaster = findShowcaseMaster(masterId, masters);
  const aiMasters = useMemo(
    () => masters.filter((m) => m.kind === "ai" || !m.kind),
    [masters]
  );
  const masterDisplayName = selectedMaster?.name ?? "Мастер";
  const photoCost = photoPricing?.effectiveCost ?? runeCost("VISION_ANALYSIS");
  const photoBaseCost = photoPricing?.baseCost ?? runeCost("VISION_ANALYSIS");
  const photoPriceLabel = formatRunesWithRub(photoCost);
  const canAffordPhoto = canAffordRunes({
    enabled: runeConfig.enabled,
    unlimited: isUnlimited,
    balance: runeBalance,
    cost: photoCost,
  });
  const runesBlocked =
    isLoggedIn && runeConfig.enabled && !isUnlimited && !canAffordPhoto;

  useEffect(() => {
    if (!open) return;
    sessionStorage.setItem("zovus_photo_rev", PHOTO_UPLOAD_REV);
    trackPhotoReadingPhase("open", { mode: initialMode, authed: isLoggedIn });
  }, [open, initialMode, isLoggedIn]);

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const { resumeStoredOrActiveAsyncJob } = await import(
          "@/lib/client/wait-for-async-job"
        );
        const data = await resumeStoredOrActiveAsyncJob({
          storageKey: "aura:photo-reading-active-job",
          kind: "photo_reading",
        });
        if (cancelled || !data) return;
        const analysis = String(data.analysis ?? data.reply ?? "");
        if (!analysis.trim()) return;
        setStep("result");
        setStreamingAnalysis(analysis);
        setResult({
          analysis,
          detectedCards: (data.detectedCards as string[]) ?? [],
          deckType: data.deckType as string | undefined,
          spreadType: data.spreadType as string | undefined,
          saved: Boolean(data.saved),
          historyId: data.historyId as string | undefined,
        });
        if (typeof data.runeBalance === "number") {
          onRuneBalanceChange?.(data.runeBalance as number);
        }
        if (data.saved || data.historyId) onSaved?.();
      } catch {
        /* keep UI on current step */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isLoggedIn, onRuneBalanceChange, onSaved]);

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    void fetch("/api/photo-reading/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof data?.effectiveCost === "number") {
          setPhotoPricing({
            baseCost: data.baseCost ?? data.effectiveCost,
            effectiveCost: data.effectiveCost,
            firstPhotoDiscount: Boolean(data.firstPhotoDiscount),
          });
        }
      })
      .catch(() => undefined);
  }, [open, isLoggedIn]);

  const onRuneBalanceChangeRef = useRef(onRuneBalanceChange);
  useEffect(() => { onRuneBalanceChangeRef.current = onRuneBalanceChange; });

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    void fetch("/api/runes/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof data?.balance === "number") {
          onRuneBalanceChangeRef.current?.(data.balance);
        }
      })
      .catch(() => undefined);
  }, [open, isLoggedIn]);

  useEffect(() => {
    if (open) setMasterId(defaultMasterId);
  }, [open, defaultMasterId]);

  useEffect(() => {
    if (!loading && !preparingImage) {
      setLoadingElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    setLoadingElapsedSec(0);
    const t = window.setInterval(() => {
      setLoadingElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [loading, preparingImage]);

  const loadingElapsedLabel = `${Math.floor(loadingElapsedSec / 60)}:${String(
    loadingElapsedSec % 60
  ).padStart(2, "0")}`;

  const spreadMasterRef = useRef<string | null>(null);

  useEffect(() => {
    if (step !== "confirm") {
      spreadMasterRef.current = null;
      setConfirmFacesReady(false);
    }
  }, [step]);

  const confirmSpreadKey = useMemo(() => {
    if (!redrawSpread?.cards.length) return "";
    return redrawSpread.cards
      .map((c) => `${c.name}:${c.imagePath ?? ""}:${c.reversed ? "r" : "u"}`)
      .join("|");
  }, [redrawSpread]);

  useEffect(() => {
    if (step !== "confirm" || !confirmSpreadKey) {
      setConfirmFacesReady(false);
      return;
    }
    setConfirmFacesReady(false);
    const unlock = window.setTimeout(() => {
      setConfirmFacesReady(true);
    }, CONFIRM_FACES_READY_TIMEOUT_MS);
    return () => window.clearTimeout(unlock);
  }, [step, confirmSpreadKey]);

  useEffect(() => {
    if (!redrawSpread || step !== "confirm") return;
    if (spreadMasterRef.current === null) {
      spreadMasterRef.current = masterId;
      return;
    }
    if (spreadMasterRef.current === masterId) return;
    spreadMasterRef.current = masterId;
    setRedrawSpread((prev) =>
      prev ? normalizeRedrawSpreadForMaster(prev, masterId) : prev
    );
  }, [masterId, step]); // eslint-disable-line react-hooks/exhaustive-deps -- remap deck only when master changes

  useEffect(() => {
    if (open) return;
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    if (sourcePhotoUrlRef.current) {
      URL.revokeObjectURL(sourcePhotoUrlRef.current);
      sourcePhotoUrlRef.current = null;
    }
    setPreviewUrl(null);
    setSourcePhotoUrl(null);
    setShowSourceCompare(false);
    setImageData(null);
    setRedrawSpread(null);
    setResult(null);
    setError("");
    setQuestion("");
    setStep("upload");
    setLoading(false);
    setPreparingImage(false);
    setManualMode(false);
    setRecognitionFailed(false);
    setRecognitionConfidence("unknown");
    setShowRescueActions(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    interpretIdempotencyKeyRef.current = null;
    setStreamingAnalysis("");
    setPhotoPricing(null);
    setDraftSaveFailedHref(null);
    setDraftRestored(false);
  }, [open]);

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    let draft: PhotoAuthDraft | null = null;
    try {
      draft = consumePhotoAuthDraft(window.sessionStorage);
    } catch {
      // Storage may be disabled; the ordinary upload remains available.
    }
    if (!draft) return;
    setQuestion(draft.question);
    if (aiMasters.some((m) => m.id === draft.masterId)) setMasterId(draft.masterId);
    if (draft.image) {
      const blob = blobFromBase64(draft.image.base64, draft.image.mimeType);
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewObjectUrlRef.current = url;
      setPreviewUrl(url);
      setImageData({ ...draft.image, blob });
      setFileOriginalBytes(blob.size);
    }
    setDraftRestored(true);
    trackPhotoReadingPhase("draft_restored", { mode: draft.mode, has_photo: Boolean(draft.image) });
  }, [open, isLoggedIn, aiMasters]);

  const markModeBootedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      markModeBootedRef.current = false;
      return;
    }
    if (initialMode !== "mark" || markModeBootedRef.current) return;
    if (!isLoggedIn) return;
    if (runesBlocked) return;
    markModeBootedRef.current = true;
    trackPhotoReadingPhase("manual_mark");
    openConfirmStep(createEmptyManualRedrawSpread(masterId), {
      manual: true,
      confidence: "unknown",
    });
  }, [open, initialMode, isLoggedIn, masterId, runesBlocked]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loading, onClose]);

  const preserveSourcePhoto = (url: string | null) => {
    if (!url) return;
    if (sourcePhotoUrlRef.current && sourcePhotoUrlRef.current !== url) {
      URL.revokeObjectURL(sourcePhotoUrlRef.current);
    }
    sourcePhotoUrlRef.current = url;
    setSourcePhotoUrl(url);
  };

  const openConfirmStep = (
    spread: RedrawSpread,
    opts?: {
      confidence?: PhotoRecognitionConfidence;
      manual?: boolean;
      recognitionFailed?: boolean;
      notice?: string;
      recognizeCacheKey?: string;
    }
  ) => {
    // Warm faces before React commits confirm UI.
    prefetchDeckFaces(spread.cards.map((c) => c.imagePath));
    setRedrawSpread(spread);
    setRecognitionConfidence(opts?.confidence ?? "unknown");
    setManualMode(Boolean(opts?.manual));
    setRecognitionFailed(Boolean(opts?.recognitionFailed));
    setStep("confirm");
    setShowRescueActions(false);
    if (opts?.recognizeCacheKey) {
      recognizeCacheRef.current.set(opts.recognizeCacheKey, {
        spread,
        confidence: opts?.confidence ?? "unknown",
        manual: Boolean(opts?.manual),
        notice: opts?.notice,
      });
    }
    if (!interpretIdempotencyKeyRef.current) {
      interpretIdempotencyKeyRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    trackPhotoReadingPhase("confirm", { manual: Boolean(opts?.manual) });
    if (opts?.notice) {
      setError(opts.notice);
    } else {
      setError("");
    }
  };

  const photoAuthReturnTo = (mode = initialMode) => mode === "mark"
    ? resolveRegistrationReturnTo({ custom: "/?photo=1&mode=mark" })
    : resolveRegistrationReturnTo({ photo: true });

  const continueThroughAuth = (kind: "register" | "login", mode = initialMode) => {
    if (preparingImage) {
      setError("Фото ещё загружается. Подождите немного и продолжите.");
      return;
    }
    const href = kind === "register" ? buildRegisterHref(photoAuthReturnTo(mode)) : buildLoginHref(photoAuthReturnTo(mode));
    let saved = false;
    try {
      saved = savePhotoAuthDraft({
        mode, masterId, question,
        ...(imageData ? { image: { base64: imageData.base64, mimeType: imageData.mimeType as "image/jpeg" } } : {}),
      }, window.sessionStorage);
    } catch {
      // Access itself can throw in restricted browsers.
    }
    if (!saved && (imageData || question)) {
      setDraftSaveFailedHref(href);
      setError("Браузер не сохранил черновик. Можно продолжить вход, затем выбрать фото и написать вопрос заново.");
      trackPhotoReadingPhase("draft_save_failed");
      return;
    }
    trackPhotoReadingPhase("auth_redirect", { mode, has_photo: Boolean(imageData) });
    if (kind === "register") trackRegistrationCtaClick("photo_reading");
    window.location.href = href;
  };

  const startManualSpread = () => {
    if (!isLoggedIn) {
      continueThroughAuth("register", "mark");
      return;
    }
    if (runesBlocked) {
      onInsufficientRunes?.({ balance: runeBalance, required: photoCost });
      onOpenPaywall?.();
      setError(`Недостаточно рун: нужно ${formatRunes(photoCost)}, у вас ${formatRunes(runeBalance)}.`);
      return;
    }
    openConfirmStep(createEmptyManualRedrawSpread(masterId), {
      manual: true,
      confidence: "unknown",
    });
  };

  const handleFile = async (file: File | undefined, source: "camera" | "gallery" = "gallery") => {
    if (!file || !isImageFile(file)) {
      setError("Выберите изображение (JPG, PNG, WebP или HEIC)");
      return;
    }
    setError("");
    setResult(null);
    setRedrawSpread(null);
    setManualMode(false);
    setRecognitionFailed(false);
    setStep("upload");
    setImageData(null);
    setFileOriginalBytes(file.size);
    setPreparingImage(true);

    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);

    logPhotoClientError({
      phase: "file_selected",
      name: source,
      blobBytes: file.size,
      bytes: file.type || "unknown",
    });
    const compressOpts = {
      maxWidth: 1920,
      maxHeight: 1920,
      maxBytes: UPLOAD_TARGET_BYTES,
      quality: 0.8,
    };
    try {
      const data = await compressImageForUpload(file, compressOpts);
      logPhotoClientError({
        phase: "compress_ok",
        name: source,
        blobBytes: data.blob.size,
        bytes: data.base64.length,
        originalBytes: file.size,
      });
      setImageSource(source);
      setImageData(data);
    } catch (compressErr) {
      logPhotoClientError({
        phase: "compress_fail",
        error: compressErr instanceof Error ? compressErr.message : String(compressErr),
        blobBytes: file.size,
        name: source,
        originalBytes: file.size,
      });
      setPreviewUrl(null);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setError(
        file.size > HEAVY_FILE_BYTES
          ? "Фото слишком тяжёлое и не удалось сжать. Попробуйте другое фото в JPG, PNG или WebP."
          : "Не удалось обработать изображение. Попробуйте ещё раз или выберите JPG/PNG."
      );
    } finally {
      setPreparingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const pickFromAppSource = async (source: "camera" | "gallery") => {
    if (!isAppCameraAvailable()) {
      if (source === "camera") cameraInputRef.current?.click();
      else fileInputRef.current?.click();
      return;
    }
    if (appCameraBusyRef.current) return;
    appCameraBusyRef.current = true;
    setAppCameraBusy(true);
    logPhotoClientError({ phase: "native_camera_open", name: source });
    try {
      const file = await pickPhotoFromApp(source);
      if (file) {
        await handleFile(file, source);
      } else {
        logPhotoClientError({ phase: "native_camera_empty_result", name: source });
      }
    } catch (err) {
      logPhotoClientError({
        phase: "native_camera_error",
        name: source,
        error: appCameraErrorReason(err),
      });
      const message = appCameraErrorMessage(err);
      if (message) setError(message);
    } finally {
      appCameraBusyRef.current = false;
      setAppCameraBusy(false);
    }
  };

  const clearImage = () => {
    mergeBaseSpreadRef.current = null;
    setMergeBaseCount(null);
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setImageData(null);
    setImageSource("gallery");
    setFileOriginalBytes(0);
    setRedrawSpread(null);
    setResult(null);
    setStep("upload");
    setPreparingImage(false);
    setManualMode(false);
    setRecognitionFailed(false);
    setShowSourceCompare(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  /** From the confirm step: keep already-confirmed cards and go take/upload a second photo to add more. */
  const startAddPhotoMerge = () => {
    if (!redrawSpread) return;
    mergeBaseSpreadRef.current = redrawSpread;
    setMergeBaseCount(redrawSpread.cards.length);
    setResult(null);
    setError("");
    setStep("upload");
    trackPhotoReadingPhase("merge_photo_start");
  };

  const recognize = async () => {
    if (recognizeInFlightRef.current) return;

    logPhotoClientError({
      phase: "recognize_click",
      name: PHOTO_UPLOAD_REV,
      source: imageSource,
      blobBytes: imageData?.blob?.size ?? 0,
      originalBytes: fileOriginalBytes,
    });
    if (!isLoggedIn) {
      continueThroughAuth("register");
      return;
    }
    if (!imageData) {
      setError("Сначала загрузите или сфотографируйте расклад");
      return;
    }
    if (runesBlocked) {
      onInsufficientRunes?.({ balance: runeBalance, required: photoCost });
      onOpenPaywall?.();
      setError(`Недостаточно рун: нужно ${formatRunes(photoCost)}, у вас ${formatRunes(runeBalance)}.`);
      return;
    }

    const cacheKey = imageCacheKey(imageData);
    const cachedRecognize = recognizeCacheRef.current.get(cacheKey);
    if (cachedRecognize) {
      trackPhotoReadingPhase("recognize_ok", { cached: true });
      openConfirmStep(cachedRecognize.spread, {
        confidence: cachedRecognize.confidence,
        manual: cachedRecognize.manual,
        notice: cachedRecognize.notice,
      });
      return;
    }

    trackPhotoReadingPhase("recognize_start");

    recognizeInFlightRef.current = true;
    setLoading(true);
    setError("");
    setRecognizeAttempt(0);

    try {
      let uploadBlob = imageData.blob;

      if (uploadBlob.size > UPLOAD_TARGET_BYTES) {
        try {
          const tightened = await compressBlobToLimit(uploadBlob, {
            maxWidth: 1920,
            maxHeight: 1920,
            maxBytes: UPLOAD_TARGET_BYTES,
            quality: 0.8,
          });
          uploadBlob = tightened.blob;
          setImageData(tightened);
          logPhotoClientError({
            phase: "recompress",
            name: imageSource,
            blobBytes: uploadBlob.size,
            originalBytes: fileOriginalBytes,
          });
        } catch (recompressErr) {
          logPhotoClientError({
            phase: "recompress_fail",
            error: recompressErr instanceof Error ? recompressErr.message : String(recompressErr),
            blobBytes: uploadBlob.size,
            originalBytes: fileOriginalBytes,
            name: imageSource,
          });
          setError("Фото слишком тяжёлое. Сделайте снимок ближе к картам при хорошем свете.");
          return;
        }
      }

      const uploadBytes = uploadBlob.size;

      logPhotoClientError({
        phase: "recognize_start",
        blobBytes: uploadBytes,
        originalBytes: fileOriginalBytes,
        name: isMobile ? "mobile" : "desktop",
        source: imageSource,
        transport: "multipart_xhr",
      });

      if (uploadBytes > MAX_UPLOAD_BYTES) {
        setError("Фото слишком большое после сжатия. Попробуйте другое изображение.");
        return;
      }

      let response: { status: number; text: string };
      try {
        response = await postRecognizeWithRetry(uploadBlob, masterId, question, setRecognizeAttempt);
      } catch (uploadErr) {
        const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        logPhotoClientError({
          phase: "recognize_upload",
          error: errMsg,
          blobBytes: uploadBytes,
          originalBytes: fileOriginalBytes,
          name: isMobile ? "mobile" : "desktop",
          source: imageSource,
          transport: "multipart_xhr",
        });
        if (errMsg.includes("timeout")) {
          setError("Сервер не успел обработать фото. Попробуйте ещё раз или уменьшите снимок.");
        } else {
          setError("Не удалось отправить фото. Проверьте интернет и попробуйте ещё раз.");
        }
        return;
      }

      const rawText = response.text;
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        if (response.status === 413) {
          setError("Фото слишком большое. Попробуйте другое изображение.");
        } else if (response.status === 504 || response.status === 502) {
          setError("Сервер не успел обработать фото. Попробуйте ещё раз или уменьшите снимок.");
        } else {
          setError(`Ошибка сервера (${response.status}). Попробуйте ещё раз.`);
        }
        return;
      }

      if (response.status === 401) {
        continueThroughAuth("login");
        return;
      }

      if (response.status === 429) {
        const rl = getRateLimitPayload(data);
        setError(rl ? "Слишком много запросов. Подождите." : "Слишком много запросов.");
        return;
      }

      if (response.status === 402) {
        const parsed = parseInsufficientRunes(data);
        if (parsed) {
          onInsufficientRunes?.({ balance: parsed.balance, required: parsed.required });
          onOpenPaywall?.();
          setError(`Недостаточно рун. Не хватает ${parsed.shortage} ᚢ.`);
          return;
        }
      }

      if (response.status === 422) {
        const mergeBase = mergeBaseSpreadRef.current;
        mergeBaseSpreadRef.current = null;
        setMergeBaseCount(null);
        if (mergeBase) {
          preserveSourcePhoto(previewUrl);
          openConfirmStep(mergeBase, {
            confidence: recognitionConfidence,
            manual: manualMode,
            recognitionFailed: recognitionFailed,
            notice: "Не удалось распознать второе фото — можете добавить карты вручную к уже подтверждённому раскладу.",
          });
          trackPhotoReadingPhase("recognize_partial");
          return;
        }

        const partialCards = filterRecognizedCardLabels(
          Array.isArray(data.detectedCards) ? (data.detectedCards as string[]) : []
        );
        const deckType = typeof data.deckType === "string" ? data.deckType : undefined;
        const spreadType = typeof data.spreadType === "string" ? data.spreadType : undefined;
        const message =
          (typeof data.message === "string" && data.message) ||
          "На фото не удалось распознать расклад — соберите его вручную.";

        preserveSourcePhoto(previewUrl);
        openConfirmStep(
          partialCards.length
            ? buildPartialRedrawSpread(masterId, partialCards, deckType, spreadType)
            : createEmptyManualRedrawSpread(masterId),
          {
            confidence: parseRecognitionConfidence(deckType),
            manual: true,
            recognitionFailed: true,
            notice: message,
            recognizeCacheKey: cacheKey,
          }
        );
        trackPhotoReadingPhase("recognize_partial");
        return;
      }

      if (response.status === 503) {
        setError(
          (typeof data.message === "string" && data.message) ||
            "Сервис распознавания временно недоступен. Попробуйте через минуту."
        );
        return;
      }

      if (response.status < 200 || response.status >= 300) {
        setError(
          pickUserFacingError(data, "Не удалось распознать расклад. Проверьте фото и попробуйте снова.")
        );
        return;
      }

      const rawSpread = data.redrawSpread as RedrawSpread;
      const { spread: recognizedSpread, manual } = sanitizeRecognizedRedrawSpread(rawSpread, masterId);
      const confidence = parseRecognitionConfidence(
        typeof data.deckType === "string" ? data.deckType : recognizedSpread?.deckType
      );
      const overflowCards = Array.isArray(data.overflowCards) ? (data.overflowCards as string[]) : [];
      const truncatedNotice = data.truncated
        ? `Мы распознали ${data.totalDetected} карт, но расклад поддерживает не больше ${MAX_PHOTO_CARDS_LIMIT}. Показаны первые ${MAX_PHOTO_CARDS_LIMIT}${
            overflowCards.length ? ` — «${overflowCards.join("», «")}» можно добавить вручную` : ""
          }.`
        : undefined;

      const mergeBase = mergeBaseSpreadRef.current;
      mergeBaseSpreadRef.current = null;
      setMergeBaseCount(null);
      let spread = recognizedSpread;
      let mergeNotice: string | undefined;
      if (mergeBase && !manual) {
        const { spread: merged, overflow } = mergeSpreadCards(mergeBase, recognizedSpread, masterId);
        spread = merged;
        mergeNotice = overflow > 0
          ? `Добавили карты со второго фото. Расклад заполнен до ${MAX_PHOTO_CARDS_LIMIT} — ${overflow} лишних карт со второго фото не поместились, добавьте их вручную при необходимости.`
          : "Карты со второго фото добавлены к раскладу.";
      } else if (mergeBase && manual) {
        mergeNotice = "Не удалось распознать второе фото — можете добавить карты вручную к уже подтверждённому раскладу.";
        spread = mergeBase;
      }

      preserveSourcePhoto(previewUrl);
      openConfirmStep(spread, {
        confidence: mergeBase ? recognitionConfidence : Boolean(data.partial) && confidence === "high" ? "medium" : confidence,
        manual: mergeBase ? manualMode : manual,
        recognitionFailed: mergeBase ? recognitionFailed : manual,
        notice:
          mergeNotice ??
          truncatedNotice ??
          (manual
            ? (typeof data.message === "string" && data.message) ||
              "На фото не удалось распознать расклад — соберите его вручную."
            : typeof data.message === "string" && data.partial
              ? data.message
              : undefined),
        recognizeCacheKey: mergeBase ? undefined : cacheKey,
      });
      trackPhotoReadingPhase(manual ? "recognize_partial" : "recognize_ok");
      setPreviewUrl(null);
      setImageData(null);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logPhotoClientError({
        phase: "recognize_crash",
        error: errMsg,
        name: isMobile ? "mobile" : "desktop",
      });
      setError("Ошибка при отправке фото. Попробуйте ещё раз.");
      setShowRescueActions(true);
    } finally {
      recognizeInFlightRef.current = false;
      setRecognizeAttempt(0);
      setLoading(false);
    }
  };

  const interpret = async () => {
    if (!redrawSpread?.cards.length) return;
    if (!isPhotoSpreadComplete(redrawSpread)) {
      setError(`Добавьте хотя бы ${PHOTO_MIN_CARD_COUNT} символ в расклад.`);
      return;
    }
    if (runesBlocked) {
      onInsufficientRunes?.({ balance: runeBalance, required: photoCost });
      onOpenPaywall?.();
      setError(`Недостаточно рун: нужно ${formatRunes(photoCost)}, у вас ${formatRunes(runeBalance)}.`);
      return;
    }

    const idempotencyKey =
      interpretIdempotencyKeyRef.current ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    interpretIdempotencyKeyRef.current = idempotencyKey;

    const detectedCards = redrawSpread.cards.map((c) =>
      c.reversed ? `${c.name} (перев.)` : c.name
    );
    const questionText = question.trim() || undefined;

    setError("");
    trackPhotoReadingPhase("interpret_start");

    // Prefer immediate chat handoff (spread + timer). Fall back to legacy in-modal wait.
    if (onConfirmSpread) {
      setLoading(true);
      try {
        await onConfirmSpread(masterId, {
          question: questionText,
          detectedCards,
          redrawSpread,
          idempotencyKey,
        });
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Не удалось открыть чат. Попробуйте ещё раз."
        );
        trackPhotoReadingPhase("interpret_fail");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setStreamingAnalysis("");
    setStep("result");
    let ritualActive = false;
    const interpretAbort = new AbortController();
    const interpretWatchdog = window.setTimeout(() => interpretAbort.abort(), 3 * 60_000);

    try {
      onSpreadRitualStart?.(redrawSpread);
      ritualActive = true;

      const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
      const { status: resStatus, data } = await postWithAsyncJob({
        url: PHOTO_STREAM_URL,
        storageKey: "aura:photo-reading-active-job",
        signal: interpretAbort.signal,
        headers: { "Idempotency-Key": idempotencyKey },
        body: {
          characterId: masterId,
          question: questionText,
          sessionId,
          confirmedSpread: redrawSpread,
          idempotencyKey,
        },
      });

      if (resStatus === 429) {
        setStep("confirm");
        setError("Слишком много фото-чтений. Подождите минуту.");
        return;
      }

      if (resStatus === 402) {
        setStep("confirm");
        const parsed = parseInsufficientRunes(data);
        if (parsed) {
          onInsufficientRunes?.({ balance: parsed.balance, required: parsed.required });
          onOpenPaywall?.();
          setError(`Недостаточно рун. Не хватает ${parsed.shortage} ᚢ.`);
          return;
        }
      }

      if (resStatus === 422 && data.error === "INCOMPLETE_SPREAD") {
        setStep("confirm");
        setError(pickUserFacingError(data, "Добавьте хотя бы один символ в расклад."));
        return;
      }

      if (resStatus >= 500 || data.code === "generation_failed" || data.llmFailed) {
        setStep("confirm");
        setStreamingAnalysis("");
        setError(
          pickUserFacingError(
            data,
            "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз."
          )
        );
        if (typeof data.runeBalance === "number") {
          onRuneBalanceChange?.(data.runeBalance as number);
        }
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      if (resStatus >= 400) {
        setStep("confirm");
        setError(pickUserFacingError(data, "Не удалось расшифровать расклад"));
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      // Charge/job dedupe: first interpret still running — resume without fail UI.
      if (data.pending || (data.reused && !String(data.analysis ?? data.reply ?? "").trim())) {
        const pendingMsg =
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Разбор уже выполняется — дождитесь результата в сессии.";
        setLoading(false);
        setStreamingAnalysis("");
        if (typeof data.runeBalance === "number") {
          onRuneBalanceChange?.(data.runeBalance as number);
        }
        if (ritualActive) {
          onSpreadRitualEnd?.();
          ritualActive = false;
        }
        if (onContinueChat && typeof data.sessionId === "string" && data.sessionId) {
          setStep("result");
          setError("");
          try {
            await onContinueChat(masterId, {
              analysis: "",
              question: questionText,
              detectedCards,
              redrawSpread: redrawSpread ?? undefined,
              sessionId: data.sessionId,
            });
          } catch {
            setStep("confirm");
            setError(pendingMsg);
          }
          trackPhotoReadingPhase("interpret_done", { cached: true, pending: true });
          return;
        }
        setStep("confirm");
        setError(pendingMsg);
        trackPhotoReadingPhase("interpret_done", { cached: true, pending: true });
        return;
      }

      const analysis = String(data.analysis ?? data.reply ?? "");
      if (!analysis.trim()) {
        setStep("confirm");
        setError("Не удалось получить трактовку. Попробуйте ещё раз.");
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      const nextResult = {
        analysis,
        detectedCards: (data.detectedCards as string[]) ?? detectedCards,
        deckType: data.deckType as string | undefined,
        spreadType: data.spreadType as string | undefined,
        saved: Boolean(data.saved),
        historyId: data.historyId as string | undefined,
      };
      setResult(nextResult);
      setStreamingAnalysis(analysis);
      setLoading(false);

      if (typeof data.runeBalance === "number") {
        onRuneBalanceChange?.(data.runeBalance as number);
      }
      if (data.firstPhotoDiscount) {
        setPhotoPricing((prev) =>
          prev ? { ...prev, firstPhotoDiscount: false, effectiveCost: prev.baseCost } : prev
        );
      }
      if (data.saved || data.historyId) onSaved?.();
      trackPhotoReadingPhase("interpret_done", { cached: Boolean(data.cached) });

      if (onContinueChat && analysis && !data.cached) {
        if (ritualActive) {
          onSpreadRitualEnd?.();
          ritualActive = false;
        }
        try {
          await Promise.race([
            onContinueChat(masterId, {
              analysis,
              question: questionText,
              detectedCards: nextResult.detectedCards,
              redrawSpread: redrawSpread ?? undefined,
              sessionId: data.sessionId as string | undefined,
              historyId: nextResult.historyId,
            }),
            new Promise<void>((_, reject) =>
              window.setTimeout(() => reject(new Error("chat_handoff_timeout")), 20_000)
            ),
          ]);
        } catch {
          // Analysis already shown/saved — handoff is best-effort.
        }
        return;
      }
    } catch (err) {
      const aborted =
        interpretAbort.signal.aborted ||
        (err instanceof Error && /отменен|cancelled|abort/i.test(err.message));
      setStep("confirm");
      setError(
        aborted
          ? "Расшифровка занимает слишком долго. Обновите страницу или откройте кабинет — расклад мог уже сохраниться."
          : err instanceof Error && err.message
            ? err.message
            : "Ошибка сети. Попробуйте ещё раз."
      );
      trackPhotoReadingPhase("interpret_fail");
    } finally {
      window.clearTimeout(interpretWatchdog);
      setLoading(false);
      if (ritualActive) {
        onSpreadRitualEnd?.();
      }
    }
  };

  const handleFollowUpChip = async (chipQuestion: string) => {
    trackPhotoReadingPhase("followup_chip");
    if (!onContinueChat || !result) return;
    await onContinueChat(masterId, {
      analysis: result.analysis,
      question: chipQuestion,
      detectedCards: result.detectedCards,
      redrawSpread: redrawSpread ?? undefined,
      historyId: result.historyId,
    });
    onClose();
  };

  const handleContinueChat = async () => {
    if (!result || !onContinueChat) return;
    await onContinueChat(masterId, {
      analysis: result.analysis,
      question: question.trim() || undefined,
      detectedCards: result.detectedCards,
      redrawSpread: redrawSpread ?? undefined,
      historyId: result.historyId,
    });
    onClose();
  };

  const resultCards = useMemo(
    () => (redrawSpread ? redrawSpreadToDeckCards(redrawSpread) : []),
    [redrawSpread]
  );
  const followUpChips = useMemo(
    () => buildPhotoFollowUpChips(question),
    [question]
  );
  const ritualUpsellHref = useMemo(
    () => ritualHrefForQuestion(question),
    [question]
  );
  const displayAnalysis = streamingAnalysis || result?.analysis || "";

  const resultSharePayload = useMemo(() => {
    if (!displayAnalysis.trim()) return null;
    return chatSpreadToSharePayload({
      characterId: masterId,
      masterName: masterDisplayName,
      spreadTitle: "Расклад по фото",
      cards: resultCards.map((c) => ({ name: c.name, meaning: c.meaning })),
      deckSystem: redrawSpread?.system,
      excerpt: displayAnalysis,
      sessionId,
    });
  }, [displayAnalysis, masterId, masterDisplayName, resultCards, redrawSpread?.system, sessionId]);

  return (
    <BodyPortal active={open}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[6500] flex items-end justify-center sm:items-center sm:p-4"
            data-flow-overlay="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <button
              type="button"
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => !loading && onClose()}
              aria-label="Закрыть"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-reading-title"
              className="relative z-10 photo-flow-dialog flex w-full max-h-[min(90dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-t-3xl border border-white/10 sm:mx-4 sm:max-w-lg sm:rounded-3xl"
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.97 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
            >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aura-gold/40 to-transparent" />

            <div className="photo-flow-dialog__header relative flex shrink-0 items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <div className="relative">
                <MasterAvatar
                  masterId={masterId}
                  masterName={masterDisplayName}
                  size="md"
                  thumb
                />
                <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-aura-gold text-[8px]">
                  ✦
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="photo-reading-title" className="font-display text-base font-semibold text-white leading-tight">
                  {masterDisplayName} · фото-расклад
                </h2>
                <p className="text-[11px] text-aura-gold/70 mt-0.5">
                  {runeConfig.enabled && step !== "result"
                    ? `${photoPriceLabel} · распознавание и расшифровка`
                    : (selectedMaster?.title ?? "Фото-расклад")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-500 transition-colors hover:text-white disabled:opacity-40"
                aria-label="Закрыть окно"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="shrink-0 px-4 pb-2 pt-1 sm:px-5 sm:pb-3">
              <PhotoFlowSteps step={step} />
            </div>

            {aiMasters.length > 1 && step === "upload" && (
              <div className="photo-flow-field shrink-0 px-4 pb-2 sm:px-5 sm:pb-3">
                <label htmlFor="photo-master-select">Мастер</label>
                <select
                  id="photo-master-select"
                  value={masterId}
                  onChange={(e) => setMasterId(e.target.value)}
                  disabled={loading}
                >
                  {aiMasters.map((m) => (
                    <option key={m.id} value={m.id} className="bg-zinc-900">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="lux-scroll lux-scroll--above-footer min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:space-y-4 sm:px-5 sm:py-4">

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="photo-flow-loading"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura-gold" />
                  <span>
                    {step === "result" || step === "confirm"
                      ? `${masterDisplayName} расшифровывает… ${loadingElapsedLabel}`
                      : recognizeAttempt > 1
                        ? `Повторная отправка (${recognizeAttempt}/${RECOGNIZE_MAX_ATTEMPTS})… ${loadingElapsedLabel}`
                        : `Распознаём и перерисовываем… ${loadingElapsedLabel}`}
                  </span>
                </motion.div>
              )}

              {/* ── STEP: UPLOAD ── */}
              {step === "upload" && (
                <>
                  {mergeBaseCount !== null && (
                    <div className="photo-flow-panel photo-flow-panel--status mb-3">
                      <span className="photo-flow-badge photo-flow-badge--medium">
                        Добавляем ко {mergeBaseCount} уже подтверждённым картам
                      </span>
                    </div>
                  )}
                  {/* Guide */}
                  <PhotoReadingGuide compact={!!previewUrl} />
                  {draftRestored && (
                    <p role="status" className="mb-3 text-sm text-aura-champagne">
                      Черновик восстановлен. Проверьте вопрос и продолжите разбор.
                    </p>
                  )}

                  {/* Upload zone */}
                  {!previewUrl ? (
                    <div className={`grid gap-3 ${isMobile ? "grid-cols-2" : "grid-cols-1"}`}>
                      {isMobile && (
                        <button
                          type="button"
                          onClick={() => void pickFromAppSource("camera")}
                          disabled={appCameraBusy}
                          className="photo-flow-upload-tile disabled:opacity-60"
                        >
                          <span className="photo-flow-upload-tile__icon">
                            {appCameraBusy ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                              <Camera className="h-6 w-6" />
                            )}
                          </span>
                          <span className="text-xs font-medium text-white/85">
                            {appCameraBusy ? "Открываем камеру…" : "Сделать фото"}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void pickFromAppSource("gallery")}
                        className={`photo-flow-upload-tile sm:py-8 ${!isMobile ? "col-span-full" : ""}`}
                      >
                        <span className="photo-flow-upload-tile__icon">
                          <ImagePlus className="h-6 w-6" />
                        </span>
                        <span className="text-sm font-medium text-white/85">Загрузить фото</span>
                        <span className="text-[11px] text-white/38">JPG, PNG, WebP · до 5 МБ</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Ваш расклад"
                          className="max-h-36 w-full object-contain sm:max-h-52"
                        />
                        {/* Framing guide: helps the client self-check composition before sending — corners of the recommended crop area. */}
                        <div className="pointer-events-none absolute inset-3 sm:inset-4" aria-hidden>
                          <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-sm border-l-2 border-t-2 border-aura-gold/60" />
                          <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-sm border-r-2 border-t-2 border-aura-gold/60" />
                          <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-sm border-b-2 border-l-2 border-aura-gold/60" />
                          <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-sm border-b-2 border-r-2 border-aura-gold/60" />
                        </div>
                        {preparingImage ? (
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 text-sm text-gray-200">
                            <Loader2 className="h-4 w-4 animate-spin text-aura-gold" />
                            Подготавливаем фото…
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute right-2.5 top-2.5 rounded-full bg-black/70 p-1.5 text-gray-300 hover:text-white"
                          aria-label="Удалить фото"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-center text-[11px] text-white/40">
                        Все карты видны в рамке? Без бликов и теней?
                      </p>
                    </div>
                  )}

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0], "camera")}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0], "gallery")}
                  />

                  <div className="photo-flow-field">
                    <label htmlFor="photo-question">Ваш вопрос (необязательно)</label>
                    <textarea
                      id="photo-question"
                      ref={questionInputSyncRef}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Что означает этот расклад?"
                      rows={2}
                      className="resize-none placeholder:text-white/28"
                    />
                  </div>

                  <div className="photo-flow-hint">
                    <p>Нет фото или не читается снимок?</p>
                    <button
                      type="button"
                      onClick={startManualSpread}
                      disabled={loading || runesBlocked}
                      className="disabled:opacity-40"
                    >
                      Собрать расклад вручную
                    </button>
                  </div>

                  {runeConfig.enabled && (
                    <p className="text-center text-xs text-gray-500">
                      Стоимость — {formatRunes(photoCost)} (руны Zovus)
                      {photoPricing?.firstPhotoDiscount && photoCost < photoBaseCost ? (
                        <>
                          {" "}
                          <span className="text-aura-gold/80">
                            (первая расшифровка −50%, далее {formatRunes(photoBaseCost)})
                          </span>
                        </>
                      ) : null}
                      . Сначала распознаём карты, вы проверяете позиции, затем получаете
                      расшифровку мастера.
                    </p>
                  )}
                </>
              )}

              {/* ── STEP: CONFIRM ── */}
              {step === "confirm" && redrawSpread && (
                <>
                  {(sourcePhotoUrl ||
                    (!manualMode && recognitionConfidence !== "unknown") ||
                    !isPhotoSpreadComplete(redrawSpread)) && (
                    <div className="photo-flow-panel photo-flow-panel--status">
                      {sourcePhotoUrl ? (
                        <button
                          type="button"
                          onClick={() => setShowSourceCompare((v) => !v)}
                          className="photo-flow-link"
                        >
                          {showSourceCompare ? "Скрыть фото" : "Исходное фото"}
                        </button>
                      ) : null}
                      {!manualMode && recognitionConfidence !== "unknown" ? (
                        <span
                          className={`photo-flow-badge photo-flow-badge--${
                            recognitionConfidence === "high"
                              ? "high"
                              : recognitionConfidence === "low"
                                ? "low"
                                : "medium"
                          }`}
                        >
                          {confidenceLabel(recognitionConfidence)}
                        </span>
                      ) : null}
                      {!isPhotoSpreadComplete(redrawSpread) ? (
                        <span className="photo-flow-badge photo-flow-badge--warn">
                          Добавьте символ · {redrawSpread.cards.length}
                        </span>
                      ) : null}
                      {showSourceCompare && sourcePhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sourcePhotoUrl}
                          alt="Исходный расклад"
                          className="photo-flow-source-thumb"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className="photo-flow-confirm-faces">
                    {!confirmFacesReady ? (
                      <div className="photo-flow-confirm-faces__ritual">
                        <SpreadReadingRitualPanel
                          active
                          phrases={CONFIRM_FACE_LOAD_PHRASES}
                        />
                      </div>
                    ) : null}
                    <div
                      className={
                        confirmFacesReady
                          ? "photo-flow-confirm-faces__preview"
                          : "photo-flow-confirm-faces__preview photo-flow-confirm-faces__preview--loading"
                      }
                      aria-hidden={!confirmFacesReady}
                    >
                      <PhotoSpreadPreview
                        spread={redrawSpread}
                        masterId={masterId}
                        onChange={setRedrawSpread}
                        confidence={recognitionConfidence}
                        manualMode={manualMode}
                        recognitionFailed={recognitionFailed}
                        hideStatusLine
                        onFacesReadyChange={setConfirmFacesReady}
                      />
                    </div>
                  </div>

                  {confirmFacesReady && redrawSpread.cards.length < MAX_PHOTO_CARDS_LIMIT && (
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={startAddPhotoMerge}
                        className="photo-flow-link"
                      >
                        + Добавить карты с другого фото
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── STEP: RESULT ── */}
              {step === "result" && redrawSpread && (result || streamingAnalysis || loading) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <MasterAvatar masterId={masterId} masterName={masterDisplayName} size="sm" />
                    <p className="font-display text-base font-semibold text-white">{masterDisplayName}</p>
                  </div>

                  {resultCards.length > 0 && (
                    <div className="rounded-2xl border border-aura-gold/12 bg-black/20 p-4">
                      <DeckCardsRow
                        cards={resultCards}
                        system={redrawSpread.system}
                        masterId={masterId}
                        size="md"
                        aligned
                        enableDetail
                      />
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
                    {displayAnalysis ? (
                      <>
                        <ChatMessageRenderer content={displayAnalysis} role="assistant" />
                        {!loading ? (
                          <MessageAudioPlayer text={displayAnalysis} characterId={masterId} />
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Мастер готовит расшифровку… {loadingElapsedLabel}
                        {loadingElapsedSec >= 60 ? (
                          <span className="mt-1 block text-xs text-white/40">
                            Обычно 30–90 сек. Если дольше двух минут — откройте кабинет, расклад мог уже сохраниться.
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>

                  {result?.saved && !loading && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-aura-emerald">Расклад сохранён в кабинете.</p>
                      <Link href="/cabinet#мои-расклады" className="btn-luxe btn-luxe--sm btn-luxe--gold">
                        Открыть
                      </Link>
                    </div>
                  )}

                  {!loading && resultSharePayload && (
                    <div className="flex justify-center">
                      <ShareButton payload={resultSharePayload} variant="pill" label="Поделиться раскладом" />
                    </div>
                  )}

                  {!loading && displayAnalysis && onContinueChat ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Продолжить в чате</p>
                      <div className="flex flex-wrap gap-2">
                        {followUpChips.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => void handleFollowUpChip(chip.question)}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300 hover:border-aura-gold/30 hover:text-white"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!loading && ritualUpsellHref ? (
                    <Link
                      href={ritualUpsellHref}
                      onClick={() => trackPhotoReadingPhase("ritual_upsell")}
                      className="block rounded-xl border border-aura-gold/25 bg-aura-gold/8 px-4 py-3 text-sm text-white/75 hover:border-aura-gold/40"
                    >
                      Расклад показал направление — усилите результат{" "}
                      <span className="text-aura-gold">обрядом →</span>
                    </Link>
                  ) : null}
                </motion.div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2"
                >
                  <p className="photo-flow-alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </p>
                  {(showRescueActions || step === "upload") && (
                    <div className="flex flex-wrap gap-2">
                      {imageData && (
                        <button
                          type="button"
                          onClick={() => void recognize()}
                          disabled={loading}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white"
                        >
                          Попробовать снова
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={startManualSpread}
                        disabled={loading || runesBlocked}
                        className="rounded-xl border border-aura-gold/25 px-3 py-2 text-xs text-aura-gold hover:bg-aura-gold/10"
                      >
                        Собрать вручную
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white"
                      >
                        Другое фото
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Not logged in */}
              {!isLoggedIn && step === "upload" && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-aura-gold/20 bg-aura-gold/[0.05] px-4 py-5 text-center">
                  <StarterRunesValue variant="badge" />
                  <p className="text-sm text-gray-300">
                    После входа выбранное фото и вопрос вернутся в этой вкладке. Разбор и диалог
                    сохранятся в кабинете.
                  </p>
                  <Link
                    href={buildRegisterHref(photoAuthReturnTo())}
                    onClick={(event) => { event.preventDefault(); continueThroughAuth("register"); }}
                    className="btn-luxe btn-luxe--sm btn-luxe--gold"
                  >
                    Создать аккаунт и продолжить
                  </Link>
                  <Link
                    href={buildLoginHref(photoAuthReturnTo())}
                    onClick={(event) => { event.preventDefault(); continueThroughAuth("login"); }}
                    className="text-xs text-aura-ivory/50 transition hover:text-aura-champagne"
                  >
                    Уже есть аккаунт? Войти
                  </Link>
                </div>
              )}

              {draftSaveFailedHref && (
                <Link href={draftSaveFailedHref} className="mt-3 block text-center text-sm text-aura-gold underline">
                  Продолжить без сохранения черновика
                </Link>
              )}

              {/* Runes blocked */}
              {runesBlocked && isLoggedIn && (step === "upload" || step === "confirm") && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-200/80">
                  <span>Нужно {formatRunes(photoCost)}, у вас {formatRunes(runeBalance)}</span>
                  {onOpenPaywall ? (
                    <button
                      type="button"
                      onClick={onOpenPaywall}
                      className="text-xs font-semibold text-amber-300 underline"
                    >
                      Пополнить →
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="photo-flow-dialog__footer shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
              {step === "upload" && (
                <button
                  type="button"
                  onClick={() => void recognize()}
                  disabled={!imageData || loading || preparingImage || runesBlocked}
                  className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex items-center justify-center gap-2">
                    {loading || preparingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {preparingImage
                      ? `Подготавливаем фото… ${loadingElapsedLabel}`
                      : loading
                      ? recognizeAttempt > 1
                        ? `Повторная отправка (${recognizeAttempt}/${RECOGNIZE_MAX_ATTEMPTS})… ${loadingElapsedLabel}`
                        : `Распознаём и перерисовываем… ${loadingElapsedLabel}`
                      : !isLoggedIn
                        ? "Сохранить фото и продолжить"
                      : runeConfig.enabled
                        ? `Начать фото-расклад · ${formatRunes(photoCost)}`
                        : "Начать фото-расклад"}
                  </span>
                </button>
              )}

              {step === "confirm" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void interpret()}
                    disabled={
                      !isPhotoSpreadComplete(redrawSpread) ||
                      loading ||
                      runesBlocked ||
                      !confirmFacesReady
                    }
                    className="btn-luxe btn-luxe--md btn-luxe--gold flex-1 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Расшифровывает… {loadingElapsedLabel}</>
                      ) : !confirmFacesReady ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Проявляем карты…</>
                      ) : (
                        <>Подтвердить<ArrowRight className="h-4 w-4" /></>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("upload");
                      setRedrawSpread(null);
                      setManualMode(false);
                      setRecognitionFailed(false);
                      setShowRescueActions(false);
                    }}
                    disabled={loading}
                    className="btn-luxe btn-luxe--md btn-luxe--silver shrink-0 disabled:opacity-40"
                  >
                    Назад
                  </button>
                </div>
              )}

              {step === "result" && (
                <div className="flex gap-3">
                  {onContinueChat && (
                    <button
                      type="button"
                      onClick={() => void handleContinueChat()}
                      className="btn-luxe btn-luxe--md btn-luxe--gold flex flex-1 items-center justify-center gap-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Перейти в чат
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setResult(null); setRedrawSpread(null); setStep("upload"); clearImage(); }}
                    className="btn-luxe btn-luxe--md btn-luxe--silver shrink-0"
                  >
                    Новое фото
                  </button>
                </div>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}
