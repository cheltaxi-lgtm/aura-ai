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
import { useRuneConfig } from "@/lib/useRuneConfig";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY, type RedrawSpread, redrawSpreadToDeckCards } from "@/lib/photo-spread-redraw";
import {
  PHOTO_MIN_CARD_COUNT,
  isPhotoSpreadComplete,
  normalizeRedrawSpreadForMaster,
} from "@/lib/photo-spread-redraw";
import { canAffordRunes } from "@/lib/rune-afford-client";
import { masterQuestionUnit } from "@/lib/master-pricing";
import { compressBlobToLimit, compressImageForUpload } from "@/lib/compress-image-client";
import PhotoSpreadPreview from "@/components/PhotoSpreadPreview";
import PhotoReadingGuide from "@/components/PhotoReadingGuide";
import DeckCardsRow from "@/components/DeckCardsRow";
import MasterAvatar from "@/components/MasterAvatar";
export const PHOTO_READING_RETURN = "/?photo=1";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Client-side compression target: preserve vision quality while staying below infra limits. */
const UPLOAD_TARGET_BYTES = 2_500_000;
const HEAVY_FILE_BYTES = 2_500_000;
const PHOTO_UPLOAD_REV = "photo-upload-v17";
const RECOGNIZE_URL = "/api/photo-reading/recognize";
const RECOGNIZE_MAX_ATTEMPTS = 3;
const RECOGNIZE_RETRY_BASE_MS = 400;
/** fetch times out quickly so XHR can take over with a fresh connection */
const FETCH_PROBE_TIMEOUT_MS = 3_000;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

type FlowStep = "upload" | "confirm" | "result";

