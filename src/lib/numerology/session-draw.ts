import { resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import { drawUniformSpread, resolveSpreadSymbols } from "@/lib/intention-draw";
import { lifePathNumber, numberOfString, personalYear } from "./calculator";
import { parseBirthDate } from "./constants";
import { personalYearForecast } from "./forecast";
import {
  getNumerologTool,
  type NumerologToolId,
  type NumerologToolParams,
} from "./tools";

/** Deterministic spread numbers from profile/form — not random deck draws. */
export function resolveNumerologSpreadCardNames(
  toolId: NumerologToolId,
  birthDate?: string | null,
  params?: NumerologToolParams
): string[] | null {
  const tool = getNumerologTool(toolId);
  if (tool.drawCount === 0) return [];

  const parsedBirth = parseBirthDate(birthDate ?? "");

  switch (toolId) {
    case "personal_year": {
      if (!parsedBirth) return null;
      return [String(personalYear(birthDate!).number)];
    }
    case "forecast_9y": {
      if (!parsedBirth) return null;
      const startYear = new Date().getFullYear();
      return personalYearForecast(birthDate!, startYear, 9)
        .map((entry) => String(entry.number))
        .slice(0, 9);
    }
    case "object_number": {
      const value = params?.objectValue?.trim();
      if (!value) return null;
      return [String(numberOfString(value).number)];
    }
    case "compatibility": {
      const partnerDate = params?.partnerDate?.trim() ?? "";
      if (!parsedBirth || !parseBirthDate(partnerDate)) return null;
      return [
        String(lifePathNumber(birthDate!).number),
        String(lifePathNumber(partnerDate).number),
      ];
    }
    default:
      return null;
  }
}

/** Draw session spread: computed numbers when possible, otherwise uniform random from deck. */
export function drawNumerologSessionSpread(
  toolId: NumerologToolId,
  options?: {
    birthDate?: string | null;
    params?: NumerologToolParams;
    deckSystem?: DeckSystem;
  }
): SpreadSymbol[] {
  const tool = getNumerologTool(toolId);
  const system = options?.deckSystem ?? resolveMasterDeckSystem("numerolog");

  if (tool.drawCount === 0) return [];

  const computed = resolveNumerologSpreadCardNames(
    toolId,
    options?.birthDate,
    options?.params
  );

  if (computed && computed.length >= tool.drawCount) {
    const fromDeck = resolveSpreadSymbols(system, computed.slice(0, tool.drawCount));
    if (fromDeck.length >= tool.drawCount) return fromDeck.slice(0, tool.drawCount);
    return computed.slice(0, tool.drawCount).map((name, i) => ({
      id: i,
      name,
      kind: "numerology" as const,
      meaning: name,
    }));
  }

  return drawUniformSpread(system, tool.drawCount);
}
