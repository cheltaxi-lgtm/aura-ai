"use client";

import { useEffect, useMemo, useState } from "react";

export type HdGeneratingKind = "personal" | "composite" | "center";

const PHASES: Record<HdGeneratingKind, string[]> = {
  personal: [
    "Сверяю расчётные данные карты…",
    "Пишу тип, стратегию и авторитет…",
    "Разбираю девять центров…",
    "Раскрываю каналы и планеты…",
    "Добавляю бизнес, сон и скрытые разделы…",
    "Собираю практики и проверяю полноту…",
  ],
  composite: [
    "Накладываю две карты…",
    "Считаю электромагнетику и опоры…",
    "Описываю химию связи…",
    "Разбираю типы, роли и решения в паре…",
    "Пишу быт, деньги и риски связи…",
    "Собираю практики и проверяю полноту…",
  ],
  center: [
    "Смотрю механику центра…",
    "Формулирую разбор Эвелины…",
  ],
};

/** Soft ETA for the wait UI + progress ease. Sectional personal HD is
 * 12 batched calls in concurrent waves + editor (~3–8 min with Kimi);
 * composite similar. */
const ETA_MIN: Record<HdGeneratingKind, { min: number; max: number }> = {
  personal: { min: 3, max: 8 },
  composite: { min: 3, max: 7 },
  center: { min: 0.5, max: 1 },
};

interface Props {
  kind: HdGeneratingKind;
  /** Epoch ms when wait started (for soft progress). */
  startedAt?: number;
  compact?: boolean;
  title?: string;
}

/** Shared wait surface for HD LLM reports — phases, soft ETA, “можно уйти”. */
export default function HdGenerating({
  kind,
  startedAt,
  compact = false,
  title,
}: Props) {
  const phases = PHASES[kind];
  const eta = ETA_MIN[kind];
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setPhaseIndex((i) => (i + 1) % phases.length);
    }, kind === "center" ? 2800 : 4500);
    return () => window.clearInterval(id);
  }, [kind, phases.length]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const etaMaxSec = eta.max * 60;
  const softPct = useMemo(() => {
    if (!startedAt) return 12;
    // Ease toward ~92%, never claim 100% until parent swaps UI.
    const t = Math.min(1, elapsedSec / etaMaxSec);
    return Math.round(12 + t * 80);
  }, [elapsedSec, etaMaxSec, startedAt]);

  const elapsedLabel =
    elapsedSec < 60
      ? `${elapsedSec} сек`
      : `${Math.floor(elapsedSec / 60)} мин ${String(elapsedSec % 60).padStart(2, "0")} сек`;

  const heading =
    title ??
    (kind === "personal"
      ? "Эвелина пишет полную расшифровку"
      : kind === "composite"
        ? "Эвелина пишет разбор связи"
        : "Эвелина разбирает центр");

  const etaText =
    kind === "center"
      ? "Обычно меньше минуты"
      : `Обычно ${eta.min}–${eta.max} минут`;

  return (
    <div
      className={compact ? "hd-generating hd-generating--compact" : "hd-generating"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="hd-generating__orb" aria-hidden="true">
        <span className="hd-generating__ring" />
        <span className="hd-generating__ring hd-generating__ring--delay" />
        <span className="hd-generating__core" />
      </div>

      <p className="hd-generating__title">{heading}</p>
      <p className="hd-generating__phase">{phases[phaseIndex]}</p>

      <div className="hd-generating__bar" aria-hidden="true">
        <div className="hd-generating__bar-fill" style={{ width: `${softPct}%` }} />
      </div>

      <p className="hd-generating__meta">
        {etaText}
        {startedAt ? ` · идёт ${elapsedLabel}` : null}
      </p>

      {!compact && (
        <div className="hd-generating__notice">
          <strong>Можно закрыть страницу</strong>
          <span>
            Разбор сохранится по постоянной ссылке в кабинете. Вернитесь позже — статус
            подхватится сам. При сбое задача перезапустится автоматически, повторного
            списания рун не будет.
          </span>
        </div>
      )}
    </div>
  );
}
