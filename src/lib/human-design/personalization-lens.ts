/**
 * Memory + profile lens for HD reports — does not change chart calculations.
 */
import {
  appendMemoryContextToPrompt,
  buildMemoryContext,
} from "@/lib/memory/build-memory-context";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

export async function appendHdPersonalizationLens(
  extraSystem: string,
  params: {
    profileUserId: string;
    user?: {
      name?: string | null;
      gender?: string | null;
      life_focus?: string | null;
      main_question?: string | null;
    } | null;
    focusQuestion?: string | null;
  }
): Promise<string> {
  try {
    const displayName = normalizePersonDisplayName(params.user?.name) || params.user?.name || undefined;
    const memoryCtx = await buildMemoryContext({
      userId: params.profileUserId,
      characterId: "evelina",
      product: "hd",
      depth: "deep",
      profile: params.user
        ? {
            name: displayName,
            gender:
              params.user.gender === "male"
                ? "Мужской"
                : params.user.gender === "female"
                  ? "Женский"
                : undefined,
            lifeFocus: params.user.life_focus ?? undefined,
            mainQuestion: params.user.main_question ?? undefined,
          }
        : null,
      lastUserMessage:
        params.focusQuestion || params.user?.main_question || "разбор дизайна человека",
      mainQuestion: params.user?.main_question ?? undefined,
    });
    const withMemory = appendMemoryContextToPrompt(extraSystem, memoryCtx);
    return `${withMemory}

ЛИНЗА ПРОФИЛЯ (не источник фактов карты):
- lifeFocus / mainQuestion / факты памяти — только линза тона и акцентов.
- Связывай трактовку максимум с 1–2 активными релевантными фактами.
- Черновики не используй. Не упоминай память или статус факта в готовом тексте.
- Тип, стратегия, авторитет, центры, каналы и ворота — ТОЛЬКО из locked contract / evidence.
- Память не имеет права менять расчёт карты.`;
  } catch (err) {
    console.warn("HD personalization lens failed:", err);
    return extraSystem;
  }
}
