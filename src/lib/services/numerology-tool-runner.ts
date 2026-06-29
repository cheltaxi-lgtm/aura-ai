import { ensureDb } from "@/lib/db";
import { getSessionMessagesForLlm, saveMessage } from "@/lib/session";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { loadClientMemoryBlock, recordTurn } from "@/lib/memory/client-memory";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";
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

  const memoryBlock = await loadClientMemoryBlock({
    userId: input.profileUserId,
    queryText: composeMemoryQueryText({ lastUserMessage: userMessage }),
  });

  const engineParams = {
    characterId: "numerolog",
    userName: profile?.name,
    birthDate: profile?.birthDate,
    profileName: profile?.name,
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
    void recordTurn({
      userId: input.profileUserId,
      characterId: "numerolog",
      userMessage,
      assistantReply: reply,
    });
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