export interface PhotoReadingChatPayload {
  analysis: string;
  question?: string;
  detectedCards: string[];
  redrawSpread?: RedrawSpread;
  sessionId?: string;
  historyId?: string;
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
  onContinueChat?: (masterId: string, payload: PhotoReadingChatPayload) => void | Promise<void>;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
  onSaved?: () => void;
  runeBalance?: number;
  isUnlimited?: boolean;
  onOpenPaywall?: () => void;
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

const RECOGNIZE_TIMEOUT_MS = 120_000;

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

/**
 * fetch probe: always fails fast in this env, but its failure clears stale
 * keep-alive connections so the subsequent XHR can open a fresh one.
 */
function probeFetch(formData: FormData): Promise<{ status: number; text: string }> {
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${RECOGNIZE_URL}` : RECOGNIZE_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_PROBE_TIMEOUT_MS);
  return fetch(url, {
    method: "POST",
    body: formData,
    signal: controller.signal,
    credentials: "include",
    cache: "no-store",
  })
    .then(async (res) => {
      clearTimeout(timeoutId);
      return { status: res.status, text: await res.text() };
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") throw new Error("fetch_timeout");
      throw err;
    });
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
 * Probe with fetch first (fails fast, clears stale connection), then XHR.
 * If fetch actually succeeds (response received), return it directly.
 */
async function postRecognizeOnce(
  blob: Blob,
  masterId: string,
  question: string
): Promise<{ status: number; text: string }> {
  try {
    return await probeFetch(buildRecognizeFormData(blob, masterId, question));
  } catch {
    return postRecognizeXhr(buildRecognizeFormData(blob, masterId, question));
  }
}

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
      const response = await postRecognizeOnce(blob, masterId, question);
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
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function systemHint(master: ShowcaseMaster | undefined): string {
  if (!master) return "Загрузите фото — распознаём, перерисуем колодой Zovus и расшифруем у мастера.";
  const system = master.system ?? resolveMasterDeckSystem(master.id);
  const unit = masterQuestionUnit(system);
  return `Мастер читает ${unit.replace("за вопрос", "на фото")}. После распознавания подтвердите перерисованный расклад — расшифровка входит в стоимость.`;
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
  onContinueChat,
  onInsufficientRunes,
  onSaved,
  runeBalance = 0,
  isUnlimited = false,
  onOpenPaywall,
}: PhotoReadingFlowProps) {
  const { config: runeConfig, cost: runeCost, formatRunes, formatRunesWithRub } = useRuneConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const recognizeInFlightRef = useRef(false);
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  const [step, setStep] = useState<FlowStep>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string; blob: Blob } | null>(null);
  const [imageSource, setImageSource] = useState<"camera" | "gallery">("gallery");
  const [fileOriginalBytes, setFileOriginalBytes] = useState(0);
  const [masterId, setMasterId] = useState(defaultMasterId);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [recognizeAttempt, setRecognizeAttempt] = useState(0);
  const [error, setError] = useState("");
  const [redrawSpread, setRedrawSpread] = useState<RedrawSpread | null>(null);
  const [result, setResult] = useState<{
    analysis: string;
    detectedCards: string[];
    deckType?: string;
    spreadType?: string;
    saved: boolean;
    historyId?: string;
  } | null>(null);

  const selectedMaster = findShowcaseMaster(masterId, masters);
  const photoCost = runeCost("VISION_ANALYSIS");
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
  }, [open]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoggedIn]);

  useEffect(() => {
    if (open) setMasterId(defaultMasterId);
  }, [open, defaultMasterId]);

  const spreadMasterRef = useRef<string | null>(null);

  useEffect(() => {
    if (step !== "confirm") {
      spreadMasterRef.current = null;
    }
  }, [step]);

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
    setPreviewUrl(null);
    setImageData(null);
    setRedrawSpread(null);
    setResult(null);
    setError("");
    setQuestion("");
    setStep("upload");
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, [open]);

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

  const handleFile = async (file: File | undefined, source: "camera" | "gallery" = "gallery") => {
    if (!file || !isImageFile(file)) {
      setError("Выберите изображение (JPG, PNG, WebP)");
      return;
    }
    setError("");
    setResult(null);
    setRedrawSpread(null);
    setStep("upload");
    setFileOriginalBytes(file.size);
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
      setError(
        file.size > HEAVY_FILE_BYTES
          ? "Фото слишком тяжёлое и не удалось сжать. Попробуйте другое фото в JPG, PNG или WebP."
          : "Не удалось обработать изображение. Попробуйте JPG или PNG."
      );
      return;
    }
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
  };

  const clearImage = () => {
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
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`;
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
        transport: "multipart_only",
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
        window.location.href = `/auth/user/login?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`;
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
        const code = data.error ?? data.code;
        if (code === "INCOMPLETE_SPREAD") {
          setError(
            (typeof data.message === "string" && data.message) ||
              "На фото не удалось распознать символы — добавьте их вручную на следующем шаге."
          );
          return;
        }
        setError(
          (typeof data.message === "string" && data.message) ||
            "На фото не удалось распознать расклад"
        );
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
          (typeof data.message === "string" && data.message) ||
            (typeof data.error === "string" && data.error) ||
            "Не удалось распознать расклад"
        );
        return;
      }

      setRedrawSpread(data.redrawSpread as RedrawSpread);
      setPreviewUrl(null);
      setImageData(null);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setStep("confirm");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logPhotoClientError({
        phase: "recognize_crash",
        error: errMsg,
        name: isMobile ? "mobile" : "desktop",
      });
      setError("Ошибка при отправке фото. Попробуйте ещё раз.");
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

    setLoading(true);
    setError("");
    let ritualActive = false;

    try {
      onSpreadRitualStart?.(redrawSpread);
      ritualActive = true;

      const res = await fetch("/api/photo-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: masterId,
          question: question.trim() || undefined,
          sessionId,
          confirmedSpread: redrawSpread,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setError("Слишком много фото-чтений. Подождите минуту.");
        return;
      }

      if (res.status === 402) {
        const parsed = parseInsufficientRunes(data);
        if (parsed) {
          onInsufficientRunes?.({ balance: parsed.balance, required: parsed.required });
          onOpenPaywall?.();
          setError(`Недостаточно рун. Не хватает ${parsed.shortage} ᚢ.`);
          return;
        }
      }

      if (res.status === 422 && data.error === "INCOMPLETE_SPREAD") {
        setError(data.message ?? "Добавьте хотя бы один символ в расклад.");
        return;
      }

      if (!res.ok) {
        setError(data.message ?? data.error ?? "Не удалось расшифровать расклад");
        return;
      }

      const nextResult = {
        analysis: data.analysis,
        detectedCards: data.detectedCards ?? [],
        deckType: data.deckType,
        spreadType: data.spreadType,
        saved: data.saved ?? false,
        historyId: data.historyId,
      };
      setResult(nextResult);

      if (typeof data.runeBalance === "number") {
        onRuneBalanceChange?.(data.runeBalance);
      }

      if (data.saved || data.historyId) {
        onSaved?.();
      }

      if (onContinueChat && data.analysis) {
        if (ritualActive) {
          onSpreadRitualEnd?.();
          ritualActive = false;
        }
        await onContinueChat(masterId, {
          analysis: data.analysis,
          question: question.trim() || undefined,
          detectedCards: data.detectedCards ?? [],
          redrawSpread: redrawSpread ?? undefined,
          sessionId: data.sessionId,
          historyId: data.historyId,
        });
        return;
      }

      setStep("result");
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
      if (ritualActive) {
        onSpreadRitualEnd?.();
      }
    }
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          data-flow-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-reading-title"
        >
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => !loading && onClose()}
            aria-label="Закрыть"
          />

          <motion.div
            className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{
              background: "linear-gradient(160deg, #0d0a1a 0%, #120e24 60%, #0a0814 100%)",
              boxShadow: "0 0 0 1px rgba(212,175,55,0.12), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,90,200,0.08)",
            }}
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
          >
            {/* Ambient glow top */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aura-gold/40 to-transparent" />

            {/* ── HEADER ── */}
            <div className="relative flex shrink-0 items-center gap-3 px-5 pt-5 pb-4">
              <div className="relative">
                <MasterAvatar masterId="veronika" masterName="Вероника" size="md" thumb />
                <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-aura-gold text-[8px]">
                  ✦
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="photo-reading-title" className="font-display text-base font-semibold text-white leading-tight">
                  Вероника читает расклад
                </h2>
                <p className="text-[11px] text-aura-gold/70 mt-0.5">
                  {runeConfig.enabled && step !== "result"
                    ? `${photoPriceLabel} · распознавание и расшифровка`
                    : "Таро и психология"}
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

            {/* Divider */}
            <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-white/8 to-transparent mx-5" />

            {/* ── BODY ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

              {/* Loading bar */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-2xl border border-aura-gold/20 bg-aura-gold/5 px-4 py-3"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura-gold" />
                  <span className="text-sm text-gray-300">
                    {step === "confirm"
                      ? "Вероника расшифровывает…"
                      : recognizeAttempt > 1
                        ? `Повторная отправка (${recognizeAttempt}/${RECOGNIZE_MAX_ATTEMPTS})…`
                        : "Распознаём и перерисовываем…"}
                  </span>
                </motion.div>
              )}

              {/* ── STEP: UPLOAD ── */}
              {step === "upload" && (
                <>
                  {/* Guide */}
                  <PhotoReadingGuide compact={!!previewUrl} />

                  {/* Upload zone */}
                  {!previewUrl ? (
                    <div className={`grid gap-3 ${isMobile ? "grid-cols-2" : "grid-cols-1"}`}>
                      {isMobile && (
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-aura-purple/35 bg-aura-purple/5 py-6 transition-all hover:border-aura-purple/60 hover:bg-aura-purple/10"
                        >
                          <Camera className="h-7 w-7 text-aura-neon/70 transition-colors group-hover:text-aura-neon" />
                          <span className="text-xs font-medium text-white/80">Сделать фото</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] py-8 transition-all hover:border-aura-gold/30 hover:bg-aura-gold/5 ${!isMobile ? "col-span-full" : ""}`}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors group-hover:border-aura-gold/25 group-hover:bg-aura-gold/8">
                          <ImagePlus className="h-6 w-6 text-gray-500 transition-colors group-hover:text-aura-gold/70" />
                        </div>
                        <span className="text-sm font-medium text-white/80 transition-colors group-hover:text-white">
                          Загрузить фото
                        </span>
                        <span className="text-[11px] text-gray-600">JPG, PNG, WebP</span>
                      </button>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Ваш расклад"
                        className="max-h-52 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute right-2.5 top-2.5 rounded-full bg-black/70 p-1.5 text-gray-300 hover:text-white"
                        aria-label="Удалить фото"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0], "camera")}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0], "gallery")}
                  />

                  {/* Question */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-600">
                      Ваш вопрос (необязательно)
                    </label>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Что означает этот расклад?"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-700 focus:border-aura-gold/30 focus:outline-none focus:ring-0 transition-colors"
                    />
                  </div>
                </>
              )}

              {/* ── STEP: CONFIRM ── */}
              {step === "confirm" && redrawSpread && (
                <>
                  {!isPhotoSpreadComplete(redrawSpread) && (
                    <p className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-200/80">
                      Добавьте хотя бы один символ — сейчас {redrawSpread.cards.length} в раскладе.
                    </p>
                  )}
                  <PhotoSpreadPreview
                    spread={redrawSpread}
                    masterId={masterId}
                    onChange={setRedrawSpread}
                  />
                </>
              )}

              {/* ── STEP: RESULT ── */}
              {step === "result" && result && redrawSpread && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <MasterAvatar masterId="veronika" masterName="Вероника" size="sm" />
                    <p className="font-display text-base font-semibold text-white">Вероника</p>
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

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {result.analysis}
                    </p>
                    <MessageAudioPlayer text={result.analysis} characterId={masterId} />
                  </div>

                  {result.saved && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-aura-emerald">Расклад сохранён в кабинете.</p>
                      <Link href="/cabinet#мои-расклады" className="btn-luxe btn-luxe--sm btn-luxe--gold">
                        Открыть
                      </Link>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.p>
              )}

              {/* Not logged in */}
              {!isLoggedIn && step === "upload" && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-center">
                  <p className="text-sm text-gray-400">Войдите чтобы получить расшифровку</p>
                  <Link
                    href={`/auth/user/register?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`}
                    className="btn-luxe btn-luxe--sm btn-luxe--gold"
                  >
                    Зарегистрироваться
                  </Link>
                </div>
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

            {/* ── FOOTER ACTIONS ── */}
            <div className="shrink-0 border-t border-white/6 px-5 py-4">
              {step === "upload" && (
                <button
                  type="button"
                  onClick={() => void recognize()}
                  disabled={!imageData || loading || runesBlocked}
                  className="relative w-full overflow-hidden rounded-2xl py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: (!imageData || loading || runesBlocked)
                      ? "rgba(255,255,255,0.06)"
                      : "linear-gradient(135deg, #c9993a 0%, #e8c56d 50%, #c9993a 100%)",
                    color: (!imageData || loading || runesBlocked) ? "rgba(255,255,255,0.3)" : "#1a0f00",
                    boxShadow: (!imageData || loading || runesBlocked) ? "none" : "0 4px 24px rgba(212,175,55,0.35)",
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {loading
                      ? recognizeAttempt > 1
                        ? `Повторная отправка (${recognizeAttempt}/${RECOGNIZE_MAX_ATTEMPTS})…`
                        : "Распознаём и перерисовываем…"
                      : runeConfig.enabled
                        ? `Распознать расклад · ${formatRunes(photoCost)}`
                        : "Распознать расклад"}
                  </span>
                </button>
              )}

              {step === "confirm" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void interpret()}
                    disabled={!isPhotoSpreadComplete(redrawSpread) || loading || runesBlocked}
                    className="relative flex-1 overflow-hidden rounded-2xl py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, #c9993a 0%, #e8c56d 50%, #c9993a 100%)",
                      color: "#1a0f00",
                      boxShadow: "0 4px 24px rgba(212,175,55,0.3)",
                    }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Расшифровывает…</>
                      ) : (
                        <>Подтвердить<ArrowRight className="h-4 w-4" /></>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep("upload"); setRedrawSpread(null); }}
                    disabled={loading}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-400 transition-colors hover:text-white disabled:opacity-40"
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
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all"
                      style={{
                        background: "linear-gradient(135deg, #c9993a 0%, #e8c56d 50%, #c9993a 100%)",
                        color: "#1a0f00",
                        boxShadow: "0 4px 24px rgba(212,175,55,0.3)",
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Перейти в чат
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setResult(null); setRedrawSpread(null); setStep("upload"); clearImage(); }}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm text-gray-400 transition-colors hover:text-white"
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
  );
}
