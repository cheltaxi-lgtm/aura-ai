import { TRIPLET_POSITIONS } from "@/lib/tarot";
import type { DeckSystem } from "@/lib/decks/types";
import type { SessionTopicId } from "@/lib/session-topics";
import {
  DEFAULT_SPREAD_CATALOG_SETTINGS,
  type SpreadCatalogSettings,
  type SpreadDefinition,
  type SpreadId,
  type SpreadPosition,
  type SpreadSettingsOverride,
} from "./types";

const tripletPositions: SpreadPosition[] = TRIPLET_POSITIONS.map((label, i) => ({
  key: `p${i + 1}`,
  label,
}));

const tripletLovePositions: SpreadPosition[] = [
  { key: "you", label: "Вы" },
  { key: "partner", label: "Партнёр" },
  { key: "outlook", label: "Перспектива" },
];

const situation5Positions: SpreadPosition[] = [
  { key: "situation", label: "Ситуация" },
  { key: "obstacle", label: "Препятствие" },
  { key: "root", label: "Корень" },
  { key: "advice", label: "Совет" },
  { key: "outcome", label: "Итог" },
];

const love7Positions: SpreadPosition[] = [
  { key: "you", label: "Вы" },
  { key: "partner", label: "Партнёр" },
  { key: "bond", label: "Связь между вами" },
  { key: "strength", label: "Сила пары" },
  { key: "weakness", label: "Слабое место" },
  { key: "advice", label: "Совет" },
  { key: "outcome", label: "Итог" },
];

const celticCrossPositions: SpreadPosition[] = [
  { key: "present", label: "Настоящее" },
  { key: "challenge", label: "Вызов" },
  { key: "past", label: "Прошлое" },
  { key: "future", label: "Будущее" },
  { key: "above", label: "Сознание" },
  { key: "below", label: "Подсознание" },
  { key: "advice", label: "Совет" },
  { key: "environment", label: "Окружение" },
  { key: "hopes", label: "Надежды и страхи" },
  { key: "outcome", label: "Итог" },
];

export const SPREAD_REGISTRY: Record<SpreadId, SpreadDefinition> = {
  triplet: {
    id: "triplet",
    label: "Три карты",
    description: "Прошлое, настоящее и будущее — классический расклад",
    cardCount: 3,
    positions: tripletPositions,
    topics: "*",
    systems: "*",
    costMultiplier: 1.0,
    layout: "row",
    seoSlug: "triplet",
  },
  single: {
    id: "single",
    label: "Одна карта",
    description: "Быстрый ответ или послание дня",
    cardCount: 1,
    positions: [{ key: "message", label: "Послание" }],
    topics: "*",
    systems: "*",
    costMultiplier: 0.5,
    layout: "row",
    seoSlug: "odna-karta",
  },
  "situation-5": {
    id: "situation-5",
    label: "Расклад на ситуацию",
    description: "Пять карт: суть, препятствие, корень, совет и итог",
    cardCount: 5,
    positions: situation5Positions,
    topics: "*",
    systems: "*",
    costMultiplier: 1.5,
    layout: "cross5",
    compactPrompt: true,
    seoSlug: "na-5-kart",
  },
  "triplet-love": {
    id: "triplet-love",
    label: "Любовный триплет",
    description: "Вы, партнёр и перспектива отношений",
    cardCount: 3,
    positions: tripletLovePositions,
    topics: ["love"],
    systems: "*",
    costMultiplier: 1.0,
    layout: "row",
  },
  "love-7": {
    id: "love-7",
    label: "Волшебная любовь",
    description: "Глубокий расклад на отношения — семь позиций",
    cardCount: 7,
    positions: love7Positions,
    topics: ["love"],
    systems: "*",
    costMultiplier: 2.0,
    layout: "grid7",
    compactPrompt: true,
    seoSlug: "na-lyubov",
  },
  "yes-no": {
    id: "yes-no",
    label: "Да / Нет",
    description: "Прямой ответ на вопрос — одна карта таро",
    cardCount: 1,
    positions: [{ key: "answer", label: "Ответ" }],
    topics: "*",
    systems: ["tarot-veronika", "tarot-marina"],
    costMultiplier: 0.5,
    layout: "row",
  },
  "celtic-cross": {
    id: "celtic-cross",
    label: "Кельтский крест",
    description: "Классический глубокий расклад — десять карт",
    cardCount: 10,
    positions: celticCrossPositions,
    topics: "*",
    systems: "*",
    costMultiplier: 2.5,
    layout: "celtic10",
    compactPrompt: true,
    seoSlug: "keltskij-krest",
  },
  "daily-extended": {
    id: "daily-extended",
    label: "Расширенный день",
    description: "Семь карт на разные сферы дня",
    cardCount: 7,
    positions: [
      { key: "morning", label: "Утро" },
      { key: "work", label: "Дела" },
      { key: "relations", label: "Отношения" },
      { key: "health", label: "Энергия" },
      { key: "evening", label: "Вечер" },
      { key: "advice", label: "Совет" },
      { key: "message", label: "Послание" },
    ],
    topics: "*",
    systems: "*",
    costMultiplier: 2.0,
    layout: "grid7",
    compactPrompt: true,
  },
};

export const DEFAULT_SPREAD_ID: SpreadId = "triplet";

