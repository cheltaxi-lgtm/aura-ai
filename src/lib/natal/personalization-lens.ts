/**
 * Memory + profile lens for natal reports — does not include birth coords/dates
 * (those stay in chart evidence only).
 */
import {
  appendMemoryContextToPrompt,
  buildMemoryContext,
} from "@/lib/memory/build-memory-context";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  buildClientGenderInstruction,
  resolveClientGender,
} from "@/lib/russian-name-gender";

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
  }
): Promise<string> {
  try {
    const displayName = normalizePersonDisplayName(params.user?.name) || params.user?.name || undefined;
    const firstName = (displayName ?? "").trim().split(/\s+/)[0] || "друг";
    const gender = resolveClientGender(params.user?.gender, firstName);
    const memoryCtx = await buildMemoryContext({
      userId: params.profileUserId,
      characterId: "shri-raj",
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
      lastUserMessage: params.user?.main_question || "натальная трактовка",
      mainQuestion: params.user?.main_question ?? undefined,
    });

    const withMemory = appendMemoryContextToPrompt(systemPrompt, memoryCtx);
    return `${withMemory}

${buildClientGenderInstruction({ gender, firstName })}

ЛИНЗА ПРОФИЛЯ (не источник фактов карты):
- lifeFocus / mainQuestion / факты памяти — только линза тона и акцентов.
- Связывай трактовку максимум с 1–2 активными релевантными фактами: явно покажи, какое
  наблюдение карты они помогают применить к текущей жизненной траектории.
- Черновики не используй. Не упоминай память или статус факта в готовом тексте.
- Положения планет, дома, даты и evidence ID — ТОЛЬКО из блока EVIDENCE ниже.
- Не повторяй координаты или дату рождения из памяти — их нет в этом промпте намеренно.`;
  } catch (err) {
    console.warn("Natal personalization lens failed:", err);
    return systemPrompt;
  }
}
