import { buildNumerologSpreadReading, buildSpreadOpeningFinale } from "@/lib/numerolog/welcome";
import { destinyMatrix } from "@/lib/numerology/destiny-matrix";
import { buildNumerologEngineReply, buildRichEngineFacts } from "@/lib/numerology/engine-reply";
import {
  buildMatrixNatalBridgeFacts,
  natalBridgeInputFromChart,
  natalBridgeInputFromProfile,
} from "@/lib/numerology/matrix-natal-bridge";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";
import { buildMatrixPlainFinale } from "@/lib/numerology/matrix-point-prompt";
import {
  generateFullMatrixSectionedReading,
  isMatrixQualityCanaryError,
} from "@/lib/numerology/matrix-sectioned-reading";
import type { MatrixReadingDocument } from "@/lib/numerology/matrix-reading-document";
import { isUsableMatrixReading, sanitizeReadingForClient } from "@/lib/chat-reply-sanitize";
import { isCompleteMatrixReading } from "@/lib/numerology/matrix-completeness";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
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
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

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
  /** Profile gender male|female — grammar for address. */
  gender?: string | null;
  lastUserMessage: string;
  recentUserMessages: string[];
  spreadNumbers: string[];
  memoryBlock?: string;
  /** Session topic (SessionTopicId) for calc seeding. */
  intention?: string | null;
  birthTime?: string | null;
  birthCity?: string | null;
  /** When set, matrix paid path can load natal chart snapshot for «Небо». */
  userId?: string | null;
  toolId?: NumerologToolId;
  /** Matrix subject kind — when not self, prose addresses the buyer about this person. */
  subjectKind?: "self" | "child" | "partner" | "other" | null;
  /** Display name of the person whose matrix is calculated (when ≠ buyer). */
  subjectName?: string | null;
  /** Frozen guest/report as-of day for period-dependent Matrix zones. */
  asOfDate?: string | null;
}

/** Keep only matrix-safe memory lines (drop Pythagorean / life-path leaks). */
function filterMatrixSafeMemory(block: string): string {
  return block
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !/жизненн\w*\s+пут|число\s+пути|душ[аы]\b|личност|пифагор|психоматриц|квадрат\s+пифагора|зрелост/i.test(
        t
      );
    })
    .join("\n")
    .trim();
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
    intention: params.intention,
  };
}

