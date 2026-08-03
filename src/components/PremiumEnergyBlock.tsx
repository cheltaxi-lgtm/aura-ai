"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, Moon, Users } from "lucide-react";
import { isAiMasterId, type ShowcaseMaster } from "@/lib/showcase-masters";
import { resolveMasterDeckSystem, DECK_REGISTRY } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY } from "@/lib/photo-spread-redraw";
import type { DeckSystem } from "@/lib/decks/types";
import DeckCard from "@/components/DeckCard";
import BodyPortal from "@/components/BodyPortal";
import MasterAvatar from "@/components/MasterAvatar";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { DEFAULT_SPREAD_ID, getSpread, type SpreadId } from "@/lib/spreads";
import { useRuneConfig } from "@/lib/useRuneConfig";
import RuneCost from "@/components/RuneCost";
import {
  dailyJointReadingHref,
  dailyRitualType,
  showDailyJointReading,
} from "@/lib/daily-retention";
import type { RitualType } from "@/lib/ritual-config";
import AsyncJobProgressNotice from "@/components/AsyncJobProgressNotice";

const QUOTE_RE = /(Помни:\s*даже камень[^.!?]*[.!?])/i;
const GOLD_GRADIENT = "linear-gradient(135deg, #c9993a 0%, #e8c56d 50%, #c9993a 100%)";

