"use client";

import { useEffect, useState } from "react";
import type { RuneActionType } from "@/lib/rune-costs";

export interface RuneConfig {
  enabled: boolean;
  rubPerRune: number;
  freeQuestions: number;
  costs: Record<RuneActionType, number>;
  labels: Record<RuneActionType, string>;
}

const FALLBACK: RuneConfig = {
  enabled: true,
  rubPerRune: 2,
  freeQuestions: 2,
  costs: {
    QUESTION: 10,
    VISION_ANALYSIS: 30,
    READING: 15,
    INTENTION_SPREAD: 20,
    DESTINY_CARD: 20,
    JOINT_READING: 25,
    DAILY_AMULET: 5,
    DAILY_EXTENDED: 10,
    FINAL_REPORT: 30,
  },
  labels: {
    QUESTION: "Вопрос мастеру",
    VISION_ANALYSIS: "Анализ расклада по фото",
    READING: "Расшифровка расклада",
    INTENTION_SPREAD: "Расклад на тему",
    DESTINY_CARD: "Карта судьбы",
    JOINT_READING: "Совместный расклад",
    DAILY_AMULET: "Амулет дня",
    DAILY_EXTENDED: "Расширенный день",
    FINAL_REPORT: "Арт-отчёт сеанса",
  },
};

let cached: RuneConfig | null = null;
let inflight: Promise<RuneConfig> | null = null;

export function fetchRuneConfig(): Promise<RuneConfig> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch("/api/runes/config")
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((d) => {
      const config: RuneConfig = {
        enabled: d.enabled !== false,
        rubPerRune: Number(d.rubPerRune) || FALLBACK.rubPerRune,
        freeQuestions: Number(d.freeQuestions) ?? FALLBACK.freeQuestions,
        costs: { ...FALLBACK.costs, ...(d.costs ?? {}) },
        labels: { ...FALLBACK.labels, ...(d.labels ?? {}) },
      };
      cached = config;
      return config;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateRuneConfigCache() {
  cached = null;
}

export function useRuneConfig() {
  const [config, setConfig] = useState<RuneConfig | null>(cached);
  const ready = config !== null;

  useEffect(() => {
    void fetchRuneConfig().then(setConfig);
  }, []);

  const effective = config ?? FALLBACK;

  const cost = (action: RuneActionType) => effective.costs[action] ?? 0;

  const formatRunes = (amount: number) => `${amount} ᚢ`;

  const formatRunesWithRub = (amount: number) => {
    const rub = Math.round(amount * effective.rubPerRune);
    return `${amount} ᚢ · ~${rub} ₽`;
  };

  return { config: effective, cost, formatRunes, formatRunesWithRub, ready };
}
