import { getSetting, setSetting } from "@/lib/settings";
import {
  DEFAULT_RUNE_COSTS,
  RUNE_ACTION_LABELS,
  type RuneActionType,
} from "@/lib/rune-costs";

export interface RuneSettings {
  enabled: boolean;
  rubPerRune: number;
  starterRunes: number;
  freeQuestions: number;
  costs: Record<RuneActionType, number>;
}

export const DEFAULT_RUNE_SETTINGS: RuneSettings = {
  enabled: true,
  rubPerRune: 2,
  starterRunes: 30,
  freeQuestions: 2,
  costs: { ...DEFAULT_RUNE_COSTS },
};

export async function getRuneSettings(): Promise<RuneSettings> {
  const raw = await getSetting("runes");
  const costs: Record<RuneActionType, number> = { ...DEFAULT_RUNE_COSTS };

  const rawCosts = raw.costs as Partial<Record<RuneActionType, number>> | undefined;
  if (rawCosts) {
    for (const key of Object.keys(DEFAULT_RUNE_COSTS) as RuneActionType[]) {
      const n = Number(rawCosts[key]);
      costs[key] = Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_RUNE_COSTS[key];
    }
  }

  return {
    enabled: raw.enabled !== false,
    rubPerRune: clampNum(raw.rubPerRune, DEFAULT_RUNE_SETTINGS.rubPerRune, 0.1, 1000),
    starterRunes: clampInt(raw.starterRunes, DEFAULT_RUNE_SETTINGS.starterRunes, 0, 100_000),
    freeQuestions: clampInt(raw.freeQuestions, DEFAULT_RUNE_SETTINGS.freeQuestions, 0, 20),
    costs,
  };
}

export async function setRuneSettings(
  patch: Partial<RuneSettings>,
  adminId?: string
): Promise<RuneSettings> {
  const current = await getRuneSettings();
  const merged: RuneSettings = {
    ...current,
    ...patch,
    costs: { ...current.costs, ...(patch.costs ?? {}) },
  };
  await setSetting("runes", merged, adminId);
  return merged;
}

export function runeCostFromSettings(settings: RuneSettings, action: RuneActionType): number {
  return settings.costs[action] ?? DEFAULT_RUNE_COSTS[action];
}

export function serializeRuneConfig(settings: RuneSettings) {
  return {
    enabled: settings.enabled,
    rubPerRune: settings.rubPerRune,
    starterRunes: settings.starterRunes,
    freeQuestions: settings.freeQuestions,
    costs: settings.costs,
    labels: RUNE_ACTION_LABELS,
  };
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNum(value, fallback, min, max));
}
