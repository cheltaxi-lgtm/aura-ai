import { drawSpread, resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import { currentYearMsk, monthLabelRu } from "@/lib/prompt-date";

export const MASTER_QUICK_CHIP_MASTERS = [
  "ragnar",
  "veronika",
  "agafya",
  "shri-raj",
] as const;

export type MasterQuickChipMasterId = (typeof MASTER_QUICK_CHIP_MASTERS)[number];

export type PeriodSpreadScope = "today" | "week" | "month";

export const MASTER_PERIOD_CHIP_MESSAGES: Record<PeriodSpreadScope, string> = {
  today: "Расклад на сегодня",
  week: "Расклад на неделю",
  month: "Расклад на месяц",
};

export function hasMasterQuickChips(masterId: string | null | undefined): masterId is MasterQuickChipMasterId {
  if (!masterId) return false;
  return (MASTER_QUICK_CHIP_MASTERS as readonly string[]).includes(masterId);
}

export function detectPeriodSpreadScope(message: string): PeriodSpreadScope | null {
  const trimmed = message.trim();
  if (/^расклад\s+на\s+сегодня$/iu.test(trimmed)) return "today";
  if (/^расклад\s+на\s+неделю$/iu.test(trimmed)) return "week";
  if (/^расклад\s+на\s+месяц$/iu.test(trimmed)) return "month";
  return null;
}

export function periodSpreadPositions(scope: PeriodSpreadScope): readonly [string, string, string] {
  switch (scope) {
    case "today":
      return ["Утро / старт дня", "Сердце дня", "Итог дня"];
    case "week":
      return ["Начало недели", "Середина недели", "Конец недели"];
    case "month":
      return ["Начало месяца", "Середина месяца", "Итог месяца"];
  }
}

export function periodSpreadTaskLabel(scope: PeriodSpreadScope): string {
  switch (scope) {
    case "today":
      return "на СЕГОДНЯ";
    case "week":
      return "на эту НЕДЕЛЮ (считая от сегодняшней даты)";
    case "month":
      return `на этот МЕСЯЦ (${monthLabelRu()} ${currentYearMsk()})`;
  }
}

export function drawPeriodSpread(characterId: string): {
  cards: SpreadSymbol[];
  system: DeckSystem;
} {
  const system = resolveMasterDeckSystem(characterId);
  return { cards: drawSpread(system, 3), system };
}
