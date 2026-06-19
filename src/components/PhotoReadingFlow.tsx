"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  ImagePlus,
  Loader2,
  Sparkles,
  X,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { findShowcaseMaster } from "@/lib/showcase-masters";
import MessageAudioPlayer from "@/components/MessageAudioPlayer";
import { buildPhotoReadingChatMessages } from "@/lib/photo-chat";
import { saveChatCache } from "@/lib/chat-cache";
import { useRuneConfig } from "@/lib/useRuneConfig";

export const PHOTO_READING_RETURN = "/?photo=1";

export interface PhotoReadingChatPayload {
  analysis: string;
  question?: string;
  detectedCards: string[];
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

export default function PhotoReadingFlow({
  open,
  onClose,
  masters,
  isLoggedIn,
  defaultMasterId = "veronika",
  sessionId,
  userName,
  onContinueChat,
  onInsufficientRunes,
}: PhotoReadingFlowProps) {
  const { config: runeConfig, cost: runeCost, formatRunes, formatRunesWithRub } = useRuneConfig();
  const photoCost = runeCost("VISION_ANALYSIS");
  const photoPriceLabel = formatRunesWithRub(photoCost);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [masterId, setMasterId] = useState(defaultMasterId);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    analysis: string;
    detectedCards: string[];
    deckType?: string;
    spreadType?: string;
    saved: boolean;
  } | null>(null);

  const selectedMaster = findShowcaseMaster(masterId, masters);

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
    setResult(null);
    setError("");
    setQuestion("");
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
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const analyze = async () => {
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
      const res = await fetch("/api/photo-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: masterId,
          imageBase64: imageData.base64,
          mimeType: imageData.mimeType,
          question: question.trim() || undefined,
          sessionId,
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        window.location.href = `/auth/user/login?returnTo=${encodeURIComponent(PHOTO_READING_RETURN)}`;
        return;
      }

      if (res.status === 402 && data.error === "INSUFFICIENT_RUNES") {
        onInsufficientRunes?.({
          balance: data.balance ?? 0,
          required: data.required ?? runeCost("VISION_ANALYSIS"),
        });
        setError(data.message ?? "Недостаточно рун для анализа фото");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Не удалось разобрать расклад");
        return;
      }

      const bodyText = data.analysis?.trim() ?? "";

      setResult({
        analysis: bodyText || data.analysis,
        detectedCards: data.detectedCards ?? [],
        deckType: data.deckType,
        spreadType: data.spreadType,
        saved: data.saved ?? false,
      });

      if (onContinueChat && bodyText) {
        const chatMessages = buildPhotoReadingChatMessages(
          bodyText,
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
    });
    onClose();
  };

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
            transition={{ duration: 0.22 }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="min-w-0 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="photo-reading-title" className="font-display text-xl font-semibold text-white sm:text-2xl">
                    Прочитай мой расклад
                  </h2>
                  {runeConfig.enabled && (
                    <span className="rounded-full border border-aura-gold/40 bg-aura-gold/10 px-2.5 py-0.5 text-xs font-medium text-aura-gold">
                      {photoPriceLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  Любая колода и любой расклад — фото карт или скриншот из приложения
                  {runeConfig.enabled && (
                    <span className="text-aura-gold/90"> · оплата рунами за разбор</span>
                  )}
                </p>
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
              <div className="flow-panel border-0 bg-transparent p-0 shadow-none">
                {!result ? (
                  <>
                    {!previewUrl ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-aura-purple/40 bg-aura-purple/5 p-8 transition-colors hover:border-aura-purple/70 hover:bg-aura-purple/10"
                        >
                          <Camera className="h-10 w-10 text-aura-neon" />
                          <span className="text-sm font-medium text-white">Сделать фото</span>
                          <span className="text-xs text-gray-500">Камера телефона</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 transition-colors hover:border-white/40 hover:bg-black/30"
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
                          className="max-h-80 w-full object-contain bg-black/40"
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
                        <select
                          value={masterId}
                          onChange={(e) => setMasterId(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
                        >
                          {masters.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.emoji} {m.name} — {m.specialty}
                            </option>
                          ))}
                        </select>
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

                    {error && (
                      <p className="mt-4 flex items-center gap-2 text-sm text-red-400">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                      </p>
                    )}

                    {!isLoggedIn && (
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


                    {isLoggedIn && runeConfig.enabled && (
                      <p className="mt-4 text-center text-sm text-aura-gold">
                        Стоимость разбора: {photoPriceLabel}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void analyze()}
                      disabled={!imageData || loading}
                      className="btn-neon mt-6 flex w-full items-center justify-center gap-2 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {selectedMaster?.name ?? "Мастер"} изучает карты…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {runeConfig.enabled
                            ? `Разобрать расклад — ${formatRunes(photoCost)}`
                            : "Разобрать мой расклад"}
                        </>
                      )}
                    </button>

                    <p className="mt-4 text-center text-[10px] text-gray-600">
                      Любая колода и расклад · хороший свет · все карты в кадре · без бликов
                    </p>
                  </>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="text-3xl">{selectedMaster?.emoji}</span>
                      <div>
                        <p className="font-display font-semibold text-white">
                          {selectedMaster?.name ?? "Мастер"}
                        </p>
                        <p className="text-xs text-gray-500">Расшифровка вашего фото-расклада</p>
                      </div>
                    </div>

                    {result.deckType && (
                      <p className="mb-2 text-xs text-gray-500">
                        <span className="text-aura-emerald">Колода:</span> {result.deckType}
                      </p>
                    )}
                    {result.spreadType && (
                      <p className="mb-4 text-xs text-gray-500">
                        <span className="text-aura-emerald">Расклад:</span> {result.spreadType}
                      </p>
                    )}

                    {result.detectedCards.length > 0 && (
                      <div className="mb-5 flex flex-wrap gap-2">
                        {result.detectedCards.map((card) => (
                          <span
                            key={card}
                            className="rounded-full border border-aura-gold/30 bg-aura-gold/10 px-3 py-1 text-xs text-aura-gold"
                          >
                            {card}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                        {result.analysis}
                      </p>
                      <MessageAudioPlayer text={result.analysis} characterId={masterId} />
                    </div>

                    {!result.saved && (
                      <p className="mt-3 text-xs text-gray-500">
                        Заполните профиль в{" "}
                        <Link href="/cabinet" className="text-aura-neon hover:underline">
                          кабинете
                        </Link>
                        , чтобы сохранять фото-расклады в историю.
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                      {onContinueChat && (
                        <button
                          type="button"
                          onClick={handleContinueChat}
                          className="btn-neon flex items-center gap-2 px-5 py-2.5 text-sm"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Перейти в чат с мастером
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setResult(null);
                          clearImage();
                        }}
                        className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-gray-400 hover:text-white"
                      >
                        Новое фото
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