function cardsLabelRu(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карту`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

interface DailyCard {
  name: string;
  meaning?: string;
  reversed?: boolean;
  position?: string;
}

export interface PremiumEnergyBlockProps {
  characterKey?: string;
  masters: ShowcaseMaster[];
  /** Preselect daily spread mode (classic triplet or extended). */
  initialSpreadId?: SpreadId;
  /** Open modal on mount (e.g. from ?daily=extended deep link). */
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
  /** Opens paywall when extended daily needs more runes. */
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
  /** Open in-app ritual flow with recommended type from daily reading. */
  onStartRitual?: (ritualType: RitualType) => void;
  /** Unlimited accounts skip DAILY_EXTENDED charge — hide fake price. */
  isUnlimited?: boolean;
  /** @deprecated Footer only closes modal — kept for call-site compatibility. */
  onTalkToMaster?: (masterId: string) => void;
  /** @deprecated Footer only closes modal — kept for call-site compatibility. */
  onOpenNumerologForm?: () => void;
}

/** User's local calendar date (YYYY-MM-DD) so the daily reset happens at their 00:00. */
function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDailyEnergyText(text: string): { body: string; quote: string | null } {
  const match = text.match(QUOTE_RE);
  if (!match?.[1]) return { body: text.trim(), quote: null };
  const quote = match[1].trim();
  const body = text.replace(QUOTE_RE, "").trim();
  return { body, quote };
}

function renderDailyReadingBody(body: string) {
  return <PremiumReadingBody content={body} className="text-gray-200" />;
}

export default function PremiumEnergyBlock({
  characterKey = "veronika",
  masters,
  initialSpreadId = DEFAULT_SPREAD_ID,
  autoOpen = false,
  onAutoOpenHandled,
  onInsufficientRunes,
  onStartRitual,
  isUnlimited = false,
}: PremiumEnergyBlockProps) {
  const { config: runeConfig, cost: runeCost } = useRuneConfig();
  const extendedCost = isUnlimited ? 0 : runeCost("DAILY_EXTENDED");
  const showExtendedPrice = runeConfig.enabled && !isUnlimited;
  const [loaded, setLoaded] = useState(false);
  const [drawnToday, setDrawnToday] = useState(false);
  const [lockedToday, setLockedToday] = useState(false);
  const [open, setOpen] = useState(false);

  const [master, setMaster] = useState(characterKey);
  const [spreadId, setSpreadId] = useState<SpreadId>(initialSpreadId);
  const [text, setText] = useState<string | null>(null);
  const [cards, setCards] = useState<DailyCard[]>([]);
  const [system, setSystem] = useState<DeckSystem | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const spreadIdRef = useRef<SpreadId>(initialSpreadId);

  const spread = useMemo(() => getSpread(spreadId), [spreadId]);
  const positionLabels = useMemo(() => spread.positions.map((p) => p.label), [spread]);
  const cardGridClass =
    spread.cardCount <= 3
      ? "grid-cols-3"
      : spread.cardCount <= 7
        ? "grid-cols-3 sm:grid-cols-4"
        : "grid-cols-4";

  const pickMasters = useMemo(
    () => masters.filter((m) => isAiMasterId(m.id) && m.id !== "numerolog"),
    [masters]
  );
  const pickSystem = useMemo<DeckSystem>(() => resolveMasterDeckSystem(master), [master]);
  const placeholderName = useMemo(
    () => DECK_REGISTRY[pickSystem]?.symbols[0]?.name ?? "",
    [pickSystem]
  );
  const selectedMaster = useMemo(
    () => pickMasters.find((m) => m.id === master),
    [pickMasters, master]
  );

  useEffect(() => {
    spreadIdRef.current = spreadId;
  }, [spreadId]);

  useEffect(() => {
    setSpreadId(initialSpreadId);
  }, [initialSpreadId]);

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpen, onAutoOpenHandled]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/daily-reading?date=${localDateStr()}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            text?: string;
            cards?: DailyCard[];
            system?: DeckSystem | null;
            drawn?: boolean;
            spreadId?: SpreadId | null;
            locked?: boolean;
            purged?: boolean;
          };
          if (data.drawn && data.locked && !data.text) {
            setLockedToday(true);
            setDrawnToday(true);
            setSpreadId(
              data.spreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID
            );
          } else if (data.drawn && data.text) {
            setText(data.text);
            setCards(Array.isArray(data.cards) ? data.cards : []);
            setSystem(data.system ?? null);
            setSpreadId(data.spreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID);
            setRevealed(Array.isArray(data.cards) ? data.cards.length : 0);
            setDrawnToday(true);
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { resumeStoredOrActiveAsyncJob } = await import(
          "@/lib/client/wait-for-async-job"
        );
        const data = await resumeStoredOrActiveAsyncJob({
          storageKey: "aura:daily-reading-active-job",
          kind: "daily_reading,daily_extended",
        });
        if (cancelled || !data?.text || !Array.isArray(data.cards) || !data.cards.length) {
          return;
        }
        setText(String(data.text));
        setCards(data.cards as DailyCard[]);
        setSystem((data.system as DeckSystem | null) ?? null);
        setSpreadId(data.spreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID);
        setRevealed((data.cards as DailyCard[]).length);
        setDrawnToday(true);
      } catch {
        /* ignore resume errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !drawing) setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, drawing]);

  const draw = async (overrideSpreadId?: SpreadId) => {
    if (drawing || lockedToday) return;
    const activeSpreadId = overrideSpreadId ?? spreadIdRef.current;
    if (overrideSpreadId) {
      setSpreadId(overrideSpreadId);
      spreadIdRef.current = overrideSpreadId;
    }
    setDrawing(true);
    setErrorMessage(null);
    try {
      const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
      const { status: resStatus, data } = await postWithAsyncJob({
        url: "/api/daily-reading",
        body: {
          characterKey: master,
          localDate: localDateStr(),
          spreadId: activeSpreadId,
        },
        storageKey: "aura:daily-reading-active-job",
      });
      const typed = data as {
        text?: string;
        cards?: DailyCard[];
        system?: DeckSystem | null;
        drawn?: boolean;
        spreadId?: SpreadId | null;
        error?: string;
        message?: string;
        balance?: number;
        required?: number;
        code?: string;
      };
      if (resStatus === 402 && typed.error === "insufficient_runes") {
        if (
          onInsufficientRunes &&
          typeof typed.balance === "number" &&
          typeof typed.required === "number"
        ) {
          onInsufficientRunes({ balance: typed.balance, required: typed.required });
        } else {
          setErrorMessage("Недостаточно рун для расширенного расклада.");
        }
        return;
      }
      if (resStatus === 403 && typed.error === "daily_reading_locked") {
        setLockedToday(true);
        setDrawnToday(true);
        setErrorMessage(typed.message ?? "Расклад на сегодня уже был — новый будет доступен завтра.");
        return;
      }
      if (resStatus >= 500 || typed.code === "generation_failed") {
        setErrorMessage(
          typed.error ?? "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз."
        );
        return;
      }
      if (typed.drawn && typed.text && Array.isArray(typed.cards) && typed.cards.length) {
        setText(typed.text);
        setCards(typed.cards);
        setSystem(typed.system ?? pickSystem);
        setSpreadId(typed.spreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID);
        setRevealed(0);
        setDrawnToday(true);
      } else if (typed.message) {
        setErrorMessage(typed.message);
      } else {
        setErrorMessage("Не удалось разложить карты. Попробуйте ещё раз.");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "Не удалось разложить карты. Попробуйте ещё раз."
      );
    } finally {
      setDrawing(false);
    }
  };

  const revealNext = () =>
    setRevealed((n) => Math.min(n + 1, cards.length || spread.cardCount));

  const hasDraw = cards.length > 0;
  const allRevealed = hasDraw && revealed >= cards.length;
  const canDraw = !lockedToday && !hasDraw && !drawing;
  const canReveal = hasDraw && revealed < cards.length && !drawing;
  const canUpgradeToExtended =
    !lockedToday && hasDraw && spreadId !== "daily-extended" && !drawing;
  const { body, quote } = useMemo(
    () => (text && allRevealed ? parseDailyEnergyText(text) : { body: "", quote: null }),
    [text, allRevealed]
  );
  const ritualUpsellType = useMemo(
    () => (text ? dailyRitualType(text, positionLabels) : null),
    [text, positionLabels]
  );
  const jointReadingVisible = useMemo(
    () => showDailyJointReading(spreadId, positionLabels),
    [spreadId, positionLabels]
  );

  // ─────────────────────────── TRIGGER CARD ───────────────────────────
  if (!loaded) {
    return (
      <section className="ritual-cta-banner" aria-hidden>
        <div className="ritual-cta-banner__inner">
          <span className="ritual-cta-banner__icon">
            <Moon className="h-6 w-6 text-amber-200" aria-hidden />
          </span>
          <div className="ritual-cta-banner__copy">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
              Бесплатно · раз в сутки
            </p>
            <h3 className="ritual-cta-banner__title">Расклад на сутки</h3>
            <p className="ritual-cta-banner__text">Загружаем статус…</p>
          </div>
        </div>
      </section>
    );
  }

  const statusText = lockedToday
    ? "Расклад на сегодня уже был — новый завтра"
    : drawnToday
      ? spreadId === "daily-extended"
        ? "Расширенный расклад на сегодня готов"
        : "Ваш расклад на сегодня готов"
      : `Выберите мастера и откройте ${cardsLabelRu(spread.cardCount)}`;

  return (
    <>
      <section className="ritual-cta-banner" aria-labelledby="daily-energy-banner-title">
        <div className="ritual-cta-banner__inner">
          <span className="ritual-cta-banner__icon" aria-hidden>
            <Moon className="h-6 w-6 text-amber-200" strokeWidth={1.5} />
          </span>
          <div className="ritual-cta-banner__copy">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
              Бесплатно · раз в сутки
            </p>
            <h3 id="daily-energy-banner-title" className="ritual-cta-banner__title">
              Расклад на сутки
            </h3>
            <p className="ritual-cta-banner__text">{statusText}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
          >
            {lockedToday ? "Завтра" : drawnToday ? "Смотреть" : "Разложить"}
          </button>
        </div>
      </section>
      <BodyPortal active={open}>
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[6500] flex items-end justify-center sm:items-center sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label="Расклад на сутки"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={() => !drawing && setOpen(false)}
                aria-label="Закрыть"
              />
              <motion.div
                className={`relative z-10 flex w-full max-h-[min(90dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-t-3xl border border-amber-500/15 sm:rounded-3xl ${
                  spreadId === "daily-extended" ? "max-w-xl" : "max-w-md"
                }`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: "linear-gradient(160deg, #0d0a1a 0%, #120e24 60%, #0a0814 100%)",
                  boxShadow:
                    "0 0 0 1px rgba(212,175,55,0.12), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,90,200,0.08)",
                }}
                initial={{ opacity: 0, y: 32, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 32, scale: 0.97 }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aura-gold/40 to-transparent" />

                {/* Header */}
                <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
                    Бесплатно · раз в сутки
                  </p>
                  <h2 className="font-display text-lg font-semibold text-white">
                    {spreadId === "daily-extended" ? spread.label : "Расклад на сутки"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => !drawing && setOpen(false)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-500 transition-colors hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="lux-scroll lux-scroll--above-footer min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
                {lockedToday ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                    <p className="text-sm text-gray-200">
                      Расклад на сегодня уже был использован.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">
                      После очистки данных текст не сохраняется, но лимит «раз в сутки» остаётся до
                      полуночи по вашему времени.
                    </p>
                  </div>
                ) : null}
                {!hasDraw && !drawnToday && !lockedToday && (
                  <div className="mb-5">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Схема</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={drawing}
                        onClick={() => setSpreadId(DEFAULT_SPREAD_ID)}
                        className={`rounded-2xl border px-3 py-2.5 text-left text-xs transition-all disabled:opacity-50 ${
                          spreadId === DEFAULT_SPREAD_ID
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                            : "border-white/8 bg-white/[0.02] text-gray-400 hover:border-white/15"
                        }`}
                      >
                        <span className="block font-medium">Классический</span>
                        <span className="mt-0.5 block text-[10px] opacity-80">Утро · День · Вечер</span>
                      </button>
                      <button
                        type="button"
                        disabled={drawing}
                        onClick={() => setSpreadId("daily-extended")}
                        className={`rounded-2xl border px-3 py-2.5 text-left text-xs transition-all disabled:opacity-50 ${
                          spreadId === "daily-extended"
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                            : "border-white/8 bg-white/[0.02] text-gray-400 hover:border-white/15"
                        }`}
                      >
                        <span className="block font-medium">Расширенный</span>
                        <span className="mt-0.5 block text-[10px] opacity-80">
                          7 сфер ·{" "}
                          {isUnlimited ? (
                            "без списания"
                          ) : showExtendedPrice ? (
                            <RuneCost cost={extendedCost} enabled className="inline text-[10px]" />
                          ) : (
                            "10 рун"
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Master selector — hidden once drawn */}
                {!hasDraw && pickMasters.length > 1 && (
                  <div className="mb-5">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Мастер</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {pickMasters.map((m) => {
                        const selected = m.id === master;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMaster(m.id)}
                            disabled={drawing}
                            className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition-all disabled:opacity-50 ${
                              selected
                                ? "border-amber-500/50 bg-amber-500/10"
                                : "border-white/8 bg-white/[0.02] hover:border-white/15"
                            }`}
                          >
                            <div className={selected ? "ring-2 ring-amber-400/60 rounded-full" : ""}>
                              <MasterAvatar masterId={m.id} masterName={m.name} size="md" thumb />
                            </div>
                            <span
                              className={`text-[11px] font-medium ${selected ? "text-amber-100" : "text-gray-400"}`}
                            >
                              {m.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedMaster && (
                      <p className="mt-2 text-center text-[11px] text-amber-300/70">
                        {DECK_SYSTEM_DISPLAY[pickSystem] ?? selectedMaster.title}
                      </p>
                    )}
                  </div>
                )}

                {canUpgradeToExtended && (
                  <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                    <p className="text-xs text-gray-300">
                      Классический расклад готов. Можно расширить до 7 сфер дня.
                    </p>
                    <button
                      type="button"
                      disabled={drawing}
                      onClick={() => void draw("daily-extended")}
                      className="mt-2 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                    >
                      Расширить до 7 карт
                      {isUnlimited ? (
                        " · без списания"
                      ) : showExtendedPrice ? (
                        <>
                          {" · "}
                          <RuneCost cost={extendedCost} enabled className="inline text-[10px]" />
                        </>
                      ) : (
                        " · 10 рун"
                      )}
                    </button>
                  </div>
                )}

                {/* Cards */}
                {!lockedToday && (
                <div className={`grid gap-2 sm:gap-3 ${cardGridClass}`}>
                  {(hasDraw ? cards : positionLabels.map(() => null)).map((card, i) => {
                    const pos = card?.position ?? positionLabels[i] ?? `Символ ${i + 1}`;
                    const isRevealed = hasDraw && i < revealed;
                    const cardData = card
                      ? { name: card.name, meaning: card.meaning, reversed: card.reversed }
                      : { name: placeholderName };
                    const cardCanDraw = canDraw;
                    const cardCanReveal = canReveal && !isRevealed;
                    const cardInteractive = cardCanDraw || cardCanReveal;
                    return (
                      <div key={`${pos}-${i}`} className="flex flex-col items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-amber-400/60">{pos}</span>
                        <button
                          type="button"
                          onClick={
                            cardCanDraw
                              ? () => void draw()
                              : cardCanReveal
                                ? revealNext
                                : undefined
                          }
                          disabled={!cardInteractive}
                          className={`relative w-full ${cardInteractive ? "cursor-pointer transition-transform hover:-translate-y-1" : ""}`}
                          aria-label={isRevealed && card ? card.name : "Открыть карту"}
                        >
                          <DeckCard
                            card={cardData}
                            system={hasDraw && system ? system : pickSystem}
                            masterId={master}
                            faceDown={!isRevealed}
                            reversed={card?.reversed}
                            showMeaning={false}
                            hideCaption={!isRevealed}
                            size="sm"
                            className="mx-auto w-full max-w-[84px] sm:max-w-[110px]"
                          />
                          {drawing && i === Math.floor((spread.cardCount - 1) / 2) && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                )}

                {/* Hint */}
                {!lockedToday && !allRevealed && (
                  <p className="mt-4 text-center text-xs text-amber-300/70">
                    {drawing
                      ? "Раскрываем карты…"
                      : canDraw
                        ? "Нажмите на карты, чтобы открыть расклад"
                        : canReveal
                          ? "Открывайте карты, чтобы увидеть энергию дня"
                          : null}
                  </p>
                )}

                <div className="mt-3">
                  <AsyncJobProgressNotice
                    active={drawing}
                    label="Мастер готовит энергию дня"
                  />
                </div>

                {errorMessage && (
                  <p className="mt-3 text-center text-xs text-red-400">{errorMessage}</p>
                )}

                {/* Energy reading */}
                <AnimatePresence>
                  {allRevealed && text && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 rounded-2xl border border-amber-500/12 bg-black/20 p-4"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
                        {spreadId === "daily-extended" ? spread.label : "Энергия дня"}
                      </p>
                      <div className="mt-3 space-y-3">
                        {renderDailyReadingBody(body)}
                        {quote ? (
                          <blockquote className="my-2 border-l-2 border-amber-500/40 pl-4 text-sm italic text-amber-200/80">
                            {quote}
                          </blockquote>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {allRevealed &&
                text &&
                ((ritualUpsellType && onStartRitual) || jointReadingVisible) ? (
                  <div className="mt-5 space-y-3">
                    {ritualUpsellType && onStartRitual ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onStartRitual(ritualUpsellType);
                        }}
                        className="block w-full rounded-xl border border-purple-500/25 bg-purple-500/8 px-4 py-3 text-left text-sm text-white/75 transition-colors hover:border-purple-500/40"
                      >
                        Усилите энергию дня{" "}
                        <span className="text-amber-300">обрядом →</span>
                      </button>
                    ) : null}
                    {jointReadingVisible ? (
                      <Link
                        href={dailyJointReadingHref()}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70 transition-colors hover:border-amber-500/25 hover:text-white"
                      >
                        <Users className="h-4 w-4 shrink-0 text-amber-400/80" />
                        Совместный расклад с партнёром
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Footer — only after reveal */}
              {allRevealed && (
                <div className="shrink-0 space-y-2 border-t border-white/6 bg-[#0d0a1a]/95 px-4 py-3 sm:px-5 sm:py-4">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-center rounded-2xl py-3 text-sm font-semibold transition-all"
                    style={{
                      background: GOLD_GRADIENT,
                      color: "#1a0f00",
                      boxShadow: "0 4px 20px rgba(212,175,55,0.3)",
                    }}
                  >
                    На главную
                  </button>
                </div>
              )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}
