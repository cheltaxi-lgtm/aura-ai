import { ensureDb } from "@/lib/db";
import { getSessionMessagesForLlm, saveMessage } from "@/lib/session";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { recordTurn } from "@/lib/memory/client-memory";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import { polishNumerologClientReply } from "@/lib/numerology/numerolog-finale-client";
import {
  buildNumerologToolMessage,
  getNumerologTool,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import { generateNumerologStreamReply } from "@/lib/services/numerology-service";
import { tryNumerologEngineFallback } from "@/lib/services/numerology-service";

export interface RunNumerologToolInput {
  profileUserId: string;
  sessionId: string;
  toolId: NumerologToolId;
  params?: NumerologToolParams;
  spreadNumbers?: string[];
}

export interface RunNumerologToolResult {
  toolId: NumerologToolId;
  toolLabel: string;
  userMessage: string;
  reply: string;
  numerologyUi?: { pythagorasSquare?: import("@/lib/numerology/pythagoras-square").PythagorasSquareResult };
  primaryTopic: string;
}

function numerologToolHasUserAuthoredFacts(
  toolId: NumerologToolId,
  params?: NumerologToolParams
): boolean {
  if (toolId === "compatibility") {
    return Boolean(params?.partnerName?.trim() || params?.partnerDate?.trim());
  }
  if (toolId === "object_number") {
    return Boolean(params?.objectValue?.trim());
  }
  return false;
}

export async function runNumerologTool(
  input: RunNumerologToolInput
): Promise<RunNumerologToolResult> {
  const tool = getNumerologTool(input.toolId);
  const userMessage = buildNumerologToolMessage(input.toolId, input.params);
  const profileRow = await getUserById(input.profileUserId);
  const profile = profileRow ? serializeUserProfile(profileRow) : null;

  const recentUserMessages = (await ensureDb())
    ? (
        await getSessionMessagesForLlm(input.sessionId, "numerolog", 12)
      )
        .filter((m) => m.role === "user")
        .map((m) => m.content)
    : [];

  const memoryCtx = await buildMemoryContext({
    userId: input.profileUserId,
    characterId: "numerolog",
    sessionId: input.sessionId,
    profile: profile
      ? {
          name: profile.name,
          gender: profile.gender,
          zodiac: profile.zodiac,
          birthDate: profile.birthDate,
          mainQuestion: profile.mainQuestion,
          lifeFocus: profile.lifeFocus,
        }
      : null,
    lastUserMessage: userMessage,
    includePastSessions: true,
  });
  const memoryBlock = [
    memoryCtx.clientBlock,
    memoryCtx.pastSessionsBlock,
    memoryCtx.factsBlock,
    memoryCtx.pastSessionsBlock || memoryCtx.factsBlock
      ? `ПРИМЕНЕНИЕ ПАМЯТИ В РАСЧЁТЕ:
— Свяжи вывод максимум с 1–2 активными фактами или итогами прошлых сеансов, только если они
  напрямую относятся к выбранному расчёту.
— Обозначь траекторию: что число помогает понять в уже известной ситуации и какой следующий
  шаг из этого следует.
— Не используй черновики, не называй источник памятью и не позволяй контексту менять сам расчёт.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const engineParams = {
    characterId: "numerolog",
    userName: profile?.name,
    birthDate: profile?.birthDate,
    profileName: profile?.name,
    gender: profile?.gender ?? null,
    lastUserMessage: userMessage,
    recentUserMessages,
    spreadNumbers: input.spreadNumbers?.slice(0, 3) ?? [],
    memoryBlock: memoryBlock || undefined,
  };

  let reply = "";
  let numerologyUi = undefined as RunNumerologToolResult["numerologyUi"];

  const streamed = await generateNumerologStreamReply(engineParams);
  if (streamed) {
    reply = polishNumerologClientReply(streamed.reply);
    numerologyUi = streamed.numerologyUi;
  } else {
    const fallback = tryNumerologEngineFallback(engineParams);
    if (!fallback) {
      throw new Error("numerolog_tool_unhandled");
    }
    reply = fallback.reply;
    numerologyUi = fallback.numerologyUi;
  }

  if (await ensureDb()) {
    await saveMessage(input.sessionId, "numerolog", "user", userMessage, input.profileUserId);
    await saveMessage(input.sessionId, "numerolog", "assistant", reply, input.profileUserId);
    // Only enqueue when the tool carries real user-authored form data
    // (partner/object), not synthetic UI labels like "Разбери квадрат Пифагора".
    if (numerologToolHasUserAuthoredFacts(input.toolId, input.params)) {
      void recordTurn({
        userId: input.profileUserId,
        characterId: "numerolog",
        userMessage,
        assistantReply: reply,
        sourceType: "numerology",
        sourceEntityId: input.sessionId,
      });
    }
  }

  return {
    toolId: input.toolId,
    toolLabel: tool.label,
    userMessage,
    reply,
    numerologyUi,
    primaryTopic: tool.topic,
  };
}
