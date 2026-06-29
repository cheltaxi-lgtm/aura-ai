"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, MicOff } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import {
  SESSION_TOPICS,
  topicLabel,
  type SessionTopicId,
} from "@/lib/session-topics";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem } from "@/lib/decks";
import MasterAvatar from "@/components/MasterAvatar";
import SpreadFlipRow from "@/components/SpreadFlipRow";
import RuneCost from "@/components/RuneCost";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { RITUAL_MASTERS } from "@/lib/ritual-config";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import { PRICING, numerologySessionCost } from "@/lib/config/pricing";
import { useSpeechInput } from "@/hooks/useSpeechInput";

export interface SessionStartParams {
  characterKey: string;
  intention: SessionTopicId | null;
  spreadType: "daily" | "new";
  cards: string[];
  /** Свой вопрос клиента — когда intention === "custom". */
  customQuestion?: string | null;
  /** Cards already flipped in the flow modal — chat should not ask to flip again. */
  cardsRevealed?: boolean;
  previewCards?: { name: string; meaning?: string }[];
  deckSystem?: DeckSystem;
}

interface MasterSessionFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (params: SessionStartParams) => void;
  onStartRitual?: () => void;
  preselectedMaster?: string;
  dailyCards?: string[];
  masters?: ShowcaseMaster[];
  /** Только новый расклад по теме — без «карт дня». */
  newSpreadOnly?: boolean;
}

type Step = "topic" | "master" | "cards" | "flip";

function stepIndex(step: Step): number {
  switch (step) {
    case "topic":
      return 0;
    case "master":
      return 1;
    case "cards":
      return 2;
    case "flip":
      return 3;
  }
}

