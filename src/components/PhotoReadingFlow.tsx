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
import { buildPhotoReadingChatMessages } from "@/lib/photo-chat";
import { saveChatCache } from "@/lib/chat-cache";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY, type RedrawSpread } from "@/lib/photo-spread-redraw";
import { masterQuestionUnit } from "@/lib/master-pricing";
import PhotoSpreadPreview from "@/components/PhotoSpreadPreview";
import DeckCardsRow from "@/components/DeckCardsRow";
import MasterAvatar from "@/components/MasterAvatar";
import MasterPicker from "@/components/MasterPicker";

export const PHOTO_READING_RETURN = "/?photo=1";

type FlowStep = "upload" | "confirm" | "result";

export interface PhotoReadingChatPayload {
  analysis: string;
  question?: string;
  detectedCards: string[];
  redrawSpread?: RedrawSpread;
}

interface PhotoReadingFlowProps {
  open: boolean;
  onClose: () => void;
  masters: ShowcaseMaster[];
  isLoggedIn: boolean;
  defaultMasterId?: string;
  sessionId?: string;
  userName?: string;
  onContinueChat?: (masterId: string, payload: PhotoReadingChatPayload) => void;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeMatch = header.match(/data:([^;]+)/);
      resolve({
        base64,
        mimeType: mimeMatch?.[1] ?? file.type ?? "image/jpeg",
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function systemHint(master: ShowcaseMaster | undefined): string {
  if (!master) return "Загрузите фото расклада — мы перерисуем его колодой Aura.";
  const system = master.system ?? resolveMasterDeckSystem(master.id);
  const unit = masterQuestionUnit(system);
  return `Мастер читает ${unit.replace("за вопрос", "на фото")}. После распознавания вы подтвердите перерисованный расклад.`;
}

export default function PhotoReadingFlow({
  open,
  onClose,
  masters,
  isLoggedIn,
  defaultMasterId = "veronika",
  sessionId,
  onContinueChat,
  onInsufficientRunes,
}: PhotoReadingFlowProps) {
  const { config: runeConfig, cost: runeCost, formatRunes, formatRunesWithRub } = useRuneConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  const [step, setStep] = useState<FlowStep>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [masterId, setMasterId] = useState(defaultMasterId);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
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
  const masterSystem = selectedMaster?.system ?? resolveMasterDeckSystem(masterId);
  const photoCost = runeCost("VISION_ANALYSIS");
  const photoPriceLabel = formatRunesWithRub(photoCost);
  const priceUnit = masterQuestionUnit(masterSystem);

  useEffect(() => {
    if (open) setMasterId(defaultMasterId);
  }, [open, defaultMasterId]);

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

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Выберите изображение (JPG, PNG, WebP)");
      return;
    }
    setError("");
    setResult(null);
    setRedrawSpread(null);
    setStep("upload");
    const data = await readFileAsBase64(file);
    setImageData(data);
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
    setRedrawSpread(null);
    setResult(null);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const recognize = async () => {
    if (!isLoggedIn) {
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`;
      return;
    }
    if (!imageData) {
      setError("Сначала загрузите или сфотографируйте расклад");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/photo-reading/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: masterId,
          imageBase64: imageData.base64,
          mimeType: imageData.mimeType,
          question: question.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        window.location.href = `/auth/user/login?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`;
        return;
      }

      if (res.status === 422) {
        setError(data.message ?? "На фото не удалось распознать расклад");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? data.message ?? "Не удалось распознать расклад");
        return;
      }

      setRedrawSpread(data.redrawSpread as RedrawSpread);
      // #region agent log
      fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
        body: JSON.stringify({
          sessionId: "f9adef",
          runId: "photo-recognize",
          hypothesisId: "A-B",
          location: "PhotoReadingFlow.tsx:recognize",
          message: "photo redraw spread",
          data: {
            detected: data.detectedCards,
            system: data.deckSystem,
            cards: (data.redrawSpread as RedrawSpread)?.cards?.map((c) => ({
              name: c.name,
              placeholder: c.placeholder,
              reversed: c.reversed,
            })),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setPreviewUrl(null);
      setImageData(null);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setStep("confirm");
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const interpret = async () => {
    if (!redrawSpread?.cards.length) return;

    setLoading(true);
    setError("");

    try {
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

      if (res.status === 402 && data.error === "INSUFFICIENT_RUNES") {
        onInsufficientRunes?.({
          balance: data.balance ?? 0,
          required: data.required ?? photoCost,
        });
        setError(data.message ?? "Недостаточно рун для расшифровки");
        return;
      }

      if (!res.ok) {
        setError(data.message ?? data.error ?? "Не удалось расшифровать расклад");
        return;
      }

      setResult({
        analysis: data.analysis,
        detectedCards: data.detectedCards ?? [],
        deckType: data.deckType,
        spreadType: data.spreadType,
        saved: data.saved ?? false,
        historyId: data.historyId,
      });
      setStep("result");

      if (onContinueChat && data.analysis) {
        const chatMessages = buildPhotoReadingChatMessages(
          data.analysis,
          question,
          data.detectedCards ?? []
        );
        saveChatCache(masterId, chatMessages);
      }
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueChat = () => {
    if (!result || !onContinueChat) return;
    onContinueChat(masterId, {
      analysis: result.analysis,
      question: question.trim() || undefined,
      detectedCards: result.detectedCards,
      redrawSpread: redrawSpread ?? undefined,
    });
    onClose();
  };

  const resultCards = useMemo(
    () =>
      redrawSpread?.cards.map((c) => ({
        name: c.reversed ? `${c.name} (перев.)` : c.name,
        meaning: c.shortMeaning,
      })) ?? [],
    [redrawSpread]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-reading-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !loading && onClose()}
            aria-label="Закрыть"
          />

          <motion.div
            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-aura-bg shadow-2xl sm:rounded-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3 pr-2">
                {selectedMaster ? (
                  <MasterAvatar
                    masterId={masterId}
                    masterName={selectedMaster.name}
                    size="md"
                    thumb
                  />
                ) : null}
                <div className="min-w-0">
                <h2 id="photo-reading-title" className="font-display text-xl font-semibold text-white sm:text-2xl">
                  Прочитай мой расклад
                </h2>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  {systemHint(selectedMaster)}
                </p>
                {runeConfig.enabled && step !== "result" && (
                  <p className="mt-1 text-xs text-aura-gold/90">
                    {formatRunes(photoCost)} (~{Math.round(photoCost * runeConfig.rubPerRune)} ₽) · {priceUnit}
                  </p>
                )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="shrink-0 rounded-full border border-white/10 bg-black/30 p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-40"
                aria-label="Закрыть окно"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              {loading && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-aura-gold/20 bg-black/30 px-4 py-3">
                  <MasterAvatar
                    masterId={masterId}
                    masterName={selectedMaster?.name}
                    size="sm"
                    thumb
                  />
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura-gold" />
                  <span className="text-sm text-gray-400">
                    {step === "confirm"
                      ? `${selectedMaster?.name ?? "Мастер"} расшифровывает…`
                      : "Распознаём и перерисовываем…"}
                  </span>
                </div>
              )}

              {step === "upload" && (
                <>
                  {!previewUrl ? (
                    <div className={`grid gap-4 ${isMobile ? "sm:grid-cols-2" : ""}`}>
                      {isMobile && (
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-aura-purple/40 bg-aura-purple/5 p-8 transition-colors hover:border-aura-purple/70 hover:bg-aura-purple/10"
                        >
                          <Camera className="h-10 w-10 text-aura-neon" />
                          <span className="text-sm font-medium text-white">Сделать фото</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 transition-colors hover:border-white/40 hover:bg-black/30 ${!isMobile ? "col-span-full" : ""}`}
                      >
                        <ImagePlus className="h-10 w-10 text-gray-400" />
                        <span className="text-sm font-medium text-white">Загрузить фото</span>
                        <span className="text-xs text-gray-500">JPG, PNG, скриншот</span>
                      </button>
                    </div>
                  ) : (
                    <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Ваш расклад"
                        className="max-h-64 w-full object-contain bg-black/40"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-gray-300 hover:text-white"
                        aria-label="Удалить фото"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture={isMobile ? "environment" : undefined}
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                  />

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="mb-2 block text-xs text-gray-500">Мастер</label>
                      <MasterPicker
                        masters={masters}
                        value={masterId}
                        onChange={setMasterId}
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs text-gray-500">
                        Ваш вопрос к раскладу (необязательно)
                      </label>
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Например: что означает этот расклад для моих отношений?"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-gray-600"
                      />
                    </div>
                  </div>
                </>
              )}

              {step === "confirm" && redrawSpread && (
                <PhotoSpreadPreview
                  spread={redrawSpread}
                  masterId={masterId}
                  onChange={setRedrawSpread}
                />
              )}

              {step === "result" && result && redrawSpread && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="mb-4 flex items-center gap-3">
                    <MasterAvatar
                      masterId={masterId}
                      masterName={selectedMaster?.name}
                      size="md"
                    />
                    <p className="font-display text-lg font-semibold text-white">
                      {selectedMaster?.name ?? "Мастер"}
                    </p>
                  </div>

                  {resultCards.length > 0 && (
                    <div className="mb-5 rounded-2xl border border-aura-gold/15 bg-black/20 p-4">
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

                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {result.analysis}
                    </p>
                    <MessageAudioPlayer text={result.analysis} characterId={masterId} />
                  </div>

                  {result.saved && (
                    <p className="mt-3 text-xs text-aura-emerald">
                      Расклад сохранён в{" "}
                      <Link href="/cabinet#мои-расклады" className="underline">
                        личном кабинете
                      </Link>
                      .
                    </p>
                  )}
                </motion.div>
              )}

              {error && (
                <p className="mt-4 flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              {!isLoggedIn && step === "upload" && (
                <p className="mt-4 text-center text-sm text-gray-500">
                  <Link
                    href={`/auth/user/register?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`}
                    className="text-aura-neon hover:underline"
                  >
                    Зарегистрируйтесь
                  </Link>
                  , чтобы получить расшифровку
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {step === "upload" && (
                  <button
                    type="button"
                    onClick={() => void recognize()}
                    disabled={!imageData || loading}
                    className="btn-primary flex flex-1 items-center justify-center gap-2 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Распознаём и перерисовываем…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Распознать расклад
                      </>
                    )}
                  </button>
                )}

                {step === "confirm" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void interpret()}
                      disabled={!redrawSpread?.cards.length || loading}
                      className="btn-primary flex flex-1 items-center justify-center gap-2 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {selectedMaster?.name ?? "Мастер"} расшифровывает…
                        </>
                      ) : (
                        <>
                          Подтвердить и расшифровать
                          <ArrowRight className="h-4 w-4" />
                          {runeConfig.enabled ? formatRunes(photoCost) : ""}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("upload");
                        setRedrawSpread(null);
                      }}
                      disabled={loading}
                      className="btn-ghost px-5 py-3 text-sm"
                    >
                      Другое фото
                    </button>
                  </>
                )}

                {step === "result" && (
                  <>
                    {onContinueChat && (
                      <button
                        type="button"
                        onClick={handleContinueChat}
                        className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Перейти в чат
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        setRedrawSpread(null);
                        setStep("upload");
                        clearImage();
                      }}
                      className="btn-ghost px-5 py-2.5 text-sm"
                    >
                      Новое фото
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