/** Build numerology prompt block and optional UI payload for the LLM path. */
export function buildNumerologyPromptContext(params: {
  characterId: string;
  birthDate?: string;
  profileName?: string;
  gender?: string | null;
  lastUserMessage: string;
  intention?: string | null;
}): NumerologyPromptContext {
  if (params.characterId !== "numerolog") {
    return {};
  }

  const numerologyCtx = buildNumerologyChatContext({
    birthDate: params.birthDate,
    profileName: params.profileName,
    gender: params.gender,
    lastUserMessage: params.lastUserMessage,
    intention: params.intention,
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
  params: NumerologEngineParams & {
    /** Paid session readings must not ship engine stubs as «AI» success. */
    allowEngineFallback?: boolean;
    onMatrixProgress?: (progress: {
      done: number;
      total: number;
      label: string;
      message: string;
    }) => void | Promise<void>;
  }
): Promise<{
  reply: string;
  numerologyUi?: NumerologyUi;
  matrixDocument?: MatrixReadingDocument;
} | null> {
  if (params.characterId !== "numerolog" || params.imageBase64) {
    return null;
  }
  const allowEngineFallback = params.allowEngineFallback !== false;

  const engineResult = buildNumerologEngineReply(buildEngineInput(params));
  if (!engineResult) {
    return null;
  }

  const numerologyUi = engineResult.ui?.pythagorasSquare
    ? { pythagorasSquare: engineResult.ui.pythagorasSquare }
    : undefined;

  const firstName =
    normalizePersonDisplayName(params.userName || params.profileName) ||
    (params.userName || params.profileName || "друг").trim().split(/\s+/)[0] ||
    "друг";

  const engineFactsRaw =
    buildRichEngineFacts({
      prompt: buildNumerologyChatContext({
        birthDate: params.birthDate,
        profileName: params.profileName ?? params.userName,
        gender: params.gender,
        lastUserMessage: params.lastUserMessage,
        intention: params.intention,
      }).prompt,
      primaryTopic: engineResult.primaryTopic,
      userMessage: params.lastUserMessage,
      fallbackFacts: engineResult.engineFacts || engineResult.reply.slice(0, 2000),
    }) || engineResult.reply.slice(0, 2000);
  // Matrix: allow narrow memory (filtered) + optional natal bridge. Never raw Pythagorean LP.
  let engineFacts = engineFactsRaw;
  if (engineResult.primaryTopic === "destiny_matrix") {
    const safeMem = params.memoryBlock?.trim()
      ? filterMatrixSafeMemory(params.memoryBlock)
      : "";
    if (safeMem) engineFacts = `${safeMem}\n\n${engineFacts}`;
    if (params.birthDate) {
      const asOf =
        typeof params.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)
          ? params.asOfDate
          : undefined;
      const matrix = destinyMatrix(params.birthDate, asOf ? { asOfDate: asOf } : undefined);
      if (matrix) {
        let natalInput = natalBridgeInputFromProfile({
          birthDate: params.birthDate,
          birthTime: params.birthTime,
          birthCity: params.birthCity,
        });
        if (params.userId && natalInput.hasBirthTime && natalInput.hasBirthCity) {
          try {
            const chart = await getOrComputeNatalChart(params.userId);
            natalInput = natalBridgeInputFromChart(chart, {
              birthDate: params.birthDate,
              birthTime: params.birthTime,
              birthCity: params.birthCity,
            });
          } catch {
            /* keep approximate sun from profile */
          }
        }
        const bridge = buildMatrixNatalBridgeFacts(matrix, natalInput);
        if (bridge.available && bridge.lines.length) {
          engineFacts = `${engineFacts}\n\n${bridge.lines.join("\n")}`;
        } else if (bridge.cta) {
          engineFacts = `${engineFacts}\n\nНЕБО (недоступно): ${bridge.cta}`;
        }
      }
    }
  } else if (params.memoryBlock?.trim()) {
    engineFacts = `${params.memoryBlock.trim()}\n\n${engineFactsRaw}`;
  }
  const fallback = engineResult.reply;

  // Paid/full matrix: zone assembly (never one monolithic LLM blob).
  if (
    engineResult.primaryTopic === "destiny_matrix" &&
    params.birthDate &&
    (params.toolId === "destiny_matrix" || params.toolId === "child_matrix")
  ) {
    try {
      const sectioned = await generateFullMatrixSectionedReading({
        birthDate: params.birthDate,
        name: firstName,
        toolId: params.toolId,
        gender: params.gender,
        subjectKind: params.subjectKind,
        subjectName: params.subjectName,
        asOfDate: params.asOfDate,
        // Natal bridge + filtered memory — previously built then discarded.
        contextFacts: engineFacts,
        useLlm: "all",
        onProgress: params.onMatrixProgress,
      });
      // Sanitize may truncate at checklist markers; never let that fail a
      // complete sectioned report (paid path would refund + spin forever).
      const sanitized = sanitizeReadingForClient(sectioned.reading);
      const rawComplete = isCompleteMatrixReading(
        sectioned.reading,
        params.toolId
      );
      const sanitizedComplete =
        Boolean(sanitized) &&
        isCompleteMatrixReading(sanitized, params.toolId);
      const safe = sanitizedComplete
        ? sanitized
        : rawComplete
          ? sectioned.reading
          : sanitized || sectioned.reading;
      if (!isCompleteMatrixReading(safe, params.toolId) && !allowEngineFallback) {
        // Sectioned path force-fills; if still unusable, fail paid path.
        const { matrixMissingSections } = await import(
          "@/lib/numerology/matrix-completeness"
        );
        console.error("[numerolog] sectioned matrix failed completeness gate", {
          rawLen: sectioned.reading.length,
          safeLen: safe.length,
          sanitizedLen: sanitized?.length ?? 0,
          rawComplete,
          sanitizedComplete,
          meta: sectioned.meta,
          missing: matrixMissingSections(safe, params.toolId),
        });
        return null;
      }
      if (!safe.trim()) return null;
      return {
        reply: safe,
        numerologyUi,
        matrixDocument: sectioned.document,
      };
    } catch (err) {
      if (isMatrixQualityCanaryError(err)) {
        console.error("[numerolog] matrix AI canary failed — refuse paid delivery", err.meta);
        // Paid path: never fall through to dictionary prose as a billed success.
        if (!allowEngineFallback) throw err;
        return null;
      }
      console.error("[numerolog] sectioned matrix error", err);
      if (!allowEngineFallback) return null;
    }
  }

  const matrixForFinale =
    engineResult.primaryTopic === "destiny_matrix" && params.birthDate
      ? destinyMatrix(
          params.birthDate,
          typeof params.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)
            ? { asOfDate: params.asOfDate }
            : undefined
        )
      : null;

  const [engineBody, finale] = await Promise.all([
    generateNumerologMainReading({
      name: firstName,
      topic: engineResult.primaryTopic,
      userMessage: params.lastUserMessage,
      engineFacts,
      fallback,
      gender: params.gender,
      // Chat chips may use engine; paid session path opts out.
      allowEngineFallback,
    }),
    matrixForFinale
      ? Promise.resolve(buildMatrixPlainFinale(firstName, matrixForFinale))
      : generateNumerologFinale({
          name: firstName,
          topic: engineResult.primaryTopic,
          engineFacts,
          gender: params.gender,
        }),
  ]);

  if (!engineBody?.trim()) {
    return null;
  }

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
  gender?: string | null;
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
      gender: input.gender,
      allowEngineFallback: false,
    }),
    generateNumerologFinale({
      name: firstName,
      topic: "spread_opening",
      engineFacts,
      gender: input.gender,
    }),
  ]);

  if (
    !analysisRaw?.trim() ||
    deniesHavingSpreadNumbers(analysisRaw) ||
    analysisRaw.trim() === mathSummary.trim()
  ) {
    throw new Error("numerolog_spread_ai_failed");
  }

  const analysis = analysisRaw.trim();
  const finale = spreadFinaleMatchesNumbers(finaleRaw, spreadNumbers)
    ? finaleRaw
    : buildSpreadOpeningFinale(firstName, spreadNumbers);

  const body = `${mathSummary.trim()}\n\n${analysis}`;
  return appendNumerologFinale(body, finale);
}