export default function MasterSessionFlow({
  isOpen,
  onClose,
  onStart,
  onStartRitual,
  preselectedMaster,
  dailyCards = [],
  masters = [],
  newSpreadOnly = false,
}: MasterSessionFlowProps) {
  const [step, setStep] = useState<Step>("topic");
  const [topic, setTopic] = useState<SessionTopicId | null>(null);
  const [master, setMaster] = useState(preselectedMaster ?? "");
  const [cardType, setCardType] = useState<"daily" | "new" | null>(null);
  const [newCards, setNewCards] = useState<{ name: string; meaning?: string }[]>([]);
  const [deckSystem, setDeckSystem] = useState<DeckSystem>("tarot-veronika");
  const [flipped, setFlipped] = useState([false, false, false]);
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [topicPickMode, setTopicPickMode] = useState<"grid" | "custom">("grid");
  const [customQuestion, setCustomQuestion] = useState("");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const { config: runeConfig, cost: runeCost } = useRuneConfig();
  const numerologFlow = isNumerologMaster(master);
  const spreadCost = numerologFlow
    ? PRICING.NUMEROLOGY_SESSION
    : runeCost("INTENTION_SPREAD");
  const numerologPreselected = isNumerologMaster(preselectedMaster);
  const customQuestionReady = customQuestion.trim().length >= 8;

  const { isRecording, phase: voicePhase, toggle: toggleRecording } = useSpeechInput({
    onTranscript: (text) => {
      setVoiceNotice(null);
      setCustomQuestion((prev) => (prev ? `${prev} ${text}` : text));
    },
    onError: (message) => setVoiceNotice(message),
  });

  const goToNewSpreadDraw = useCallback(() => {
    setCardType("new");
    if (isNumerologMaster(master)) {
      setStep("flip");
    } else if (topic) {
      setStep("flip");
    } else {
      setStep("topic");
    }
  }, [master, topic]);

  const hasDailyCards = dailyCards.length >= 3 && !newSpreadOnly;
  const showCardsChoice = hasDailyCards;
  const allFlipped = flipped.every(Boolean);
  const currentStepIdx = stepIndex(step);

  const initializeFlow = useCallback(() => {
    setTopic(null);
    setTopicPickMode("grid");
    setCustomQuestion("");
    setVoiceNotice(null);
    setMaster(preselectedMaster ?? "");
    setNewCards([]);
    setFlipped([false, false, false]);
    setDrawError(null);
    setDrawLoading(false);

    if (numerologPreselected || (newSpreadOnly && isNumerologMaster(preselectedMaster))) {
      // Skip topic/master — open numerolog spread draw immediately.
      setCardType("new");
      setStep("flip");
      return;
    }

    if (newSpreadOnly) {
      setCardType("new");
      setStep("topic");
      return;
    }

    setCardType(null);
    setStep(hasDailyCards ? "master" : "topic");
  }, [hasDailyCards, preselectedMaster, numerologPreselected, newSpreadOnly]);

  useEffect(() => {
    if (isOpen) {
      initializeFlow();
    }
  }, [isOpen, initializeFlow]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("flow-overlay-open");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("flow-overlay-open");
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const goBack = () => {
    if (step === "topic" && topicPickMode === "custom") {
      setTopicPickMode("grid");
      setTopic(null);
      setCustomQuestion("");
      return;
    }
    if (step === "master") {
      if (!hasDailyCards && !numerologFlow) setStep("topic");
    } else if (step === "cards") setStep("master");
    else if (step === "topic" && cardType === "new") setStep("cards");
    else if (step === "flip") {
      if (showCardsChoice && cardType === "new") {
        setStep(numerologFlow ? "cards" : "topic");
      } else if (showCardsChoice) setStep("cards");
      else setStep("master");
    }
  };

  const fetchNewSpread = useCallback(async () => {
    if (!master) return;
    if (!numerologFlow && !topic) return;
    if (topic === "custom" && !customQuestionReady) return;
    setDrawLoading(true);
    setDrawError(null);
    try {
      const qs = new URLSearchParams({ master });
      if (numerologFlow) {
        qs.set("numerologDraw", "1");
      } else if (topic) {
        qs.set("topic", topic);
      }
      const res = await fetch(`/api/intention-spread?${qs}`, { credentials: "include" });
      if (res.status === 401) {
        setDrawError("Нужна регистрация");
        return;
      }
      if (!res.ok) throw new Error("draw_failed");
      const data = await res.json();
      const cards = (data.cards ?? []) as { name: string; meaning?: string }[];
      if (cards.length < 3) throw new Error("not_enough_cards");
      setNewCards(cards.slice(0, 3));
      setDeckSystem((data.system ?? data.deck ?? resolveMasterDeckSystem(master)) as DeckSystem);
      setFlipped([false, false, false]);
    } catch {
      setDrawError("Не удалось вытянуть карты. Попробуйте снова.");
    } finally {
      setDrawLoading(false);
    }
  }, [topic, master, numerologFlow, customQuestionReady]);

  useEffect(() => {
    if (step === "flip" && !numerologFlow && !topic) {
      setCardType("new");
      setStep("topic");
    }
  }, [step, numerologFlow, topic]);

  useEffect(() => {
    if (step === "flip" && newCards.length === 0 && master && (numerologFlow || topic)) {
      if (topic === "custom" && !customQuestionReady) return;
      void fetchNewSpread();
    }
  }, [step, newCards.length, topic, master, numerologFlow, fetchNewSpread, customQuestionReady]);

  const handleFlip = (index: number) => {
    setFlipped((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const handleSelectNewSpread = () => {
    setCardType("new");
    setNewCards([]);
    setStep("topic");
  };

  const handleStartDaily = () => {
    if (!master) return;
    onStart({
      characterKey: master,
      intention: null,
      spreadType: "daily",
      cards: dailyCards.slice(0, 3),
    });
  };

  const handleStartNew = async () => {
    if (!master || !allFlipped || newCards.length < 3) return;
    if (!numerologFlow && !topic) return;
    if (topic === "custom" && !customQuestionReady) return;
    onStart({
      characterKey: master,
      intention: numerologFlow ? null : topic,
      spreadType: "new",
      cards: newCards.map((c) => c.name),
      cardsRevealed: true,
      previewCards: newCards.slice(0, 3),
      deckSystem,
      customQuestion: topic === "custom" ? customQuestion.trim() : null,
    });
  };

  if (!isOpen) return null;

  const footerPadding = { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" } as const;

  const actionFooter =
    step === "topic" && !numerologFlow && topicPickMode === "custom" ? (
      <button
        type="button"
        disabled={!customQuestionReady || drawLoading}
        onClick={() => {
          setTopic("custom");
          setCardType("new");
          setStep("flip");
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1 disabled:opacity-50"
      >
        <span>Получить карты</span>
        {runeConfig.enabled ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : step === "topic" && !numerologFlow && topic ? (
      <button
        type="button"
        onClick={() => {
          if (cardType === "new") goToNewSpreadDraw();
          else setStep("master");
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
      >
        Далее
      </button>
    ) : step === "master" && master ? (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            if (showCardsChoice) {
              setStep("cards");
            } else {
              goToNewSpreadDraw();
            }
          }}
          className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
        >
          {showCardsChoice ? "Далее" : "Вытянуть карты"}
        </button>
        {onStartRitual && (RITUAL_MASTERS as readonly string[]).includes(master) ? (
          <button
            type="button"
            onClick={onStartRitual}
            className="btn-luxe btn-luxe--md btn-luxe--block w-full border border-amber-500/30 bg-amber-950/20 text-amber-200"
          >
            🕯 Заказать обряд
          </button>
        ) : null}
      </div>
    ) : step === "cards" && showCardsChoice && cardType === "daily" ? (
      <button
        type="button"
        onClick={handleStartDaily}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
      >
        Начать сеанс с картами дня
      </button>
    ) : step === "cards" && showCardsChoice && cardType === "new" ? (
      <button
        type="button"
        onClick={() => {
          if (numerologFlow) {
            setStep("flip");
          } else {
            handleSelectNewSpread();
          }
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1"
      >
        <span>Вытянуть новые карты</span>
        {runeConfig.enabled ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : step === "flip" && newCards.length >= 3 && !drawLoading && !drawError ? (
      <button
        type="button"
        disabled={!allFlipped}
        onClick={() => void handleStartNew()}
        className={`btn-luxe btn-luxe--md btn-luxe--block flex flex-col items-center gap-1 transition-all duration-200 ${
          allFlipped
            ? "btn-luxe--gold animate-pulse"
            : "btn-luxe--silver opacity-40 cursor-not-allowed"
        }`}
      >
        <span>Начать сеанс</span>
        {runeConfig.enabled && allFlipped ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : null;

  return (
    <BodyPortal active={isOpen}>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[6500] flex items-end justify-center sm:items-center"
        data-flow-overlay="true"
        role="dialog"
        aria-modal="true"
        aria-label="Сеанс с мастером"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Закрыть"
        />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-black/90 backdrop-blur-xl sm:mx-4 sm:max-h-[90dvh] sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            {step !== "topic" && !(step === "master" && hasDailyCards) ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                ← Назад
              </button>
            ) : step === "topic" && topicPickMode === "custom" ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                ← Назад
              </button>
            ) : (
              <span className="w-12" />
            )}
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i <= currentStepIdx ? "bg-amber-400" : "bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          <div className="lux-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
            {/* Step 1 — Topic */}
            {step === "topic" && !numerologFlow && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {topicPickMode === "custom" ? (
                  <>
                    <h2 className="text-center font-display text-xl font-bold text-white">
                      Свой вопрос
                    </h2>
                    <p className="mt-1 text-center text-sm text-white/60">
                      Сформулируйте запрос — мастер ответит по выпавшим картам
                    </p>
                    <div className="mt-5 space-y-3">
                      <textarea
                        value={customQuestion}
                        onChange={(e) => setCustomQuestion(e.target.value)}
                        placeholder="Например: стоит ли мне менять работу этой осенью?"
                        rows={4}
                        maxLength={400}
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleRecording()}
                          disabled={voicePhase === "transcribing"}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            isRecording
                              ? "border-red-500/50 bg-red-500/10 text-red-400"
                              : "border-white/10 text-gray-400 hover:border-aura-purple/50 hover:text-aura-purple"
                          }`}
                          aria-label={isRecording ? "Остановить запись" : "Диктовка голосом"}
                        >
                          {voicePhase === "transcribing" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : isRecording ? (
                            <MicOff className="h-5 w-5" />
                          ) : (
                            <Mic className="h-5 w-5" />
                          )}
                        </button>
                        <p className="text-xs text-white/40">
                          {customQuestion.trim().length}/400 · мин. 8 символов
                        </p>
                      </div>
                      {voiceNotice ? (
                        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          {voiceNotice}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-center font-display text-xl font-bold text-white">
                      О чём поговорим?
                    </h2>
                    <p className="mt-1 text-center text-sm text-white/60">
                      Выберите тему сеанса
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      {SESSION_TOPICS.filter((t) => t.id !== "custom").map((card) => {
                    const isSelected = topic === card.id;
                    const isLifeDeath = card.id === "life_death";
                    const dimOthers = topic && !isSelected;

                    let cardClass =
                      "rounded-2xl border p-4 text-center transition-all duration-200 ";

                    if (isLifeDeath) {
                      cardClass += isSelected
                        ? "col-span-2 scale-[1.03] border-violet-400/50 bg-violet-950/20 shadow-lg shadow-violet-900/20"
                        : dimOthers
                          ? "col-span-2 border-white/10 bg-white/5 opacity-50"
                          : "col-span-2 border-white/10 bg-white/5 hover:border-violet-400/40 hover:bg-white/10";
                    } else {
                      cardClass += isSelected
                        ? "scale-[1.03] border-amber-400 bg-amber-950/20 shadow-lg shadow-amber-500/20"
                        : dimOthers
                          ? "border-white/10 bg-white/5 opacity-50"
                          : "border-white/10 bg-white/5 hover:border-amber-400/50 hover:bg-white/10";
                    }

                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => setTopic(card.id)}
                        className={cardClass}
                      >
                        <span className="text-2xl">{card.icon}</span>
                        <p
                          className={`mt-2 text-xs font-medium leading-snug ${
                            isSelected
                              ? isLifeDeath
                                ? "text-violet-200"
                                : "text-amber-300"
                              : "text-white/80"
                          }`}
                        >
                          {card.label}
                        </p>
                        {card.sub ? (
                          <p className="mt-1 text-xs text-white/40">{card.sub}</p>
                        ) : null}
                      </button>
                    );
                  })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTopicPickMode("custom");
                        setTopic(null);
                      }}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition-all duration-200 hover:border-amber-400/50 hover:bg-white/10"
                    >
                      <span className="text-2xl">💬</span>
                      <p className="mt-2 text-xs font-medium text-white/80">Свой вопрос</p>
                      <p className="mt-1 text-xs text-white/40">Напишите или продиктуйте запрос</p>
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* Step 2 — Master */}
            {step === "master" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Выберите мастера
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {topic === "custom"
                    ? `Ваш вопрос: «${customQuestion.trim().slice(0, 48)}${customQuestion.trim().length > 48 ? "…" : ""}»`
                    : topic === "life_death"
                      ? "Кто поможет разобраться в ситуации"
                      : topic
                        ? `Тема: «${topicLabel(topic)}»`
                        : hasDailyCards
                          ? "Кто проведёт сеанс с вашими картами дня"
                          : "Выберите наставника"}
                </p>

                <div className="mt-6 space-y-2">
                  {masters.map((m) => {
                    const isSelected = master === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMaster(m.id);
                          setNewCards([]);
                          setFlipped([false, false, false]);
                          setDrawError(null);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                          isSelected
                            ? "scale-[1.01] border-amber-400 bg-amber-500/10 shadow-md shadow-amber-500/10"
                            : "border-white/10 bg-white/5 hover:border-amber-400/40 hover:bg-white/10"
                        }`}
                      >
                        <MasterAvatar masterId={m.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{m.name}</p>
                          <p className="truncate text-xs text-white/50">{m.title}</p>
                        </div>
                        {isSelected && (
                          <span className="text-xs text-amber-400" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 3 — Cards choice (only when daily spread exists) */}
            {step === "cards" && showCardsChoice && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Какой расклад взять?
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  Карты дня уже выпали — продолжите с ними или вытащите новые под тему
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCardType("daily")}
                    className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
                      cardType === "daily"
                        ? "scale-[1.02] border-amber-400 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:border-amber-400/50"
                    }`}
                  >
                    <span className="text-2xl">🌅</span>
                    <p className="mt-2 font-display text-base font-bold text-white">
                      Карты дня
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Быстрый старт — без нового расклада
                    </p>
                    <div className="mt-3 space-y-1">
                      {dailyCards.slice(0, 3).map((name) => (
                        <p key={name} className="text-xs text-amber-200/80">
                          · {name}
                        </p>
                      ))}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (numerologFlow) {
                        setCardType("new");
                        setStep("flip");
                      } else {
                        handleSelectNewSpread();
                      }
                    }}
                    className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
                      cardType === "new"
                        ? "scale-[1.02] border-amber-400 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:border-amber-400/50"
                    }`}
                  >
                    <span className="text-2xl">🃏</span>
                    <p className="mt-2 font-display text-base font-bold text-white">
                      Новый расклад
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Три свежие карты под вашу тему
                      {runeConfig.enabled ? (
                        <span className="ml-1">
                          · <RuneCost cost={spreadCost} enabled className="inline" />
                        </span>
                      ) : null}
                    </p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4 — Flip new cards */}
            {step === "flip" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  {numerologFlow ? "Вытяните три числа" : "Вытяните три карты"}
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {numerologFlow
                    ? "Нажмите на каждое число, чтобы открыть расклад."
                    : topic === "custom"
                      ? `Ваш вопрос: «${customQuestion.trim()}»`
                      : `Тема: ${topic ? topicLabel(topic) : ""}. Нажмите на каждую карту, чтобы открыть.`}
                </p>

                {drawLoading ? (
                  <div className="mt-10 flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                    <p className="text-sm text-white/60">Вытягиваем карты…</p>
                  </div>
                ) : drawError ? (
                  <div className="mt-8 text-center">
                    <p className="text-sm text-red-300">{drawError}</p>
                    <button
                      type="button"
                      onClick={() => void fetchNewSpread()}
                      className="btn-luxe btn-luxe--sm btn-luxe--gold"
                    >
                      Попробовать снова
                    </button>
                  </div>
                ) : newCards.length >= 3 ? (
                  <>
                    <div className="mt-6">
                      <SpreadFlipRow
                        cards={newCards}
                        system={deckSystem}
                        masterId={master}
                        flipped={flipped}
                        onFlip={handleFlip}
                        compact
                      />
                    </div>
                    {!allFlipped && (
                      <p className="mt-4 text-center text-sm text-amber-400/90">
                        Откройте все три карты — затем нажмите «Начать сеанс»
                      </p>
                    )}
                  </>
                ) : null}
              </motion.div>
            )}
          </div>

          {actionFooter ? (
            <div
              className="shrink-0 border-t border-white/10 bg-black/90 px-5 py-4"
              style={footerPadding}
            >
              {actionFooter}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </BodyPortal>
  );
}
