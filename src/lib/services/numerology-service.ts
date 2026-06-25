import { buildNumerologSpreadReading } from "@/lib/numerolog/welcome";
import { buildNumerologEngineReply, buildRichEngineFacts } from "@/lib/numerology/engine-reply";
import {
  appendNumerologFinale,
  generateNumerologFinale,
  generateNumerologMainReading,
} from "@/lib/numerology/numerolog-finalize";
import { buildNumerologyChatContext } from "@/lib/numerology/topic-handlers";
import type { PythagorasSquareResult } from "@/lib/numerology/pythagoras-square";

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
      params.spreadNumbers.length >= 3 ? params.spreadNumbers : undefined,
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
    reply: engineResult.reply,
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

  const numerologyCtx = buildNumerologyChatContext({
    birthDate: input.birthDate,
    profileName: input.fullName ?? input.userName,
    lastUserMessage: "draw_three_numbers",
  });

  const engineFacts =
    buildRichEngineFacts({
      prompt: numerologyCtx.prompt,
      primaryTopic: "personal_cycle",
      userMessage: "Три числа текущего периода",
      fallbackFacts: mathSummary,
    }) || mathSummary;

  const [analysis, finale] = await Promise.all([
    generateNumerologMainReading({
      name: firstName,
      topic: "spread_opening",
      userMessage: "draw_three_numbers",
      engineFacts,
      fallback: mathSummary,
    }),
    generateNumerologFinale({
      name: firstName,
      topic: "spread_opening",
      engineFacts,
    }),
  ]);

  const body =
    analysis.trim() === mathSummary.trim()
      ? mathSummary
      : `${mathSummary.trim()}\n\n${analysis.trim()}`;

  return appendNumerologFinale(body, finale);
}
