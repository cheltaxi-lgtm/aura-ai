"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, Moon } from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import { isAiMasterId, type ShowcaseMaster } from "@/lib/showcase-masters";
import { resolveMasterDeckSystem, DECK_REGISTRY } from "@/lib/decks";
import { DECK_SYSTEM_DISPLAY } from "@/lib/photo-spread-redraw";
import type { DeckSystem } from "@/lib/decks/types";
import DeckCard from "@/components/DeckCard";
import MasterAvatar from "@/components/MasterAvatar";
import { toParagraphs } from "@/lib/format-paragraphs";

const QUOTE_RE = /(Помни:\s*даже камень[^.!?]*[.!?])/i;
const DAILY_POSITIONS = ["Утро", "День", "Вечер"] as const;
const GOLD_GRADIENT = "linear-gradient(135deg, #c9993a 0%, #e8c56d 50%, #c9993a 100%)";

interface DailyCard {
  name: string;
  meaning?: string;
  reversed?: boolean;
  position?: string;
}

export interface PremiumEnergyBlockProps {
  characterKey?: string;
  masters: ShowcaseMaster[];
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

function renderBodyWithMasterHighlight(body: string, masterLabel: string) {
  const firstName = masterLabel.trim().split(/\s+/)[0];
  const paragraphs = toParagraphs(body);
  const re =
    firstName && firstName.length >= 2
      ? new RegExp(`(${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i")
      : null;

  return (
    <div className="space-y-3.5">
      {paragraphs.map((para, pIndex) => {
        if (!re) {
          return (
            <p key={`daily-p-${pIndex}`} className="text-[15px] leading-[1.85] text-gray-200">
              {para}
            </p>
          );
        }
        const parts = para.split(re);
        return (
          <p key={`daily-p-${pIndex}`} className="text-[15px] leading-[1.85] text-gray-200">
            {parts.map((part, i) =>
              re.test(part) ? (
                <span
                  key={`${pIndex}-${i}`}
                  className="font-display text-lg text-amber-100 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                >
                  {part}
                </span>
              ) : (
                <span key={`${pIndex}-${i}`}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function PremiumEnergyBlock({
  characterKey = "veronika",
  masters,
}: PremiumEnergyBlockProps) {
  const [loaded, setLoaded] = useState(false);
  const [drawnToday, setDrawnToday] = useState(false);
  const [open, setOpen] = useState(false);

  const [master, setMaster] = useState(characterKey);
  const [text, setText] = useState<string | null>(null);
  const [cards, setCards] = useState<DailyCard[]>([]);
  const [system, setSystem] = useState<DeckSystem | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState(false);

  const pickMasters = useMemo(
    () => masters.filter((m) => isAiMasterId(m.id) && m.id !== "numerolog"),
    [masters]
  );
  const pickSystem = useMemo<DeckSystem>(() => resolveMasterDeckSystem(master), [master]);
  const placeholderName = useMemo(
    () => DECK_REGISTRY[pickSystem]?.symbols[0]?.name ?? "",
    [pickSystem]
  );
  const masterLabel = useMemo(() => getCharacterById(master)?.name ?? master, [master]);
  const selectedMaster = useMemo(
    () => pickMasters.find((m) => m.id === master),
    [pickMasters, master]
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/daily-reading?date=${localDateStr()}`);
        if (res.ok) {
          const data = (await res.json()) as {
            text?: string;
            cards?: DailyCard[];
            system?: DeckSystem | null;
            drawn?: boolean;
          };
          if (data.drawn && data.text) {
            setText(data.text);
            setCards(Array.isArray(data.cards) ? data.cards : []);
            setSystem(data.system ?? null);
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

  const draw = async () => {
    if (drawing) return;
    setDrawing(true);
    setError(false);
    try {
      const res = await fetch("/api/daily-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterKey: master, localDate: localDateStr() }),
      });
      const data = (await res.json()) as {
        text?: string;
        cards?: DailyCard[];
        system?: DeckSystem | null;
        drawn?: boolean;
      };
      if (data.drawn && data.text && Array.isArray(data.cards) && data.cards.length) {
        setText(data.text);
        setCards(data.cards);
        setSystem(data.system ?? pickSystem);
        setRevealed(0);
        setDrawnToday(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setDrawing(false);
    }
  };

  const revealNext = () =>
    setRevealed((n) => Math.min(n + 1, cards.length || DAILY_POSITIONS.length));

  const hasDraw = cards.length > 0;
  const allRevealed = hasDraw && revealed >= cards.length;
  const { body, quote } = useMemo(
    () => (text && allRevealed ? parseDailyEnergyText(text) : { body: "", quote: null }),
    [text, allRevealed]
  );

  // ─────────────────────────── TRIGGER CARD ───────────────────────────
  if (!loaded) {
    return (
      <div className="mb-8 rounded-3xl border border-amber-500/20 bg-gradient-to-br from-purple-950/40 to-slate-900/60 p-6 backdrop-blur-md">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-12 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-8 overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-purple-950/40 to-slate-900/60 p-6 shadow-2xl backdrop-blur-md sm:p-7"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
            <Moon className="h-6 w-6 text-amber-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
              Бесплатно · раз в сутки
            </p>
            <h3 className="font-display text-lg font-semibold text-white">Расклад на сутки</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {drawnToday
                ? "Ваш расклад на сегодня готов"
                : "Выберите мастера и откройте три карты"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.03] active:scale-95"
            style={{ background: GOLD_GRADIENT, color: "#1a0f00", boxShadow: "0 4px 20px rgba(212,175,55,0.3)" }}
          >
            {drawnToday ? "Смотреть" : "Разложить"}
          </button>
        </div>
      </motion.section>

      {/* ─────────────────────────── MODAL ─────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
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
              className="relative z-10 flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
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
              <div className="relative flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
                    Бесплатно · раз в сутки
                  </p>
                  <h2 className="font-display text-lg font-semibold text-white">Расклад на сутки</h2>
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

              <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-white/8 to-transparent mx-5" />

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
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

                {/* Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {(hasDraw ? cards : DAILY_POSITIONS.map(() => null)).map((card, i) => {
                    const pos = card?.position ?? DAILY_POSITIONS[i] ?? `Символ ${i + 1}`;
                    const isRevealed = hasDraw && i < revealed;
                    const cardData = card
                      ? { name: card.name, meaning: card.meaning, reversed: card.reversed }
                      : { name: placeholderName };
                    const clickable = !hasDraw || (!isRevealed && hasDraw);
                    return (
                      <div key={`${pos}-${i}`} className="flex flex-col items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-amber-400/60">{pos}</span>
                        <button
                          type="button"
                          onClick={
                            drawing
                              ? undefined
                              : !hasDraw
                                ? () => void draw()
                                : !isRevealed
                                  ? revealNext
                                  : undefined
                          }
                          disabled={drawing || (hasDraw && isRevealed)}
                          className={`relative w-full ${clickable && !drawing ? "cursor-pointer transition-transform hover:-translate-y-1" : ""}`}
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
                            className="mx-auto w-full max-w-[110px]"
                          />
                          {drawing && i === 1 && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Hint */}
                {!allRevealed && (
                  <p className="mt-4 text-center text-xs text-amber-300/70">
                    {drawing
                      ? "Раскрываем карты…"
                      : !hasDraw
                        ? "Нажмите на карты, чтобы открыть расклад"
                        : "Открывайте карты, чтобы увидеть энергию дня"}
                  </p>
                )}

                {error && (
                  <p className="mt-3 text-center text-xs text-red-400">
                    Не удалось разложить карты. Попробуйте ещё раз.
                  </p>
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
                        Энергия дня
                      </p>
                      <div className="mt-3 space-y-3">
                        {renderBodyWithMasterHighlight(body, masterLabel)}
                        {quote ? (
                          <blockquote className="my-2 border-l-2 border-amber-500/40 pl-4 text-sm italic text-amber-200/80">
                            {quote}
                          </blockquote>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer — only after reveal */}
              {allRevealed && (
                <div className="shrink-0 border-t border-white/6 px-5 py-4">
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
    </>
  );
}
