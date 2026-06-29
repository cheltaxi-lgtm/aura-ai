import { resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import { drawUniformSpread, resolveSpreadSymbols } from "@/lib/intention-draw";
import {
  birthdayNumber,
  destinyNumber,
  karmicDebts,
  karmicLessons,
  lifePathNumber,
  maturityNumber,
  numberOfString,
  personalYear,
  personalityNumber,
  soulNumber,
} from "./calculator";
import { parseBirthDate } from "./constants";
import { favorableDates } from "./favorable-dates";
import { personalYearForecast } from "./forecast";
import {
  getNumerologTool,
  type NumerologToolId,
  type NumerologToolParams,
} from "./tools";

/** Tools that must be computed from profile — never random deck draw. */
const COMPUTED_ONLY_TOOLS = new Set<NumerologToolId>([
  "personal_year",
  "forecast_9y",
  "compatibility",
  "object_number",
  "chaldean",
  "karma",
  "favorable_dates",
  "spread_three_numbers",
]);

/** Deterministic spread numbers from profile/form — not random deck draws. */
export function resolveNumerologSpreadCardNames(
  toolId: NumerologToolId,
  birthDate?: string | null,
  params?: NumerologToolParams,
  fullName?: string | null
): string[] | null {
  const tool = getNumerologTool(toolId);
  if (tool.drawCount === 0) return [];

  const parsedBirth = parseBirthDate(birthDate ?? "");
  const name = fullName?.trim() ?? "";

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
    case "spread_three_numbers": {
      if (!parsedBirth) return null;
      return [
        String(lifePathNumber(birthDate!).number),
        String(personalYear(birthDate!).number),
        String(birthdayNumber(birthDate!).number),
      ];
    }
    case "chaldean": {
      if (!name) return null;
      return [
        String(soulNumber(name, "chaldean").number),
        String(personalityNumber(name, "chaldean").number),
        String(destinyNumber(name, "chaldean").number),
      ];
    }
    case "karma": {
      if (!parsedBirth && !name) return null;
      const debts = parsedBirth || name ? karmicDebts(birthDate ?? "", name) : [];
      const lessons = name ? karmicLessons(name, "pythagorean") : [];
      const lp = parsedBirth ? lifePathNumber(birthDate!) : null;
      const dest = name ? destinyNumber(name) : null;
      const mat =
        lp && dest && lp.number > 0 && dest.number > 0
          ? maturityNumber(lp, dest)
          : null;
      const lesson = lessons[0] ?? lp?.number ?? 0;
      const debt = debts[0] ?? lessons[1] ?? birthdayNumber(birthDate ?? "").number;
      const healing = mat?.number ?? personalYear(birthDate ?? "").number;
      if (lesson <= 0 && debt <= 0 && healing <= 0) return null;
      return [String(lesson || 1), String(debt || 2), String(healing || 3)];
    }
    case "favorable_dates": {
      if (!parsedBirth) return null;
      const fav = favorableDates(birthDate!);
      if (!fav) return null;
      const best = fav.favorable[0] ?? fav.neutral[0];
      const window = fav.favorable[Math.min(2, fav.favorable.length - 1)] ?? fav.neutral[1];
      const caution = fav.caution[0] ?? fav.neutral[fav.neutral.length - 1];
      if (best == null || window == null || caution == null) return null;
      return [String(best), String(window), String(caution)];
    }
    default:
      return null;
  }
}

function forecastSpreadSymbols(birthDate: string, tool: { drawCount: number }): SpreadSymbol[] {
  const startYear = new Date().getFullYear();
  const forecast = personalYearForecast(birthDate, startYear, 9);
  return forecast.slice(0, tool.drawCount).map((entry, i) => ({
    id: i,
    name: String(entry.number),
    kind: "numerology" as const,
    meaning: `${entry.year} · личный год ${entry.number}`,
  }));
}

/** Draw session spread: computed numbers when possible, otherwise uniform random from deck. */
export function drawNumerologSessionSpread(
  toolId: NumerologToolId,
  options?: {
    birthDate?: string | null;
    fullName?: string | null;
    params?: NumerologToolParams;
    deckSystem?: DeckSystem;
  }
): SpreadSymbol[] {
  const tool = getNumerologTool(toolId);
  const system = options?.deckSystem ?? resolveMasterDeckSystem("numerolog");

  if (tool.drawCount === 0) return [];

  if (toolId === "forecast_9y" && parseBirthDate(options?.birthDate ?? "")) {
    return forecastSpreadSymbols(options!.birthDate!, tool);
  }

  const computed = resolveNumerologSpreadCardNames(
    toolId,
    options?.birthDate,
    options?.params,
    options?.fullName
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

  if (COMPUTED_ONLY_TOOLS.has(toolId)) return [];

  return drawUniformSpread(system, tool.drawCount);
}
