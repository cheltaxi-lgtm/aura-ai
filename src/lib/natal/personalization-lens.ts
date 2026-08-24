/**
 * Memory + profile lens for natal reports — does not include birth coords/dates
 * (those stay in chart evidence only).
 */
import {
  LIFE_FOCUS_OPTIONS,
  lifeFocusLabel,
  type LifeFocus,
} from "@/lib/astro-profile";
import {
  appendMemoryContextToPrompt,
  buildMemoryContext,
} from "@/lib/memory/build-memory-context";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  buildClientGenderInstruction,
  resolveClientGender,
} from "@/lib/russian-name-gender";

export type NatalForecastLensWindow = {
  horizonDays: number;
  windowStart: string;
  windowEnd: string;
};

export function buildNatalForecastMemoryQuery(params: {
  horizonDays: number;
  windowStart: string;
  windowEnd: string;
  lifeFocus?: string | null;
  mainQuestion?: string | null;
}): string {
  const focusId = params.lifeFocus as LifeFocus | undefined;
  const option = LIFE_FOCUS_OPTIONS.find((item) => item.id === focusId);
  const focusText = option
    ? `${option.label} ${option.hint}`
    : lifeFocusLabel(focusId) ?? "";
  const question = (params.mainQuestion ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  return [
    `прогноз на ${params.horizonDays} дней`,
    params.windowStart.trim(),
    params.windowEnd.trim(),
    "текущий период события планы цели",
    focusText,
    question,
  ]
    .filter((part) => part.trim())
    .join(" ");
}

export async function appendNatalPersonalizationLens(
  systemPrompt: string,
  params: {
    profileUserId: string;
    user?: {
      name?: string | null;
      gender?: string | null;
      zodiac?: string | null;
      life_focus?: string | null;
      main_question?: string | null;
    } | null;
    forecast?: NatalForecastLensWindow | null;
  }
): Promise<string> {
  try {
    const displayName = normalizePersonDisplayName(params.user?.name) || params.user?.name || undefined;
    const firstName = (displayName ?? "").trim().split(/\s+/)[0] || "друг";
    const gender = resolveClientGender(params.user?.gender, firstName);
    const isForecast = Boolean(params.forecast);
    const forecastQuery = params.forecast
      ? buildNatalForecastMemoryQuery({
          horizonDays: params.forecast.horizonDays,
          windowStart: params.forecast.windowStart,
          windowEnd: params.forecast.windowEnd,
          lifeFocus: params.user?.life_focus,
          mainQuestion: params.user?.main_question,
        })
      : "";
    const memoryCtx = await buildMemoryContext({
      userId: params.profileUserId,
      characterId: "shri-raj",
      product: "natal",
      depth: isForecast ? "standard" : "deep",
      includePastSessions: !isForecast,
      upcomingWithinDays: params.forecast?.horizonDays,
      profile: params.user
        ? {
            name: displayName,
            gender:
              params.user.gender === "male"
                ? "Мужской"
                : params.user.gender === "female"
                  ? "Женский"
                : undefined,
            zodiac: params.user.zodiac,
            lifeFocus: params.user.life_focus ?? undefined,
            mainQuestion: params.user.main_question ?? undefined,
          }
        : null,
      lastUserMessage: isForecast
        ? forecastQuery
        : params.user?.main_question || "натальная трактовка",
      mainQuestion: isForecast ? undefined : params.user?.main_question ?? undefined,
    });

    const withMemory = appendMemoryContextToPrompt(systemPrompt, memoryCtx);
    const forecastRules = params.forecast
      ? `
- Для прогноза бери из памяти только факты в окне ${params.forecast.windowStart} — ${params.forecast.windowEnd} или текущее состояние/цели.
- Даты из памяти не подменяют timing evidence: конкретные даты называй только из блока EVIDENCE.`
      : "";
    return `${withMemory}

${buildClientGenderInstruction({ gender, firstName })}

ЛИНЗА ПРОФИЛЯ (не источник фактов карты):
- lifeFocus / mainQuestion / факты памяти — только линза тона и акцентов.
- Связывай трактовку максимум с 1–2 активными релевантными фактами: явно покажи, какое
  наблюдение карты они помогают применить к текущей жизненной траектории.
- Черновики не используй. Не упоминай память или статус факта в готовом тексте.
- Положения планет, дома, даты и evidence ID — ТОЛЬКО из блока EVIDENCE ниже.
- Не повторяй координаты или дату рождения из памяти — их нет в этом промпте намеренно.${forecastRules}`;
  } catch (err) {
    console.warn("Natal personalization lens failed:", err);
    return systemPrompt;
  }
}