export function normalizeSpreadId(raw?: string | null): SpreadId {
  if (raw && raw in SPREAD_REGISTRY) return raw as SpreadId;
  return DEFAULT_SPREAD_ID;
}

let catalogSettings: SpreadCatalogSettings = { ...DEFAULT_SPREAD_CATALOG_SETTINGS };

export function setSpreadCatalogSettings(settings: Partial<SpreadCatalogSettings>): void {
  catalogSettings = {
    spreadsCatalogEnabled:
      settings.spreadsCatalogEnabled ?? catalogSettings.spreadsCatalogEnabled,
    spreadOverrides: {
      ...catalogSettings.spreadOverrides,
      ...settings.spreadOverrides,
    },
  };
}

export function getSpreadCatalogSettings(): SpreadCatalogSettings {
  return catalogSettings;
}

export function mergeSpreadCatalogSettings(
  raw: Partial<SpreadCatalogSettings> | null | undefined
): SpreadCatalogSettings {
  if (!raw) return { ...DEFAULT_SPREAD_CATALOG_SETTINGS };
  return {
    spreadsCatalogEnabled:
      raw.spreadsCatalogEnabled ?? DEFAULT_SPREAD_CATALOG_SETTINGS.spreadsCatalogEnabled,
    spreadOverrides: {
      ...DEFAULT_SPREAD_CATALOG_SETTINGS.spreadOverrides,
      ...(raw.spreadOverrides ?? {}),
    },
  };
}

function getSpreadOverride(id: SpreadId): SpreadSettingsOverride | undefined {
  return catalogSettings.spreadOverrides[id];
}

export function isSpreadEnabled(id: SpreadId): boolean {
  if (!catalogSettings.spreadsCatalogEnabled) {
    return id === DEFAULT_SPREAD_ID;
  }
  const override = getSpreadOverride(id);
  if (override?.enabled === false) return false;
  return true;
}

export function getSpread(id: SpreadId | string | null | undefined): SpreadDefinition {
  const spreadId = normalizeSpreadId(id);
  const base = SPREAD_REGISTRY[spreadId];
  const override = getSpreadOverride(spreadId);
  if (!override?.costMultiplier) return base;
  return { ...base, costMultiplier: override.costMultiplier };
}

export function getSpreadCostMultiplier(id: SpreadId | string | null | undefined): number {
  return getSpread(id).costMultiplier;
}

export function resolveSpreadPositions(
  spreadId: SpreadId | string | null | undefined,
  topic?: SessionTopicId | null
): SpreadPosition[] {
  const spread = getSpread(spreadId);
  if (topic === "love" && spread.id === "triplet") {
    return tripletLovePositions;
  }
  return spread.positions;
}

export function spreadPositionLabels(
  spreadId: SpreadId | string | null | undefined,
  topic?: SessionTopicId | null
): string[] {
  return resolveSpreadPositions(spreadId, topic).map((p) => p.label);
}

export function spreadMatchesTopic(
  spread: SpreadDefinition,
  topic: SessionTopicId
): boolean {
  if (spread.topics === "*") return true;
  return spread.topics.includes(topic);
}

export function spreadMatchesSystem(spread: SpreadDefinition, system: DeckSystem): boolean {
  if (spread.systems === "*") return true;
  return spread.systems.includes(system);
}

export function listSpreads(options?: {
  topic?: SessionTopicId | null;
  system?: DeckSystem;
  includeDisabled?: boolean;
}): SpreadDefinition[] {
  const { topic, system, includeDisabled } = options ?? {};
  return (Object.values(SPREAD_REGISTRY) as SpreadDefinition[]).filter((spread) => {
    if (!includeDisabled && !isSpreadEnabled(spread.id)) return false;
    if (spread.id === "triplet-love") return false;
    if (topic && !spreadMatchesTopic(spread, topic)) return false;
    if (system && !spreadMatchesSystem(spread, system)) return false;
    return true;
  });
}

export function listSpreadsForTopic(
  topic: SessionTopicId,
  system: DeckSystem
): SpreadDefinition[] {
  return listSpreads({ topic, system });
}

export function getSpreadBySeoSlug(slug: string): SpreadDefinition | null {
  const found = (Object.values(SPREAD_REGISTRY) as SpreadDefinition[]).find(
    (s) => s.seoSlug === slug
  );
  return found ?? null;
}

export function requiredCardCount(
  spreadId: SpreadId | string | null | undefined,
  spreadType?: string | null
): number {
  if (spreadType === "daily") return 3;
  if (spreadType === "photo") return 1;
  return getSpread(spreadId).cardCount;
}

export function hasCompleteSpread(
  cards: string[] | null | undefined,
  spreadId?: SpreadId | string | null,
  spreadType?: string | null
): boolean {
  const count = cards?.length ?? 0;
  if (count < 1) return false;
  const required = requiredCardCount(spreadId, spreadType);
  return count >= required;
}

/** Flip state array sized for N-card spreads (replaces hardcoded [true,true,true]). */
export function spreadFlippedState(count: number, flipped = true): boolean[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, () => flipped);
}

export function sliceForSpread<T>(
  items: T[],
  spreadId?: SpreadId | string | null,
  spreadType?: string | null
): T[] {
  return items.slice(0, requiredCardCount(spreadId, spreadType));
}
