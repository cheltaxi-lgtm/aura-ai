import { drawSpread, resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";

export const MASTER_QUICK_CHIP_MASTERS = [
  "ragnar",
  "veronika",
  "agafya",
  "shri-raj",
] as const;

export type MasterQuickChipMasterId = (typeof MASTER_QUICK_CHIP_MASTERS)[number];

export type PeriodSpreadScope = "today" | "week" | "year";

export const MASTER_FULL_SPREAD_CHIP_MESSAGE = "Получить расклад";

export const MASTER_PERIOD_CHIP_MESSAGES: Record<PeriodSpreadScope, string> = {
  today: "Расклад на сегодня",
  week: "Расклад на неделю",
  year: "Расклад на год",
};

export function hasMasterQuickChips(masterId: string | null | undefined): masterId is MasterQuickChipMasterId {
  if (!masterId) return false;
  return (MASTER_QUICK_CHIP_MASTERS as readonly string[]).includes(masterId);
}

export function detectPeriodSpreadScope(message: string): PeriodSpreadScope | null {
  const trimmed = message.trim();
  if (/^расклад\s+на\s+сегодня$/iu.test(trimmed)) return "today";
  if (/^расклад\s+на\s+неделю$/iu.test(trimmed)) return "week";
  if (/^расклад\s+на\s+год$/iu.test(trimmed)) return "year";
  return null;
}

export function periodSpreadPositions(scope: PeriodSpreadScope): readonly [string, string, string] {
  switch (scope) {
    case "today":
      return ["Утро / старт дня", "Сердце дня", "Итог дня"];
    case "week":
      return ["Начало недели", "Середина недели", "Конец недели"];
    case "year":
      return ["Первый квартал", "Середина года", "Итог года"];
  }
}

export function periodSpreadTaskLabel(scope: PeriodSpreadScope): string {
  switch (scope) {
    case "today":
      return "на СЕГОДНЯ";
    case "week":
      return "на эту НЕДЕЛЮ";
    case "year":
      return "на этот ГОД";
  }
}

export function drawPeriodSpread(characterId: string): {
  cards: SpreadSymbol[];
  system: DeckSystem;
} {
  const system = resolveMasterDeckSystem(characterId);
  return { cards: drawSpread(system, 3), system };
}
