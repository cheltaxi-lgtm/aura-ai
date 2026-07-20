import { buildNumerologSpreadReading, buildSpreadOpeningFinale } from "@/lib/numerolog/welcome";
import { buildNumerologEngineReply, buildRichEngineFacts } from "@/lib/numerology/engine-reply";
import {
  appendNumerologFinale,
  generateNumerologFinale,
  generateNumerologMainReading,
} from "@/lib/numerology/numerolog-finalize";
import {
  deniesHavingSpreadNumbers,
  polishNumerologClientReply,
  spreadFinaleMatchesNumbers,
} from "@/lib/numerology/numerolog-finale-client";
import { buildNumerologyChatContext } from "@/lib/numerology/topic-handlers";
import type { PythagorasSquareResult } from "@/lib/numerology/pythagoras-square";
import {
  buildNumerologToolMessage,
  getNumerologTool,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";

export type NumerologyUi = {
  pythagorasSquare?: PythagorasSquareResult;
};

export interface NumerologyPromptContext {
  numerologyBlock?: string;
  numerologyUi?: NumerologyUi;
}

export interface NumerologEngineParams {
  characterId: string;
  imageBase64?: string;
  userName?: string;
  birthDate?: string;
  profileName?: string;
  lastUserMessage: string;
  recentUserMessages: string[];
  spreadNumbers: string[];
  memoryBlock?: string;
}

function buildEngineInput(params: NumerologEngineParams) {
  return {
    userName: params.userName,
    birthDate: params.birthDate,
    profileName: params.profileName,
    lastUserMessage: params.lastUserMessage,
    recentUserMessages: params.recentUserMessages,
    spreadNumbers:
      params.spreadNumbers.length > 0 ? params.spreadNumbers : undefined,
  };
}

/** Build numerology prompt block and optional UI payload for the LLM path. */
export function buildNumerologyPromptContext(params: {
  characterId: string;
  birthDate?: string;
  profileName?: string;
  lastUserMessage: string;
}): NumerologyPromptContext {
  if (params.characterId !== "numerolog") {
    return {};
  }

  const numerologyCtx = buildNumerologyChatContext({
    birthDate: params.birthDate,
    profileName: params.profileName,
    lastUserMessage: params.lastUserMessage,
  });

  return {
    numerologyBlock: numerologyCtx.prompt,
    numerologyUi: numerologyCtx.ui?.pythagorasSquare
      ? { pythagorasSquare: numerologyCtx.ui.pythagorasSquare }
      : undefined,
  };
}

/** Fast engine-only fallback when LLM fails (no main reading / finale generation). */
export function tryNumerologEngineFallback(
  params: NumerologEngineParams
): { reply: string; numerologyUi?: NumerologyUi } | null {
  if (params.characterId !== "numerolog" || params.imageBase64) {
    return null;
  }

  const engineResult = buildNumerologEngineReply(buildEngineInput(params));
  if (!engineResult) {
    return null;
  }

  return {
    reply: polishNumerologClientReply(engineResult.reply),
    numerologyUi: engineResult.ui?.pythagorasSquare
      ? { pythagorasSquare: engineResult.ui.pythagorasSquare }
      : undefined,
  };
}

/**
 * Full numerology engine path: deterministic engine + LLM main reading + finale.
 * Returns null when the engine cannot handle the request (falls through to generic LLM).
 */
export async function generateNumerologStreamReply(
  params: NumerologEngineParams
): Promise<{ reply: string; numerologyUi?: NumerologyUi } | null> {
  if (params.characterId !== "numerolog" || params.imageBase64) {
    return null;
  }

  const engineResult = buildNumerologEngineReply(buildEngineInput(params));
  if (!engineResult) {
    return null;
  }

  const numerologyUi = engineResult.ui?.pythagorasSquare
    ? { pythagorasSquare: engineResult.ui.pythagorasSquare }
    : undefined;

  const firstName =
    (params.userName || params.profileName || "друг").trim().split(/\s+/)[0] || "друг";

  const engineFactsRaw =
    buildRichEngineFacts({
      prompt: buildNumerologyChatContext({
        birthDate: params.birthDate,
        profileName: params.profileName ?? params.userName,
        lastUserMessage: params.lastUserMessage,
      }).prompt,
      primaryTopic: engineResult.primaryTopic,
      userMessage: params.lastUserMessage,
      fallbackFacts: engineResult.engineFacts || engineResult.reply.slice(0, 2000),
    }) || engineResult.reply.slice(0, 2000);
  const engineFacts = params.memoryBlock?.trim()
    ? `${params.memoryBlock.trim()}\n\n${engineFactsRaw}`
    : engineFactsRaw;
  const fallback = engineResult.reply;

  const [engineBody, finale] = await Promise.all([
    generateNumerologMainReading({
      name: firstName,
      topic: engineResult.primaryTopic,
      userMessage: params.lastUserMessage,
      engineFacts,
      fallback,
    }),
    generateNumerologFinale({
      name: firstName,
      topic: engineResult.primaryTopic,
      engineFacts,
    }),
  ]);

  return {
    reply: appendNumerologFinale(engineBody, finale),
    numerologyUi,
  };
}

/**
 * Opening spread «Три числа»: math summary + LLM analysis + «Простыми словами».
 * Used by POST /api/reading for numerolog master.
 */
export async function generateNumerologSpreadOpeningReading(input: {
  userName: string;
  birthDate?: string;
  fullName?: string;
  spreadNumbers: string[];
  memoryBlock?: string;
}): Promise<string> {
  const spreadNumbers = input.spreadNumbers.slice(0, 3);
  const mathSummary = buildNumerologSpreadReading({
    userName: input.userName,
    birthDate: input.birthDate,
    fullName: input.fullName,
    spreadNumbers,
  });

  const firstName =
    (input.userName || input.fullName || "друг").trim().split(/\s+/)[0] || "друг";

  // Authoritative facts: drawn spread + path/year context. Profile-only blocks (destiny/soul)
  // must not replace this — the model then asks for numbers or invents wrong ones in «Простыми словами».
  const engineFacts = input.memoryBlock?.trim()
    ? `${input.memoryBlock.trim()}\n\n${mathSummary}`
    : mathSummary;

  const [analysisRaw, finaleRaw] = await Promise.all([
    generateNumerologMainReading({
      name: firstName,
      topic: "spread_opening",
      userMessage: "Три числа текущего периода",
      engineFacts,
      fallback: mathSummary,
    }),
    generateNumerologFinale({
      name: firstName,
      topic: "spread_opening",
      engineFacts,
    }),
  ]);

  const analysis =
    deniesHavingSpreadNumbers(analysisRaw) || analysisRaw.trim() === mathSummary.trim()
      ? ""
      : analysisRaw.trim();

  const finale = spreadFinaleMatchesNumbers(finaleRaw, spreadNumbers)
    ? finaleRaw
    : buildSpreadOpeningFinale(firstName, spreadNumbers);

  const body = analysis ? `${mathSummary.trim()}\n\n${analysis}` : mathSummary;

  return appendNumerologFinale(body, finale);
}

/** Session spread reading for any numerology calculation chosen in MasterSessionFlow. */
export async function generateNumerologSessionReading(input: {
  toolId: NumerologToolId;
  toolParams?: NumerologToolParams;
  userName: string;
  birthDate?: string;
  fullName?: string;
  spreadNumbers: string[];
  memoryBlock?: string;
}): Promise<{ reply: string; numerologyUi?: NumerologyUi }> {
  const tool = getNumerologTool(input.toolId);
  const spreadNumbers = input.spreadNumbers.slice(0, tool.drawCount);

  if (input.toolId === "spread_three_numbers" && spreadNumbers.length >= 3) {
    return {
      reply: await generateNumerologSpreadOpeningReading({
        userName: input.userName,
        birthDate: input.birthDate,
        fullName: input.fullName,
        spreadNumbers,
        memoryBlock: input.memoryBlock,
      }),
    };
  }

  const message = buildNumerologToolMessage(input.toolId, input.toolParams);
  const streamed = await generateNumerologStreamReply({
    characterId: "numerolog",
    userName: input.userName,
    birthDate: input.birthDate,
    profileName: input.fullName ?? input.userName,
    lastUserMessage: message,
    recentUserMessages: [],
    spreadNumbers,
    memoryBlock: input.memoryBlock,
  });

  if (streamed) {
    return streamed;
  }

  const fallback = tryNumerologEngineFallback({
    characterId: "numerolog",
    userName: input.userName,
    birthDate: input.birthDate,
    profileName: input.fullName ?? input.userName,
    lastUserMessage: message,
    recentUserMessages: [],
    spreadNumbers,
    memoryBlock: input.memoryBlock,
  });

  if (!fallback) {
    throw new Error("numerolog_session_reading_failed");
  }

  return fallback;
}
