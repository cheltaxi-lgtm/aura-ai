"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_RUNE_COSTS,
  RUNE_ACTION_LABELS,
  type RuneActionType,
} from "@/lib/rune-costs";

export interface RuneConfig {
  enabled: boolean;
  rubPerRune: number;
  starterRunes: number;
  freeQuestions: number;
  costs: Record<RuneActionType, number>;
  labels: Record<RuneActionType, string>;
}

const FALLBACK: RuneConfig = {
  enabled: true,
  rubPerRune: 2,
  starterRunes: 30,
  freeQuestions: 2,
  costs: { ...DEFAULT_RUNE_COSTS },
  labels: { ...RUNE_ACTION_LABELS },
};

let cached: RuneConfig | null = null;
/** True only when the cached config came from /api/runes/config — never for FALLBACK. */
let cachedFromServer = false;
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
        starterRunes: Number(d.starterRunes) || FALLBACK.starterRunes,
        freeQuestions: Number(d.freeQuestions) ?? FALLBACK.freeQuestions,
        costs: { ...FALLBACK.costs, ...(d.costs ?? {}) },
        labels: { ...FALLBACK.labels, ...(d.labels ?? {}) },
      };
      cached = config;
      cachedFromServer = d !== FALLBACK;
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
  cachedFromServer = false;
}

export function useRuneConfig() {
  const [config, setConfig] = useState<RuneConfig | null>(cached);
  const [fromServer, setFromServer] = useState(cachedFromServer);
  const ready = config !== null;

  useEffect(() => {
    void fetchRuneConfig().then((c) => {
      setConfig(c);
      setFromServer(cachedFromServer);
    });
  }, []);

  const effective = config ?? FALLBACK;

  const cost = (action: RuneActionType) => effective.costs[action] ?? 0;

  const formatRunes = (amount: number) => `${amount} ᚢ`;

  const formatRunesWithRub = (amount: number) => {
    const rub = Math.round(amount * effective.rubPerRune);
    return `${amount} ᚢ · ~${rub} ₽`;
  };

  return { config: effective, cost, formatRunes, formatRunesWithRub, ready, fromServer };
}
