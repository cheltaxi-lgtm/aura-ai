"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  Mic,
  MicOff,
  Camera,
  Loader2,
  Trash2,
} from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import { normalizeMessageText } from "@/components/MessageContent";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import MessageAudioPlayer from "@/components/MessageAudioPlayer";
import SceneImage from "@/components/SceneImage";
import TarotCardsRow from "@/components/TarotCardsRow";
import SpreadFlipRow from "@/components/SpreadFlipRow";
import SessionIntentionBar from "@/components/SessionIntentionBar";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { SessionIntention, SessionTopicId } from "@/lib/intention";
import { topicLabel } from "@/lib/session-topics";
import SessionFeedback from "@/components/SessionFeedback";
import SpreadReadingRitualPanel from "@/components/SpreadReadingRitualPanel";
import MasterAvatar from "@/components/MasterAvatar";
import { CHAT_SESSION_DISCLAIMER } from "@/lib/master-disclosure";
import PythagorasSquareGrid from "@/components/PythagorasSquareGrid";
import NumerologQuickChips from "@/components/NumerologQuickChips";
import MasterQuickChips from "@/components/MasterQuickChips";
import { hasMasterQuickChips } from "@/lib/master-quick-chips";
import {
  isSessionChatQuestionCapReached,
  SESSION_CHAT_LIMIT_MESSAGE,
  SESSION_CHAT_QUESTION_LIMIT,
  sessionChatQuestionsRemaining,
} from "@/lib/session-limits";
import { resolvePythagorasSquareForMessage } from "@/lib/numerology/resolve-message-ui";
import {
  buildNumerologWelcomeMessage,
  isNumerologMaster,
  readStoredProfileForWelcome,
  resolveNumerologAssistantDisplayContent,
} from "@/lib/numerolog/welcome";

const noop = () => {};
import type { Message } from "@/types";
import { canAffordRunes } from "@/lib/rune-afford-client";
import { useSpeechInput } from "@/hooks/useSpeechInput";

interface MasterDisplay {
  name: string;
  title: string;
  emoji?: string;
}

interface ChatWindowProps {
  characterId: string;
  master?: MasterDisplay | null;
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory?: boolean;
  questionsLeft?: number | null;
  sessionQuestionsUsed?: number;
  hasFullAccess?: boolean;
  usesRuneBilling?: boolean;
  questionCost?: number;
  headerSceneUrl?: string | null;
  spreadCards?: { name: string; meaning?: string }[];
  spreadDeckSystem?: import("@/lib/decks/types").DeckSystem;
  spreadLoading?: boolean;
  /** Cards already visible — waiting for thematic reading text */
  spreadReadingLoading?: boolean;
  onSpreadReadingRitualComplete?: () => void;
  spreadVariant?: "triplet" | "photo" | "intention";
  spreadInteractiveFlip?: boolean;
  spreadFlipped?: boolean[];
  onSpreadFlip?: (index: number) => void;
  allSpreadFlipped?: boolean;
  sessionIntention?: SessionIntention | SessionTopicId | null;
  intentionHighlight?: boolean;
  insufficientRunes?: { balance: number; required: number } | null;
  runeBalance?: number;
  visionCost?: number;
  onSendMessage: (content: string, imageBase64?: string) => void;
  onClose: () => void;
  closeAriaLabel?: string;
  sessionOffline?: boolean;
  storageBlocked?: boolean;
  onReconnectSession?: () => void;
  onOpenPaywall?: () => void;
  retryDraft?: { content: string; imageBase64?: string } | null;
  onRetry?: () => void;
  hasMoreHistory?: boolean;
  loadingMoreHistory?: boolean;
  onLoadMore?: () => void;
  onClearChat?: () => void;
  readOnly?: boolean;
  onCompleteSession?: () => void;
  completingSession?: boolean;
  onArchiveSession?: () => void;
  onStartNewSession?: () => void;
  archivingSession?: boolean;
  startingNewSession?: boolean;
  /** User birth date — for numerolog Pythagoras grid fallback in chat. */
  userBirthDate?: string;
}