/** Session spread reading for any numerology calculation chosen in MasterSessionFlow. */
export async function generateNumerologSessionReading(input: {
  toolId: NumerologToolId;
  toolParams?: NumerologToolParams;
  userName: string;
  birthDate?: string;
  fullName?: string;
  gender?: string | null;
  spreadNumbers: string[];
  memoryBlock?: string;
  birthTime?: string | null;
  birthCity?: string | null;
  userId?: string | null;
  subjectKind?: "self" | "child" | "partner" | "other" | null;
  subjectName?: string | null;
  /** Guest→auth freeze; period zones must match guest snapshot on first open. */
  asOfDate?: string | null;
  onMatrixProgress?: (progress: {
    done: number;
    total: number;
    label: string;
    message: string;
  }) => void | Promise<void>;
}): Promise<{
  reply: string;
  numerologyUi?: NumerologyUi;
  matrixDocument?: MatrixReadingDocument;
}> {
  const tool = getNumerologTool(input.toolId);
  const spreadNumbers = input.spreadNumbers.slice(0, tool.drawCount);

  if (input.toolId === "spread_three_numbers" && spreadNumbers.length >= 3) {
    return {
      reply: await generateNumerologSpreadOpeningReading({
        userName: input.userName,
        birthDate: input.birthDate,
        fullName: input.fullName,
        gender: input.gender,
        spreadNumbers,
        memoryBlock: input.memoryBlock,
      }),
    };
  }

  const forecastContext =
    input.toolId === "matrix_year_forecast" && input.birthDate
      ? matrixYearForecast(input.birthDate)
      : null;
  const message = [
    buildNumerologToolMessage(input.toolId, input.toolParams),
    forecastContext
      ? [
          `Аркан года: ${forecastContext.yearArcana.number} — ${forecastContext.yearArcana.title}.`,
          "Месяцы (не пересчитывай):",
          ...forecastContext.months.map((m) => `${m.label}: ${m.number} — ${m.title}`),
          `Возможности: ${forecastContext.opportunityMonths.map((i) => forecastContext.months[i]!.label).join(", ")}.`,
          `Осторожность: ${forecastContext.cautionMonths.map((i) => forecastContext.months[i]!.label).join(", ")}.`,
        ].join("\n")
      : "",
  ].filter(Boolean).join("\n\n");
  const streamed = await generateNumerologStreamReply({
    characterId: "numerolog",
    userName: input.userName,
    birthDate: input.birthDate,
    profileName: input.fullName ?? input.userName,
    gender: input.gender,
    lastUserMessage: message,
    recentUserMessages: [],
    spreadNumbers,
    memoryBlock: input.memoryBlock,
    onMatrixProgress: input.onMatrixProgress,
    birthTime: input.birthTime,
    birthCity: input.birthCity,
    userId: input.userId,
    toolId: input.toolId,
    subjectKind:
      input.subjectKind ??
      (input.toolId === "child_matrix" ? "child" : undefined),
    subjectName: input.subjectName,
    asOfDate: input.asOfDate,
    // Paid session: AI-only. completeNumerologProse walks paid → fallbackModels.
    allowEngineFallback: false,
  });

  if (streamed?.reply?.trim()) {
    return streamed;
  }

  // Paid session reading requires genuine AI — never substitute engine prose.
  throw new Error("numerolog_session_reading_failed");
}
