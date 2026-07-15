import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import type { NatalEvidence } from "./evidence";
import {
  buildMinimalNatalReport,
  extractJsonObject,
  prepareNatalReportCandidate,
  salvageNatalReport,
  validateNatalReport,
  type NatalReport,
  type NatalReportValidation,
} from "./report";
import type { NatalTradition } from "./types";

export type GenerateValidatedNatalReportParams = {
  baseMessages: ChatMessage[];
  evidence: readonly NatalEvidence[];
  tradition: NatalTradition;
  reportType: NatalReport["reportType"];
  horizonDays?: NatalReport["horizonDays"];
  metadataDefaults?: { disclaimer: string; methodology: string };
  evidenceIdsHint?: string[];
  repairHint?: string;
};

export type GenerateValidatedNatalReportResult =
  | { ok: true; report: NatalReport; raw: string | null; fallback?: "minimal" | "salvage" }
  | { ok: false; errors: string[]; raw: string | null };

const INITIAL_TIMEOUT_MS = 90_000;
const REPAIR_TIMEOUT_MS = 60_000;

const CHAT_OPTS = {
  maxTokens: 6000,
  jsonObject: true as const,
  allowReasoningFallback: true,
  skipTemperatureRetry: true,
  maxAttempts: 1,
};

async function requestNatalReportJson(
  messages: ChatMessage[],
  timeoutMs: number,
  temperature: number
): Promise<string | null> {
  const result = await completeChatDetailed({
    messages,
    ...CHAT_OPTS,
    temperature,
    timeoutMs,
  });
  return result.text;
}

function parseCandidate(
  raw: string | null | undefined,
  params: GenerateValidatedNatalReportParams
): unknown {
  try {
    return prepareNatalReportCandidate(extractJsonObject(raw ?? ""), {
      tradition: params.tradition,
      reportType: params.reportType,
      horizonDays: params.horizonDays,
      metadataDefaults: params.metadataDefaults,
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error("Некорректный JSON.");
  }
}

function validateCandidate(
  candidate: unknown,
  params: GenerateValidatedNatalReportParams,
  options?: { coerceEvidence?: boolean; skipCategoryRules?: boolean }
): NatalReportValidation {
  return validateNatalReport(
    candidate,
    params.evidence,
    params.tradition,
    params.reportType,
    params.horizonDays,
    options
  );
}

function buildRepairMessage(errors: string[], params: GenerateValidatedNatalReportParams): string {
  const lines = [
    "Исправь JSON и верни его полностью, без сокращений и markdown.",
    "Не меняй порядок восьми разделов.",
    "Каждый claim должен содержать непустой text и хотя бы один точный evidence ID из списка ниже.",
    params.reportType === "forecast" && params.horizonDays
      ? `horizonDays должен быть ${params.horizonDays}.`
      : null,
    params.repairHint ?? null,
    "",
    "Ошибки:",
    ...errors.map((error) => `- ${error}`),
  ];
  if (params.evidenceIdsHint?.length) {
    lines.push("", "Допустимые evidence ID:", ...params.evidenceIdsHint);
  }
  return lines.filter(Boolean).join("\n");
}

function trySalvage(
  raw: string | null,
  params: GenerateValidatedNatalReportParams
): GenerateValidatedNatalReportResult | null {
  let candidate: unknown;
  try {
    candidate = parseCandidate(raw, params);
  } catch {
    try {
      candidate = prepareNatalReportCandidate(extractJsonObject(raw ?? "{}"), {
        tradition: params.tradition,
        reportType: params.reportType,
        horizonDays: params.horizonDays,
        metadataDefaults: params.metadataDefaults,
      });
    } catch {
      candidate = prepareNatalReportCandidate({}, {
        tradition: params.tradition,
        reportType: params.reportType,
        horizonDays: params.horizonDays,
        metadataDefaults: params.metadataDefaults,
      });
    }
  }
  const salvaged = salvageNatalReport(
    candidate,
    params.evidence,
    params.tradition,
    params.reportType,
    params.horizonDays
  );
  if (salvaged.ok) {
    return { ok: true, report: salvaged.report, raw, fallback: "salvage" };
  }
  return null;
}

function minimalFallback(
  params: GenerateValidatedNatalReportParams,
  raw: string | null,
  errors: string[]
): GenerateValidatedNatalReportResult {
  const minimal = buildMinimalNatalReport(
    params.evidence,
    params.tradition,
    params.reportType,
    params.horizonDays,
    params.metadataDefaults
  );
  if (minimal.ok) {
    console.warn(
      `[natal-chart] ${params.reportType} used minimal fallback`,
      errors.slice(0, 4).join("; ")
    );
    return { ok: true, report: minimal.report, raw, fallback: "minimal" };
  }
  return { ok: false, errors, raw };
}

export async function generateValidatedNatalReport(
  params: GenerateValidatedNatalReportParams
): Promise<GenerateValidatedNatalReportResult> {
  let raw: string | null = await requestNatalReportJson(
    params.baseMessages,
    INITIAL_TIMEOUT_MS,
    0.3
  );

  if (!raw) {
    return minimalFallback(params, raw, ["LLM не вернула JSON."]);
  }

  let validation: NatalReportValidation;
  try {
    validation = validateCandidate(parseCandidate(raw, params), params);
  } catch (error) {
    validation = {
      ok: false,
      errors: [error instanceof Error ? error.message : "Некорректный JSON."],
    };
  }

  if (!validation.ok) {
    raw = await requestNatalReportJson(
      [
        ...params.baseMessages,
        { role: "assistant", content: raw },
        { role: "user", content: buildRepairMessage(validation.errors, params) },
      ],
      REPAIR_TIMEOUT_MS,
      0.12
    );
    if (raw) {
      try {
        validation = validateCandidate(parseCandidate(raw, params), params);
      } catch (error) {
        validation = {
          ok: false,
          errors: [error instanceof Error ? error.message : "Некорректный JSON."],
        };
      }
    }
  }

  if (validation.ok) {
    return { ok: true, report: validation.report, raw };
  }

  const salvaged = trySalvage(raw, params);
  if (salvaged) return salvaged;

  return minimalFallback(params, raw, validation.errors);
}