export default function ChatWindow({
  characterId,
  messages,
  isLoading,
  isLoadingHistory = false,
  questionsLeft,
  sessionQuestionsUsed = 0,
  hasFullAccess,
  usesRuneBilling,
  questionCost = 10,
  headerSceneUrl,
  spreadCards,
  spreadDeckSystem,
  spreadLoading = false,
  spreadReadingLoading = false,
  onSpreadReadingRitualComplete,
  spreadVariant = "triplet",
  spreadInteractiveFlip = false,
  spreadFlipped = [true, true, true],
  onSpreadFlip,
  allSpreadFlipped = true,
  sessionIntention,
  intentionHighlight = false,
  insufficientRunes,
  runeBalance = 0,
  visionCost = 15,
  master,
  onSendMessage,
  onClose,
  closeAriaLabel = "Назад к списку мастеров",
  sessionOffline,
  storageBlocked,
  onReconnectSession,
  onOpenPaywall,
  retryDraft,
  onRetry,
  hasMoreHistory = false,
  loadingMoreHistory = false,
  onLoadMore,
  onClearChat,
  readOnly = false,
  onCompleteSession,
  completingSession = false,
  onArchiveSession,
  onStartNewSession,
  archivingSession = false,
  startingNewSession = false,
  userBirthDate,
}: ChatWindowProps) {
  const character = master ?? getCharacterById(characterId);
  const [input, setInput] = useState("");
  const [voiceInputNotice, setVoiceInputNotice] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Считывает энергетику...");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const preserveScrollRef = useRef(false);
  const scrollSnapshotRef = useRef({ height: 0, top: 0 });
  const pinnedToBottomRef = useRef(true);
  const userTouchScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoScrollAtRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const streamingScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const SCROLL_PIN_THRESHOLD = 96;
  const AUTO_SCROLL_MIN_INTERVAL_MS = 120;

  const updatePinnedToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom <= SCROLL_PIN_THRESHOLD;
  }, []);

  const scrollMessagesToBottom = useCallback((force = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (!force && (userTouchScrollingRef.current || !pinnedToBottomRef.current)) return;

    const now = Date.now();
    if (!force && now - lastAutoScrollAtRef.current < AUTO_SCROLL_MIN_INTERVAL_MS) return;
    lastAutoScrollAtRef.current = now;

    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ block: "end", behavior: "auto" });
        return;
      }
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const markUserScrolling = () => {
      userTouchScrollingRef.current = true;
      pinnedToBottomRef.current = false;
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(() => {
        userTouchScrollingRef.current = false;
        updatePinnedToBottom();
      }, 180);
    };

    el.addEventListener("scroll", updatePinnedToBottom, { passive: true });
    el.addEventListener("touchstart", markUserScrolling, { passive: true });
    el.addEventListener("touchmove", markUserScrolling, { passive: true });
    el.addEventListener("wheel", markUserScrolling, { passive: true });
    return () => {
      el.removeEventListener("scroll", updatePinnedToBottom);
      el.removeEventListener("touchstart", markUserScrolling);
      el.removeEventListener("touchmove", markUserScrolling);
      el.removeEventListener("wheel", markUserScrolling);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    };
  }, [updatePinnedToBottom]);

  useEffect(() => {
    if (!loadingMoreHistory) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    preserveScrollRef.current = true;
    scrollSnapshotRef.current = { height: el.scrollHeight, top: el.scrollTop };
  }, [loadingMoreHistory]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (preserveScrollRef.current) {
      preserveScrollRef.current = false;
      const { height, top } = scrollSnapshotRef.current;
      el.scrollTop = top + (el.scrollHeight - height);
      return;
    }

    const count = messages.length;
    const countChanged = count !== prevMessageCountRef.current;
    prevMessageCountRef.current = count;

    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      pinnedToBottomRef.current = true;
      userTouchScrollingRef.current = false;
      scrollMessagesToBottom(true);
      return;
    }

    if (countChanged && pinnedToBottomRef.current) {
      scrollMessagesToBottom(true);
    }
  }, [messages.length, scrollMessagesToBottom]);

  useEffect(() => {
    if (!isLoading) {
      if (streamingScrollTimerRef.current) {
        clearInterval(streamingScrollTimerRef.current);
        streamingScrollTimerRef.current = null;
      }
      if (pinnedToBottomRef.current) {
        scrollMessagesToBottom(true);
      }
      return;
    }

    if (!pinnedToBottomRef.current) return;

    streamingScrollTimerRef.current = setInterval(() => {
      if (pinnedToBottomRef.current && !userTouchScrollingRef.current) {
        scrollMessagesToBottom(false);
      }
    }, 200);

    return () => {
      if (streamingScrollTimerRef.current) {
        clearInterval(streamingScrollTimerRef.current);
        streamingScrollTimerRef.current = null;
      }
    };
  }, [isLoading, scrollMessagesToBottom]);

  useEffect(() => {
    if (isLoading) {
      const name = character?.name ?? "Мастер";
      const statuses = [
        `${name} вглядывается…`,
        "Считывает энергетику…",
        "Соединяется с астральным планом…",
        "Расшифровывает знаки…",
      ];
      setStatusText(statuses[0]!);

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px), (prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) return;

      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % statuses.length;
        setStatusText(statuses[i]!);
      }, 3000);
      return () => clearInterval(interval);
    }
    setStatusText("Готов к сеансу");
  }, [isLoading, character?.name]);

  const sessionExhausted =
    !hasFullAccess &&
    !usesRuneBilling &&
    questionsLeft === 0;

  const sessionQuestionCapReached = isSessionChatQuestionCapReached(sessionQuestionsUsed);
  const sessionQuestionsRemaining = sessionChatQuestionsRemaining(sessionQuestionsUsed);

  const paidQuestionNeeded = usesRuneBilling && questionsLeft === 0;

  const canAffordQuestion = canAffordRunes({
    enabled: Boolean(usesRuneBilling),
    balance: runeBalance,
    cost: questionCost,
  });

  const canAffordVision = canAffordRunes({
    enabled: Boolean(usesRuneBilling),
    balance: runeBalance,
    cost: visionCost,
  });

  const chatBlockedByRunes =
    Boolean(usesRuneBilling) &&
    ((paidQuestionNeeded && !canAffordQuestion) || insufficientRunes != null);

  const historyStillLoading =
    isLoadingHistory &&
    messages.length === 0 &&
    !spreadReadingLoading &&
    !spreadLoading;

  const inputBlocked =
    readOnly ||
    isLoading ||
    historyStillLoading ||
    sessionOffline ||
    sessionExhausted ||
    sessionQuestionCapReached ||
    chatBlockedByRunes ||
    (spreadInteractiveFlip && !allSpreadFlipped);

  const quickChipsDisabled =
    readOnly ||
    isLoading ||
    historyStillLoading ||
    sessionOffline ||
    sessionExhausted ||
    sessionQuestionCapReached ||
    chatBlockedByRunes;

  const showTypingIndicator =
    !spreadReadingLoading &&
    isLoading &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role !== "assistant" ||
      !messages[messages.length - 1]?.content);

  const lastMessage = messages[messages.length - 1];
  const assistantReplyInProgress =
    lastMessage?.role === "assistant" && Boolean(lastMessage.content?.trim());
  /** Hide «мастер думает» while SSE already fills the assistant bubble. */
  const showMasterStatusSpinner =
    !spreadReadingLoading &&
    isLoading &&
    !showTypingIndicator &&
    !assistantReplyInProgress;

  const spreadCardsVisible =
    (spreadCards?.length ?? 0) >= (spreadVariant === "photo" ? 1 : 3);

  const showWelcomeEmpty =
    messages.length === 0 &&
    !isLoading &&
    !historyStillLoading &&
    !spreadReadingLoading &&
    !spreadLoading &&
    !spreadCardsVisible;

  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const showSessionFeedback = userTurnCount >= 3 && userTurnCount % 3 === 0 && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || inputBlocked) return;
    pinnedToBottomRef.current = true;
    onSendMessage(input);
    setInput("");
    textInputRef.current?.focus();
  };

  const { isRecording, phase: voicePhase, toggle: toggleRecording } = useSpeechInput({
    disabled: inputBlocked,
    onTranscript: (text) => {
      setVoiceInputNotice(null);
      setInput((prev) => (prev ? `${prev} ${text}` : text));
      textInputRef.current?.focus();
    },
    onError: (message) => {
      setVoiceInputNotice(message);
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (usesRuneBilling && !canAffordVision) {
      onOpenPaywall?.();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Фото должно быть не больше 5 МБ");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      onSendMessage("Проанализируй мой расклад", base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (!character) return null;

  return (
    <motion.div
      className="chat-stage mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Chat header */}
      <div className="chat-stage__header glass-panel shrink-0 flex items-center gap-2.5 p-2.5 sm:mb-4 sm:gap-4 sm:p-4">
        <button
          onClick={onClose}
          aria-label={closeAriaLabel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple sm:h-11 sm:w-11"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <MasterAvatar
          masterId={characterId}
          masterName={character.name}
          size="md"
          thumb
          priority
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-bold text-white sm:text-xl">
            {character.name}
          </h2>
          <p className="truncate text-xs text-gray-400 sm:text-sm">{character.title}</p>
          {!hasFullAccess && questionsLeft != null && questionsLeft > 0 && (
            <p className="mt-0.5 text-[11px] text-aura-gold sm:text-xs">
              Осталось {questionsLeft} бесплатных {questionsLeft === 1 ? "вопрос" : "вопроса"}
            </p>
          )}
          {!hasFullAccess && usesRuneBilling && questionsLeft === 0 && (
            <p className="mt-0.5 text-[11px] text-gray-500 sm:text-xs">Далее — {questionCost} ᚢ за вопрос</p>
          )}
          {hasFullAccess && (
            <p className="mt-0.5 text-[11px] text-aura-emerald sm:text-xs">Полный доступ активен</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onCompleteSession && !readOnly && messages.length > 0 && !isLoadingHistory && (
            <button
              type="button"
              onClick={onCompleteSession}
              disabled={isLoading || completingSession}
              title="Завершить сеанс"
              className="hidden rounded-xl border border-aura-emerald/30 px-3 py-2 text-xs font-semibold text-aura-emerald transition-colors hover:border-aura-emerald/60 disabled:opacity-40 sm:inline-flex"
            >
              {completingSession ? "…" : "Завершить сеанс"}
            </button>
          )}
          {onClearChat && messages.length > 0 && !isLoadingHistory && !readOnly && (
            <button
              type="button"
              onClick={onClearChat}
              disabled={isLoading}
              title="Очистить переписку"
              aria-label="Очистить переписку"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-red-400/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${isLoading ? "animate-pulse bg-aura-gold" : "bg-aura-emerald"}`}
          />
          <span className="hidden text-xs text-gray-500 sm:inline">{statusText}</span>
        </div>
      </div>

      <p
        className="chat-session-disclaimer mb-2 px-1 text-center text-[10px] leading-relaxed text-gray-500 sm:px-4"
        role="note"
      >
        {CHAT_SESSION_DISCLAIMER}
      </p>

      <div
        ref={scrollContainerRef}
        className="chat-stage__body glass-panel chat-scroll flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:mb-4 sm:min-h-[320px] sm:max-h-[min(640px,calc(100dvh-220px))]"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Расклад и сообщения чата"
      >
      {sessionIntention && (
        <SessionIntentionBar
          intention={sessionIntention}
          masterName={character.name}
          characterKey={characterId}
          activeCharacterKey={characterId}
          highlight={intentionHighlight}
        />
      )}

      {sessionOffline && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-100">
            {storageBlocked
              ? "Приватный режим или блокировка хранилища — чат не сохранится. Откройте сайт в обычном окне браузера."
              : "Сессия не синхронизирована с сервером — сообщения не отправятся."}
          </p>
          {onReconnectSession && (
            <button
              type="button"
              onClick={onReconnectSession}
              className="btn-neon shrink-0 px-4 py-2 text-sm"
            >
              Переподключить
            </button>
          )}
        </div>
      )}

      {headerSceneUrl &&
        !spreadCards?.length &&
        !messages.some((m) => m.role === "assistant" && m.sceneImageUrl) && (
        <SceneImage
          imageUrl={headerSceneUrl}
          label="Карта судьбы"
          variant="card"
          expandable
          className="mx-auto"
        />
      )}

      {spreadLoading && (
        <div className="rounded-xl border border-aura-gold/15 bg-black/20 p-6 text-center">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-aura-gold" aria-hidden />
          <p className="text-sm text-gray-400">Вытягиваю карты на выбранную тему…</p>
        </div>
      )}

      {spreadCards &&
        spreadCards.length >= (spreadVariant === "photo" ? 1 : 3) && (
        <div className="rounded-xl border border-aura-gold/15 bg-black/30 p-4">
          <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-aura-gold">
            {spreadVariant === "photo"
              ? "Расклад по фото"
              : spreadVariant === "intention"
                ? sessionIntention
                  ? `Расклад: ${topicLabel(sessionIntention)}`
                  : "Расклад на тему"
                : "Ваш расклад"}
          </p>
          {spreadInteractiveFlip &&
          (spreadVariant === "triplet" || spreadVariant === "intention") ? (
            <SpreadFlipRow
              cards={spreadCards.slice(0, 3)}
              system={spreadDeckSystem ?? DEFAULT_DECK_SYSTEM}
              masterId={characterId}
              flipped={spreadFlipped}
              onFlip={(i) => onSpreadFlip?.(i)}
            />
          ) : (
            <TarotCardsRow
              cards={
                spreadVariant === "photo"
                  ? spreadCards
                  : spreadCards.slice(0, 3)
              }
              system={spreadDeckSystem}
              masterId={characterId}
              size="md"
              showMeaning={false}
              aligned
            />
          )}
          {spreadReadingLoading && (
            <SpreadReadingRitualPanel
              active
              phrases={
                isNumerologMaster(characterId)
                  ? [
                      "Эвелина считает ваш код…",
                      "Складываю три числа периода…",
                      "Готовлю расшифровку…",
                    ]
                  : undefined
              }
              onComplete={onSpreadReadingRitualComplete ?? noop}
            />
          )}
        </div>
      )}

          {hasMoreHistory && onLoadMore && !isLoadingHistory && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMoreHistory || isLoading}
                className="rounded-full border border-white/10 bg-black/30 px-4 py-1.5 text-xs text-gray-400 transition-colors hover:border-aura-gold/30 hover:text-aura-gold disabled:opacity-50"
              >
                {loadingMoreHistory ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Загрузка…
                  </span>
                ) : (
                  "Показать ещё"
                )}
              </button>
            </div>
          )}

          {historyStillLoading ? (
            <div className="flex flex-col gap-3 p-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-2xl bg-white/5"
                  style={{
                    width: `${50 + i * 12}%`,
                    alignSelf: i % 2 === 0 ? "flex-end" : "flex-start",
                  }}
                />
              ))}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {showWelcomeEmpty && (
                <motion.div
                  key="chat-welcome-empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="flex min-h-[240px] flex-col items-center justify-center text-center text-gray-500"
                >
                  <MasterAvatar masterId={characterId} masterName={character.name} size="xl" className="mb-4" />
                  {isNumerologMaster(characterId) ? (
                    <p className="max-w-md whitespace-pre-wrap text-sm leading-relaxed">
                      {buildNumerologWelcomeMessage({
                        userName: readStoredProfileForWelcome().name || "друг",
                        birthDate: userBirthDate || readStoredProfileForWelcome().birthDate,
                        fullName: readStoredProfileForWelcome().name,
                      })}
                    </p>
                  ) : (
                    <p className="text-sm">
                      {character.name} готов к сеансу.
                      <br />
                      Задайте вопрос, надиктуйте голосом или загрузите фото расклада.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {(!isLoadingHistory || messages.length > 0) && (
          <AnimatePresence initial={false}>
            {messages.map((msg, msgIndex) => {
              const pythagorasSquare =
                characterId === "numerolog" && msg.role === "assistant"
                  ? resolvePythagorasSquareForMessage(messages, msgIndex, userBirthDate)
                  : null;
              const assistantContent =
                msg.role === "assistant"
                  ? resolveNumerologAssistantDisplayContent(
                      characterId,
                      msg.role,
                      msg.content,
                      userBirthDate
                    )
                  : msg.content;

              return (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    msg.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-aura-purple/35 to-aura-purple/15 px-4 py-3 text-white shadow-sm ring-1 ring-aura-purple/30"
                      : "master-message-bubble max-w-[90%] rounded-2xl rounded-bl-md border border-[rgba(201,169,110,0.2)] bg-[rgba(15,10,30,0.92)] p-4 shadow-[0_4px_32px_rgba(123,94,167,0.15)] sm:max-w-[85%] sm:animate-mystic-in sm:bg-[rgba(15,10,30,0.85)] sm:p-5 sm:backdrop-blur-[12px]"
                  }
                >
                  {msg.role === "user" && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-aura-neon/70">
                      Вы
                    </p>
                  )}
                  {msg.role === "user" ? (
                    <ChatMessageRenderer content={msg.content} role="user" />
                  ) : (
                    <>
                      {msg.sceneImageUrl &&
                        !(spreadCards?.length && msgIndex === 0) && (
                        <SceneImage
                          imageUrl={msg.sceneImageUrl}
                          label={msgIndex === 0 ? "Карта судьбы" : "Видение мастера"}
                          variant={msgIndex === 0 ? "card" : "wide"}
                          expandable={msgIndex === 0}
                          aspectClass={msgIndex === 0 ? undefined : "aspect-video w-full"}
                          objectFit="contain"
                          className="mb-3"
                        />
                      )}
                      <ChatMessageRenderer content={assistantContent} role="assistant" />
                      {pythagorasSquare ? (
                        <PythagorasSquareGrid
                          square={pythagorasSquare}
                          className="mt-3"
                        />
                      ) : null}
                    </>
                  )}
                  {msg.role === "assistant" && (
                    <MessageAudioPlayer
                      text={normalizeMessageText(assistantContent)}
                      characterId={characterId}
                    />
                  )}
                </div>
              </div>
              );
            })}
          </AnimatePresence>
          )}

          {showTypingIndicator && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-black/40 px-4 py-3">
                <MasterAvatar masterId={characterId} masterName={character.name} size="sm" thumb />
                <span className="flex gap-1 text-aura-purple">
                  <span className="animate-bounce [animation-delay:0ms]">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </span>
              </div>
            </motion.div>
          )}

          {showMasterStatusSpinner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-black/40 px-4 py-3">
                <MasterAvatar masterId={characterId} masterName={character.name} size="sm" thumb />
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura-purple" />
                <span className="text-sm text-gray-400">{statusText}</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="chat-stage__input">
      {!hasFullAccess && !usesRuneBilling && questionsLeft === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 rounded-xl border border-aura-purple/30 bg-aura-purple/10 p-3 text-center"
        >
          <p className="text-sm text-gray-200">Бесплатные вопросы закончились.</p>
          {onOpenPaywall && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="mt-2 text-sm font-bold text-aura-neon underline"
            >
              Получить полный доступ →
            </button>
          )}
        </motion.div>
      )}

      {insufficientRunes && onOpenPaywall && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/15 p-3"
        >
          <p className="text-xs text-amber-300">
            Не хватает {Math.max(0, insufficientRunes.required - insufficientRunes.balance)} ᚢ
            (нужно {insufficientRunes.required}, у вас {insufficientRunes.balance})
          </p>
          <button
            type="button"
            onClick={onOpenPaywall}
            className="btn-luxe btn-luxe--sm btn-luxe--gold shrink-0"
          >
            Пополнить →
          </button>
        </motion.div>
      )}

      {retryDraft && onRetry && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3"
        >
          <p className="text-xs text-red-200">Не удалось отправить сообщение</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="btn-luxe btn-luxe--sm btn-luxe--bronze shrink-0 disabled:opacity-50"
          >
            Отправить снова →
          </button>
        </motion.div>
      )}

      <SessionFeedback characterId={characterId} visible={showSessionFeedback && !readOnly} />

      {readOnly ? (
        <p className="glass-panel mb-2 px-4 py-2 text-center text-xs text-gray-400">
          Архивный сеанс — только для чтения
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-2 p-3">
        {sessionQuestionCapReached ? (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs text-amber-100">{SESSION_CHAT_LIMIT_MESSAGE}</p>
            {(onArchiveSession || onStartNewSession) && (
              <div className="flex flex-wrap gap-2">
                {onArchiveSession && !readOnly ? (
                  <button
                    type="button"
                    onClick={onArchiveSession}
                    disabled={archivingSession || startingNewSession || isLoading}
                    className="btn-luxe btn-luxe--sm btn-luxe--silver disabled:opacity-50"
                  >
                    {archivingSession ? "…" : "В архив"}
                  </button>
                ) : null}
                {onStartNewSession ? (
                  <button
                    type="button"
                    onClick={onStartNewSession}
                    disabled={archivingSession || startingNewSession || isLoading}
                    className="btn-luxe btn-luxe--sm btn-luxe--gold disabled:opacity-50"
                  >
                    {startingNewSession ? "…" : "Создать новый сеанс"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : sessionQuestionsRemaining <= 2 && sessionQuestionsRemaining > 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
            В этом сеансе осталось {sessionQuestionsRemaining}{" "}
            {sessionQuestionsRemaining === 1 ? "вопрос" : "вопроса"} из {SESSION_CHAT_QUESTION_LIMIT}.
          </p>
        ) : null}
        {characterId === "numerolog" && !readOnly ? (
          <NumerologQuickChips
            disabled={quickChipsDisabled}
            onSend={(text) => {
              pinnedToBottomRef.current = true;
              onSendMessage(text);
            }}
          />
        ) : null}
        {hasMasterQuickChips(characterId) && !readOnly ? (
          <MasterQuickChips
            masterId={characterId}
            disabled={quickChipsDisabled}
            onSend={(text) => {
              pinnedToBottomRef.current = true;
              onSendMessage(text);
            }}
          />
        ) : null}
        {voiceInputNotice ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {voiceInputNotice}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={inputBlocked || (usesRuneBilling && !canAffordVision)}
          aria-label="Загрузить фото расклада"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-aura-emerald/50 hover:text-aura-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple disabled:opacity-30"
          title={
            usesRuneBilling && !canAffordVision
              ? `Нужно ${visionCost} ᚢ для анализа фото`
              : "Загрузить расклад"
          }
        >
          <Camera className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => void toggleRecording()}
          disabled={inputBlocked || voicePhase === "transcribing"}
          aria-label={
            voicePhase === "transcribing"
              ? "Распознавание речи"
              : isRecording
                ? "Остановить запись голоса"
                : "Голосовой ввод"
          }
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple disabled:opacity-30 ${
            isRecording
              ? "border-red-500/50 bg-red-500/10 text-red-400"
              : voicePhase === "transcribing"
                ? "border-aura-purple/40 bg-aura-purple/10 text-aura-purple"
                : "border-white/10 text-gray-400 hover:border-aura-purple/50 hover:text-aura-purple"
          }`}
          title={
            voicePhase === "transcribing"
              ? "Распознаю речь…"
              : isRecording
                ? "Остановить запись"
                : "Голосовой ввод"
          }
        >
          {voicePhase === "transcribing" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        <textarea
          ref={textInputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && !inputBlocked) {
                pinnedToBottomRef.current = true;
                onSendMessage(input.trim());
                setInput("");
              }
            }
          }}
          placeholder="Задайте свой вопрос..."
          disabled={inputBlocked}
          enterKeyHint="send"
          aria-label="Текст сообщения"
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder-gray-500 outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!input.trim() || inputBlocked}
          aria-label="Отправить сообщение"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aura-purple/30 text-aura-neon transition-all hover:bg-aura-purple/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple disabled:opacity-30"
        >
          <Send className="h-5 w-5" />
        </button>
        </div>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-gray-600">
          ИИ может допускать ошибки. Принимайте решения самостоятельно.
        </p>
      </form>
      </div>
    </motion.div>
  );
}
