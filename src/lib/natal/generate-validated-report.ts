import { getNatalModel } from "@/lib/ai-model";
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import type { NatalEvidence } from "./evidence";
import {
  extractJsonObject,
  NATAL_REPORT_SECTION_KEYS,
  NATAL_REPORT_VERSION,
  prepareNatalReportCandidate,
  salvageNatalReport,
  validateNatalReport,
  type NatalReport,
  type NatalReportSection,
  type NatalReportSectionKey,
  type NatalReportValidation,
  type ValidateNatalReportOptions,
} from "./report";
import {
  claimHasEvidenceAnchor,
  findNearDuplicateSections,
  NATAL_FLUFF_RE,
  SECTION_ROLE_CONTRACTS,
  type NatalSectionKey,
} from "./report-quality";
import type { NatalTradition } from "./types";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  normalizeClientTyAddress,
  softenShoutyClientName,
} from "@/lib/reading-quality-gate";

export type GenerateValidatedNatalReportParams = {
  baseMessages: ChatMessage[];
  evidence: readonly NatalEvidence[];
  tradition: NatalTradition;
  reportType: NatalReport["reportType"];
  horizonDays?: NatalReport["horizonDays"];
  metadataDefaults?: { disclaimer: string; methodology: string };
  evidenceIdsHint?: string[];
  repairHint?: string;
  clientName?: string;
};

export type GenerateValidatedNatalReportResult =
  | { ok: true; report: NatalReport; raw: string | null }
  | { ok: false; errors: string[]; raw: string | null; reason?: "llm_empty" | "validation" };

const INITIAL_TIMEOUT_MS = 90_000;
const INITIAL_TIMEOUT_FORECAST_LONG_MS = 120_000;
const REPAIR_TIMEOUT_MS = 60_000;
const SECTION_TIMEOUT_MS = 55_000;
const MAX_REPAIR_PASSES_DEFAULT = 1;
const MAX_REPAIR_PASSES_FORECAST = 2;

const PLACEHOLDER_CLAIM_RE = /Ключевой вывод по разделу/i;
/** Dense floor — quality is anchors + roles, not essay padding. */
const MIN_SECTION_TEXT_LENGTH = 220;
const MIN_REPORT_TEXT_LENGTH = 2_000;
const EVIDENCE_ID_PAREN_RE =
  /\s*\((?:ne|не)\.(?:timing|western|vedic)\.[a-z0-9._-]+\)/giu;
const EVIDENCE_ID_RE = /(?:ne|не)\.(?:timing|western|vedic)\.[a-z0-9._-]+/giu;

function substantiveThresholds(params: GenerateValidatedNatalReportParams): {
  minSection: number;
  minReport: number;
} {
  if (params.reportType !== "forecast") {
    return { minSection: MIN_SECTION_TEXT_LENGTH, minReport: MIN_REPORT_TEXT_LENGTH };
  }
  const horizon = params.horizonDays ?? 30;
  if (horizon <= 7) return { minSection: 240, minReport: 1_900 };
  if (horizon <= 30) return { minSection: 200, minReport: 1_800 };
  // Long horizons: prefer complete JSON over very long prose.
  return { minSection: 180, minReport: 1_600 };
}

function chatOptsFor(
  params: GenerateValidatedNatalReportParams,
  mode: "full" | "section" = "full"
) {
  const forecast = params.reportType === "forecast";
  const longForecast = forecast && (params.horizonDays ?? 30) >= 90;
  if (mode === "section") {
    return {
      maxTokens: 2_800,
      jsonObject: true as const,
      allowReasoningFallback: true,
      skipTemperatureRetry: true,
      maxAttempts: 3,
    };
  }
  return {
    maxTokens: longForecast ? 10_000 : forecast ? 8_000 : 8_000,
    jsonObject: true as const,
    // Natal forecasts frequently hit empty/truncated completions; allow alternate model path.
    allowReasoningFallback: forecast,
    skipTemperatureRetry: true,
    maxAttempts: forecast ? 3 : 2,
  };
}

const JSON_CONTINUE_USER_PROMPT =
  "JSON обрезан на лимите токенов. Верни ПОЛНЫЙ JSON-объект целиком: все 8 разделов sections в правильном порядке, disclaimer и methodology. Без markdown.";

function appendJsonChunk(combined: string, chunk: string): string {
  const prior = combined.trim();
  const next = chunk.trim();
  if (!next) return prior;
  if (!prior) return next;
  if (next.startsWith("{")) return next;
  return `${prior}${next}`;
}

function isSubstantiveReport(
  report: NatalReport,
  params: GenerateValidatedNatalReportParams
): boolean {
  const { minSection, minReport } = substantiveThresholds(params);
  const evidenceById = new Map(params.evidence.map((item) => [item.id, item]));
  const totalLength = report.sections.reduce(
    (sum, section) =>
      sum + section.claims.reduce((sectionSum, claim) => sectionSum + claim.text.trim().length, 0),
    0
  );
  if (totalLength < minReport) return false;
  if (findNearDuplicateSections(report).length > 0) return false;
  return report.sections.every((section) =>
    section.claims.some((claim) => {
      const text = claim.text.trim();
      if (
        text.length < minSection ||
        PLACEHOLDER_CLAIM_RE.test(text) ||
        NATAL_FLUFF_RE.test(text) ||
        !claim.evidenceIds.length
      ) {
        return false;
      }
      const cited = claim.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((item): item is NatalEvidence => Boolean(item));
      // Require a visible calculation anchor in the prose (planet/date/label).
      return claimHasEvidenceAnchor(text, cited);
    })
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function displayClientName(name: string): string {
  return normalizePersonDisplayName(name) || name.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace Latin / mixed-script spellings of the client name with clean Russian. */
function replaceClientNameForms(text: string, clientName: string): string {
  const russianName = displayClientName(clientName);
  if (!russianName) return text;

  const variants = new Set<string>();
  const raw = clientName.trim();
  if (raw) variants.add(raw);
  for (const part of raw.split(/\s+/)) {
    if (part.length >= 2) variants.add(part);
  }
  // Common LLM mangling: Cyrillic first letter + Latin tail ("Гennadiy").
  if (/^[A-Za-z]/.test(raw)) {
    const rest = raw.slice(1);
    const firstUpper = raw.charAt(0).toUpperCase();
    const cyrMap: Record<string, string> = { G: "Г", g: "г", A: "А", a: "а", E: "Е", e: "е", O: "О", o: "о", P: "Р", p: "р", C: "С", c: "с", T: "Т", t: "т", H: "Н", K: "К", k: "к", M: "М", m: "м", B: "В", X: "Х", x: "х" };
    if (cyrMap[firstUpper]) variants.add(`${cyrMap[firstUpper]}${rest}`);
    if (cyrMap[raw.charAt(0)]) variants.add(`${cyrMap[raw.charAt(0)]}${rest}`);
  }

  let output = text;
  for (const variant of variants) {
    if (!variant || variant === russianName) continue;
    output = output.replace(new RegExp(escapeRegExp(variant), "giu"), russianName);
  }

  // Any remaining mixed/Latin token that normalizes to the same given name.
  output = output.replace(/[A-Za-z\u0400-\u04FFёЁ-]{2,}/gu, (token) => {
    const normalized = normalizePersonDisplayName(token);
    if (normalized && normalized.toLowerCase() === russianName.toLowerCase()) {
      return russianName;
    }
    return token;
  });

  return output;
}

function sanitizeNatalText(text: string, clientName?: string): string {
  let output = text
    .replace(EVIDENCE_ID_PAREN_RE, "")
    .replace(EVIDENCE_ID_RE, "")
    .replace(/\b(?:в|по)\s+(?:вашем\s+|твоём\s+)?натальном раскладе\b/giu, "в твоей натальной карте")
    .replace(/\bв вашем раскладе\b/giu, "в твоей натальной карте")
    .replace(/\bв вашей натальной карте\b/giu, "в твоей натальной карте");
  const rawName = clientName?.trim();
  if (rawName) {
    output = replaceClientNameForms(output, rawName);
    const display = normalizePersonDisplayName(rawName) || rawName;
    output = softenShoutyClientName(output, display);
  }
  output = normalizeClientTyAddress(output);
  return output
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeNatalReport(
  report: NatalReport,
  params: GenerateValidatedNatalReportParams
): NatalReport {
  return {
    ...report,
    sections: report.sections.map((section) => ({
      ...section,
      title: sanitizeNatalText(section.title, params.clientName),
      claims: section.claims.map((claim) => ({
        ...claim,
        text: sanitizeNatalText(claim.text, params.clientName),
      })),
    })),
    methodology: sanitizeNatalText(report.methodology, params.clientName),
    disclaimer: sanitizeNatalText(report.disclaimer, params.clientName),
  };
}

function isSubstantiveSection(
  value: unknown,
  expectedKey: NatalReportSectionKey,
  params: GenerateValidatedNatalReportParams
): value is NatalReportSection {
  const section = record(value);
  if (!section || section.key !== expectedKey) return false;
  const title = typeof section.title === "string" ? section.title.trim() : "";
  if (!title) return false;
  const { minSection } = substantiveThresholds(params);
  const claims = Array.isArray(section.claims) ? section.claims : [];
  return claims.some((value) => {
    const claim = record(value);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    return (
      text.length >= minSection &&
      !PLACEHOLDER_CLAIM_RE.test(text) &&
      !NATAL_FLUFF_RE.test(text)
    );
  });
}

async function requestNatalReportJson(
  messages: ChatMessage[],
  timeoutMs: number,
  temperature: number,
  model: string,
  params?: GenerateValidatedNatalReportParams,
  mode: "full" | "section" = "full"
): Promise<string | null> {
  const thread: ChatMessage[] = [...messages];
  let combined = "";
  const opts = params
    ? chatOptsFor(params, mode)
    : {
        maxTokens: 8_000,
        jsonObject: true as const,
        allowReasoningFallback: false,
        skipTemperatureRetry: true,
        maxAttempts: 2,
      };
  const maxContinuationPasses = mode === "section" ? 2 : 4;

  for (let pass = 0; pass < maxContinuationPasses; pass++) {
    const result = await completeChatDetailed({
      messages: thread,
      ...opts,
      modelOverride: model,
      temperature,
      timeoutMs,
      priority: "report",
    });

    const chunk = result.text?.trim() ?? "";
    if (!chunk) break;

    combined = appendJsonChunk(combined, chunk);

    const truncated = result.finishReason === "length";
    let parseable = false;
    try {
      extractJsonObject(combined);
      parseable = true;
    } catch {
      parseable = false;
    }

    if (parseable && !truncated) return combined;
    if (!truncated) return combined;
    if (pass >= maxContinuationPasses - 1) return combined || null;

    thread.push({ role: "assistant", content: combined });
    thread.push({
      role: "user",
      content:
        mode === "section"
          ? "JSON обрезан. Верни ПОЛНЫЙ JSON одного раздела целиком: key, title, claims. Без markdown."
          : JSON_CONTINUE_USER_PROMPT,
    });
  }

  return combined || null;
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
  options?: ValidateNatalReportOptions
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
    "В массиве sections должно быть ровно 8 объектов в порядке: summary, personality, relationships, career, resources, tensions, currentPeriod, recommendations.",
    params.reportType === "forecast" && (params.horizonDays ?? 30) <= 7
      ? "Каждый раздел: 4–7 предложений, минимум 300 знаков, конкретные факторы из evidence и практический вывод."
      : "Каждый раздел должен содержать глубокий персональный текст: 5–8 предложений, минимум 300 знаков, конкретные факторы из evidence и практический вывод.",
    "Каждый claim должен содержать непустой text и хотя бы один точный evidence ID из списка ниже.",
    "Удали универсальные фразы и смысловые повторы между разделами.",
    params.reportType === "forecast" && params.horizonDays
      ? `horizonDays должен быть ${params.horizonDays}.`
      : null,
    params.reportType === "interpretation"
      ? "Для currentPeriod используй только evidence категории timing (ne.timing.*)."
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

function sectionRepairPrompt(
  key: NatalReportSectionKey,
  params: GenerateValidatedNatalReportParams
): string {
  const categoryHints: Partial<Record<NatalReportSectionKey, readonly string[]>> = {
    personality: ["identity", "emotions"],
    relationships: ["relationships", "emotions"],
    career: ["career", "identity"],
    resources: ["resources", "career"],
    tensions: ["tensions", "emotions"],
  };
  const allowedCategories = categoryHints[key];
  // Forecast timing trio: tradition===timing (transit categories are often thematic).
  const forecastTimingTrio =
    params.reportType === "forecast" &&
    (key === "summary" || key === "currentPeriod" || key === "recommendations");
  const interpretationPeriod = params.reportType === "interpretation" && key === "currentPeriod";
  const allowedIds = forecastTimingTrio
    ? params.evidence.filter((item) => item.tradition === "timing").map((item) => item.id)
    : interpretationPeriod
      ? params.evidence
          .filter((item) => item.tradition === "timing" || item.category === "timing")
          .map((item) => item.id)
      : allowedCategories
        ? params.evidence
            .filter((item) => allowedCategories.includes(item.category))
            .map((item) => item.id)
        : params.evidence.map((item) => item.id);
  const timingRule =
    params.reportType === "forecast" &&
    (key === "summary" || key === "currentPeriod" || key === "recommendations")
      ? "Каждый claim обязан ссылаться минимум на один timing evidence ID с префиксом ne.timing."
      : "";
  const { minSection } = substantiveThresholds(params);
  const depthHint =
    params.reportType === "forecast" && (params.horizonDays ?? 30) <= 7
      ? `плотный разбор 4–7 предложений и не менее ${minSection} знаков`
      : params.reportType === "forecast"
        ? `плотный разбор 3–5 предложений и не менее ${minSection} знаков`
        : `плотный разбор 4–6 предложений и не менее ${minSection} знаков`;
  const role = SECTION_ROLE_CONTRACTS[key as NatalSectionKey];
  return [
    `Предыдущий JSON не содержал полноценный раздел "${key}".`,
    "Создай ТОЛЬКО этот раздел как JSON-объект без markdown:",
    `{"key":"${key}","title":"выразительный русский заголовок","claims":[{"text":"${depthHint}","evidenceIds":["точный ID из EVIDENCE"]}]}`,
    `Роль раздела: ${role}`,
    "Назови в тексте конкретную планету, аспект, знак или дату из evidence. Без воды и без универсальных фраз.",
    "Не повторяй содержание других разделов — у этого раздела своя роль.",
    "Не выдумывай факты и ID. Используй только EVIDENCE из системного сообщения.",
    forecastTimingTrio
      ? `Для раздела "${key}" используй только timing evidence (tradition=timing).`
      : interpretationPeriod
        ? `Для раздела "${key}" используй evidence традиции timing или категории timing.`
        : allowedCategories
          ? `Для раздела "${key}" разрешены только evidence категорий: ${allowedCategories.join(", ")}.`
          : "",
    allowedIds.length
      ? `Точные допустимые evidenceIds для этого раздела:\n${allowedIds.join("\n")}`
      : "",
    timingRule,
  ].filter(Boolean).join("\n");
}

function sectionGeneratePrompt(
  key: NatalReportSectionKey,
  params: GenerateValidatedNatalReportParams
): string {
  return [
    `Собери раздел "${key}" прогноза как самостоятельный JSON-объект.`,
    sectionRepairPrompt(key, params).replace(
      `Предыдущий JSON не содержал полноценный раздел "${key}".\n`,
      ""
    ),
  ].join("\n");
}

/**
 * Generate all 8 sections in parallel — more reliable than one giant JSON for long forecasts.
 */
async function generateReportBySections(
  params: GenerateValidatedNatalReportParams,
  model: string
): Promise<{ validation: NatalReportValidation; raw: string } | null> {
  console.warn(
    `[natal-chart] ${params.reportType} generating section-by-section (model=${model}, horizon=${params.horizonDays ?? "-"})`
  );

  const replacements = await Promise.all(
    NATAL_REPORT_SECTION_KEYS.map(async (key) => {
      const replacementRaw = await requestNatalReportJson(
        [
          ...params.baseMessages,
          { role: "user", content: sectionGeneratePrompt(key, params) },
        ],
        SECTION_TIMEOUT_MS,
        0.28,
        model,
        params,
        "section"
      );
      if (!replacementRaw) return [key, null] as const;
      try {
        const replacement = extractJsonObject(replacementRaw);
        return [
          key,
          isSubstantiveSection(replacement, key, params) ? replacement : null,
        ] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );

  const byKey = new Map<NatalReportSectionKey, unknown>();
  let filled = 0;
  for (const [key, replacement] of replacements) {
    if (replacement) {
      byKey.set(key, replacement);
      filled += 1;
    }
  }
  if (filled < 4) {
    console.warn(
      `[natal-chart] ${params.reportType} section-wise produced too few sections (${filled}/8)`
    );
    return null;
  }

  const candidate = prepareNatalReportCandidate(
    {
      version: NATAL_REPORT_VERSION,
      tradition: params.tradition,
      reportType: params.reportType,
      horizonDays: params.horizonDays,
      sections: NATAL_REPORT_SECTION_KEYS.map((key) => byKey.get(key)),
      disclaimer: params.metadataDefaults?.disclaimer,
      methodology: params.metadataDefaults?.methodology,
    },
    {
      tradition: params.tradition,
      reportType: params.reportType,
      horizonDays: params.horizonDays,
      metadataDefaults: params.metadataDefaults,
    }
  );

  let validation = validateCandidate(candidate, params);
  if (!validation.ok || !isSubstantiveReport(validation.report, params)) {
    const salvaged = salvageNatalReport(
      candidate,
      params.evidence,
      params.tradition,
      params.reportType,
      params.horizonDays
    );
    // Only accept salvage when the coerced prose also clears substantive gates —
    // otherwise the caller would skip single-shot/repair and still fail.
    if (salvaged.ok && isSubstantiveReport(salvaged.report, params)) {
      validation = salvaged;
    }
  }

  const raw = JSON.stringify(candidate);
  if (!validation.ok || !isSubstantiveReport(validation.report, params)) {
    console.warn(
      `[natal-chart] ${params.reportType} section-wise validation failed:`,
      (!validation.ok
        ? validation.errors.slice(0, 6).join("; ")
        : "sections too thin after salvage")
    );
    return null;
  }

  console.warn(
    `[natal-chart] ${params.reportType} section-wise ok (${filled}/8 LLM sections, model=${model})`
  );
  return { validation, raw };
}

function invalidSectionKeys(errors: readonly string[]): Set<NatalReportSectionKey> {
  const keys = new Set<NatalReportSectionKey>();
  for (const error of errors) {
    const key = NATAL_REPORT_SECTION_KEYS.find(
      (candidate) =>
        error === candidate ||
        error.startsWith(`${candidate}.`) ||
        error.startsWith(`${candidate}:`) ||
        error.startsWith(`Раздел ${candidate}:`)
    );
    if (key) keys.add(key);
  }
  return keys;
}

async function repairMissingSections(
  raw: string,
  params: GenerateValidatedNatalReportParams,
  model: string,
  validationErrors: readonly string[] = []
): Promise<unknown | null> {
  let candidate: unknown;
  try {
    candidate = parseCandidate(raw, params);
  } catch {
    return null;
  }
  const root = record(candidate);
  if (!root) return null;

  const currentSections = Array.isArray(root.sections) ? root.sections : [];
  const byKey = new Map<NatalReportSectionKey, unknown>();
  for (const value of currentSections) {
    const section = record(value);
    const key = section?.key;
    if (
      typeof key === "string" &&
      NATAL_REPORT_SECTION_KEYS.includes(key as NatalReportSectionKey)
    ) {
      byKey.set(key as NatalReportSectionKey, value);
    }
  }

  const invalidKeys = invalidSectionKeys(validationErrors);
  const missing = NATAL_REPORT_SECTION_KEYS.filter(
    (key) => invalidKeys.has(key) || !isSubstantiveSection(byKey.get(key), key, params)
  );
  if (!missing.length) return candidate;

  console.warn(
    `[natal-chart] ${params.reportType} repairing sections (model=${model}): ${missing.join(",")}`
  );

  const replacements = await Promise.all(
    missing.map(async (key) => {
      const replacementRaw = await requestNatalReportJson(
        [
          ...params.baseMessages,
          { role: "user", content: sectionRepairPrompt(key, params) },
        ],
        REPAIR_TIMEOUT_MS,
        0.15,
        model,
        params
      );
      if (!replacementRaw) return [key, null] as const;
      try {
        const replacement = extractJsonObject(replacementRaw);
        return [
          key,
          isSubstantiveSection(replacement, key, params) ? replacement : null,
        ] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );

  for (const [key, replacement] of replacements) {
    if (replacement) byKey.set(key, replacement);
  }
  root.sections = NATAL_REPORT_SECTION_KEYS.map((key) => byKey.get(key));
  return root;
}

/**
 * Lightweight rewrite for summary / currentPeriod / recommendations only.
 * Used after section-wise forecasts where full-JSON editorial truncates.
 */
async function timingTrioEditorialPass(
  report: NatalReport,
  params: GenerateValidatedNatalReportParams,
  model: string
): Promise<NatalReport | null> {
  const trio = report.sections.filter((section) =>
    section.key === "summary" ||
    section.key === "currentPeriod" ||
    section.key === "recommendations"
  );
  if (trio.length < 3) return null;
  const prompt = [
    "Отредактируй ТОЛЬКО три раздела прогноза и верни JSON-объект без markdown:",
    '{"sections":[{"key":"summary",...},{"key":"currentPeriod",...},{"key":"recommendations",...}]}',
    "Ключи строго: summary, currentPeriod, recommendations — в этом порядке.",
    "Сохрани key и evidenceIds каждого раздела; перепиши text так, чтобы роли не пересекались:",
    `- summary: ${SECTION_ROLE_CONTRACTS.summary}`,
    `- currentPeriod: ${SECTION_ROLE_CONTRACTS.currentPeriod}`,
    `- recommendations: ${SECTION_ROLE_CONTRACTS.recommendations}`,
    "Убери воду и повторы. В каждом text назови планету/аспект/дату из evidence.",
    "Обращение — на «ты». Без «практический акцент» и универсальных фраз.",
    "",
    "РАЗДЕЛЫ:",
    JSON.stringify(trio),
  ].join("\n");

  const editedRaw = await requestNatalReportJson(
    [
      ...params.baseMessages,
      { role: "user", content: prompt },
    ],
    REPAIR_TIMEOUT_MS,
    0.12,
    model,
    params,
    "section"
  );
  if (!editedRaw) return null;
  try {
    const parsed = extractJsonObject(editedRaw);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(record(parsed)?.sections)
        ? (record(parsed)!.sections as unknown[])
        : null;
    if (!list?.length) return null;
    const byKey = new Map<string, unknown>();
    for (const item of list) {
      const section = record(item);
      if (section && typeof section.key === "string") byKey.set(section.key, item);
    }
    if (
      !byKey.has("summary") ||
      !byKey.has("currentPeriod") ||
      !byKey.has("recommendations")
    ) {
      return null;
    }
    const merged: NatalReport = {
      ...report,
      sections: report.sections.map((section) => {
        if (
          section.key !== "summary" &&
          section.key !== "currentPeriod" &&
          section.key !== "recommendations"
        ) {
          return section;
        }
        const raw = record(byKey.get(section.key));
        if (!raw) return section;
        const claimsRaw = Array.isArray(raw.claims) ? raw.claims : [];
        const claims = claimsRaw
          .map((value) => {
            const claim = record(value);
            const text = typeof claim?.text === "string" ? claim.text.trim() : "";
            const evidenceIds = Array.isArray(claim?.evidenceIds)
              ? claim.evidenceIds.filter((id): id is string => typeof id === "string")
              : section.claims[0]?.evidenceIds ?? [];
            if (!text) return null;
            return { text, evidenceIds: evidenceIds.length ? evidenceIds : section.claims[0]?.evidenceIds ?? [] };
          })
          .filter((claim): claim is { text: string; evidenceIds: string[] } => Boolean(claim));
        if (!claims.length) return section;
        return {
          key: section.key,
          title:
            typeof raw.title === "string" && raw.title.trim()
              ? raw.title.trim()
              : section.title,
          claims,
        };
      }),
    };
    return isSubstantiveReport(merged, params) ? merged : null;
  } catch {
    return null;
  }
}

async function editorialPass(
  report: NatalReport,
  params: GenerateValidatedNatalReportParams,
  model: string
): Promise<NatalReport | null> {
  const traditionRule = params.tradition === "vedic"
    ? "Это отчёт джйотиш: используй только ведические положения, накшатры и даши из evidence. Не добавляй западные транзиты и западные дома."
    : "Это западная тропическая интерпретация: не добавляй накшатры, даши или другие термины джйотиш.";
  const nameRule = params.clientName
    ? `Имя клиента в тексте пиши только так: «${displayClientName(params.clientName)}». Не используй латиницу и смешанные написания вроде «Гennadiy».`
    : "";
  const prompt = [
    "Отредактируй готовый JSON-отчёт и верни весь JSON целиком без markdown.",
    "Сохрани ровно 8 разделов, их key и массивы evidenceIds.",
    "Удали смысловые повторы: у каждого раздела должен быть свой набор тем и конкретных факторов.",
    "Сделай текст плотным и человечным: без воды, канцелярита и универсальных советов.",
    `Не сокращай текст ниже ${substantiveThresholds(params).minReport} знаков суммарно.`,
    "Не показывай технические evidence ID внутри поля text — они допустимы только в evidenceIds.",
    "Не используй слово «расклад»: это натальный отчёт или прогноз.",
    "Обращение к клиенту — строго на «ты» (ты/тебе/твой). Не используй «вы/вам/ваш».",
    traditionRule,
    nameRule,
    "",
    "JSON ДЛЯ РЕДАКТУРЫ:",
    JSON.stringify(report),
  ].filter(Boolean).join("\n");

  const editedRaw = await requestNatalReportJson(
    [
      ...params.baseMessages,
      { role: "user", content: prompt },
    ],
    REPAIR_TIMEOUT_MS,
    0.12,
    model,
    params
  );
  if (!editedRaw) return null;

  try {
    const candidate = parseCandidate(editedRaw, params);
    const validation = validateCandidate(candidate, params);
    if (!validation.ok) return null;
    const sanitized = sanitizeNatalReport(validation.report, params);
    return isSubstantiveReport(sanitized, params) ? sanitized : null;
  } catch {
    return null;
  }
}

export async function generateValidatedNatalReport(
  params: GenerateValidatedNatalReportParams
): Promise<GenerateValidatedNatalReportResult> {
  const model = await getNatalModel();
  const maxRepairPasses =
    params.reportType === "forecast" ? MAX_REPAIR_PASSES_FORECAST : MAX_REPAIR_PASSES_DEFAULT;
  const initialTimeout =
    params.reportType === "forecast" && (params.horizonDays ?? 30) >= 90
      ? INITIAL_TIMEOUT_FORECAST_LONG_MS
      : INITIAL_TIMEOUT_MS;
  // Long forecasts truncate as one giant JSON; build by sections first.
  const preferSectionWise =
    params.reportType === "forecast" && (params.horizonDays ?? 30) >= 30;

  let raw: string | null = null;
  let validation: NatalReportValidation = { ok: false, errors: ["LLM не вернула JSON."] };
  let usedSectionWise = false;
  /** True when the current validation result came from evidence-grounded salvage. */
  let acceptedViaSalvage = false;

  if (preferSectionWise) {
    const sectioned = await generateReportBySections(params, model);
    if (
      sectioned &&
      sectioned.validation.ok &&
      isSubstantiveReport(sectioned.validation.report, params)
    ) {
      raw = sectioned.raw;
      validation = sectioned.validation;
      usedSectionWise = true;
    } else if (sectioned?.raw) {
      // Keep raw for later salvage, but do not treat thin section-wise output as final.
      raw = sectioned.raw;
    }
  }

  const needsMoreWork = (): boolean => {
    if (!validation.ok) return true;
    return !isSubstantiveReport(validation.report, params);
  };

  if (needsMoreWork()) {
    const singleShotRaw = await requestNatalReportJson(
      params.baseMessages,
      initialTimeout,
      0.3,
      model,
      params
    );
    if (singleShotRaw) raw = singleShotRaw;

    if (!raw) {
      console.warn(`[natal-chart] ${params.reportType} LLM empty (model=${model})`);
    } else {
      try {
        validation = validateCandidate(parseCandidate(raw, params), params);
        acceptedViaSalvage = false;
      } catch (error) {
        validation = {
          ok: false,
          errors: [error instanceof Error ? error.message : "Некорректный JSON."],
        };
        acceptedViaSalvage = false;
      }

      for (let repairPass = 0; needsMoreWork() && repairPass < maxRepairPasses; repairPass += 1) {
        const repairedRaw = await requestNatalReportJson(
          [
            ...params.baseMessages,
            { role: "assistant", content: raw },
            {
              role: "user",
              content: buildRepairMessage(
                validation.ok
                  ? ["Один или несколько разделов отчёта не содержат полноценного текста."]
                  : validation.errors,
                params
              ),
            },
          ],
          REPAIR_TIMEOUT_MS,
          repairPass === 0 ? 0.12 : 0.08,
          model,
          params
        );
        if (!repairedRaw) break;
        raw = repairedRaw;
        try {
          validation = validateCandidate(parseCandidate(raw, params), params);
          acceptedViaSalvage = false;
        } catch (error) {
          validation = {
            ok: false,
            errors: [error instanceof Error ? error.message : "Некорректный JSON."],
          };
          acceptedViaSalvage = false;
        }
      }

      if (needsMoreWork() && raw) {
        try {
          const repairedCandidate = await repairMissingSections(
            raw,
            params,
            model,
            validation.ok ? [] : validation.errors
          );
          const strict = validateCandidate(
            repairedCandidate ?? parseCandidate(raw, params),
            params
          );
          if (strict.ok && isSubstantiveReport(strict.report, params)) {
            validation = strict;
            acceptedViaSalvage = false;
          }
        } catch {
          /* keep prior validation errors */
        }
      }

      // Last salvage: keep model prose, coerce broken/missing evidence IDs.
      if (needsMoreWork() && raw) {
        try {
          const salvaged = salvageNatalReport(
            parseCandidate(raw, params),
            params.evidence,
            params.tradition,
            params.reportType,
            params.horizonDays
          );
          if (salvaged.ok && isSubstantiveReport(salvaged.report, params)) {
            console.warn(
              `[natal-chart] ${params.reportType} accepted via evidence salvage (model=${model})`
            );
            validation = salvaged;
            acceptedViaSalvage = true;
          }
        } catch {
          /* keep prior validation errors */
        }
      }
    }
  }

  // Rescue path: forecasts that still lack a substantive report after single-shot.
  if (params.reportType === "forecast" && needsMoreWork()) {
    const sectioned = await generateReportBySections(params, model);
    if (
      sectioned &&
      sectioned.validation.ok &&
      isSubstantiveReport(sectioned.validation.report, params)
    ) {
      raw = sectioned.raw;
      validation = sectioned.validation;
      usedSectionWise = true;
      acceptedViaSalvage = false;
    } else if (sectioned?.raw && needsMoreWork()) {
      raw = sectioned.raw;
      try {
        const salvaged = salvageNatalReport(
          parseCandidate(raw, params),
          params.evidence,
          params.tradition,
          params.reportType,
          params.horizonDays
        );
        if (salvaged.ok && isSubstantiveReport(salvaged.report, params)) {
          console.warn(
            `[natal-chart] ${params.reportType} accepted via section-wise salvage (model=${model})`
          );
          validation = salvaged;
          usedSectionWise = true;
          acceptedViaSalvage = true;
        }
      } catch {
        /* keep prior validation errors */
      }
    }
  }

  // Absolute fallback for forecasts: evidence-grounded salvage from any available
  // JSON — but still gated on the substantive floor. A paid forecast must never
  // degrade to one stub sentence per section; fail closed instead (caller
  // refunds and the user can regenerate).
  if (params.reportType === "forecast" && needsMoreWork() && raw) {
    try {
      const salvaged = salvageNatalReport(
        parseCandidate(raw, params),
        params.evidence,
        params.tradition,
        params.reportType,
        params.horizonDays
      );
      if (salvaged.ok && isSubstantiveReport(salvaged.report, params)) {
        console.warn(
          `[natal-chart] ${params.reportType} accepted via final evidence salvage (model=${model})`
        );
        validation = salvaged;
        acceptedViaSalvage = true;
      } else if (salvaged.ok) {
        console.warn(
          `[natal-chart] ${params.reportType} final salvage below substantive floor — failing closed (model=${model})`
        );
      }
    } catch {
      /* keep prior validation errors */
    }
  }

  if (
    validation.ok &&
    (isSubstantiveReport(validation.report, params) ||
      (params.reportType === "forecast" && acceptedViaSalvage))
  ) {
    const sanitized = sanitizeNatalReport(validation.report, params);
    // Full-JSON editorial truncates long forecasts; for section-wise run a
    // lightweight timing-trio rewrite instead (roles + anti-dupe).
    let edited: NatalReport | null = null;
    if (usedSectionWise && params.reportType === "forecast") {
      edited = await timingTrioEditorialPass(sanitized, params, model);
    } else if (!usedSectionWise && isSubstantiveReport(sanitized, params)) {
      edited = await editorialPass(sanitized, params, model);
    }
    const finalReport = edited ?? sanitized;
    // Last-chance dedupe: if trio still collides, salvage role-templates for those keys.
    if (
      params.reportType === "forecast" &&
      findNearDuplicateSections(finalReport).length > 0
    ) {
      const salvaged = salvageNatalReport(
        finalReport,
        params.evidence,
        params.tradition,
        params.reportType,
        params.horizonDays
      );
      if (salvaged.ok) {
        return { ok: true, report: { ...salvaged.report, model }, raw };
      }
    }
    return { ok: true, report: { ...finalReport, model }, raw };
  }

  if (validation.ok) {
    validation = {
      ok: false,
      errors: ["Один или несколько разделов отчёта не содержат полноценного текста."],
    };
  }

  console.warn(
    `[natal-chart] ${params.reportType} validation failed (model=${model}):`,
    validation.errors.slice(0, 8).join("; ")
  );
  return {
    ok: false,
    errors: validation.errors,
    raw,
    reason: raw ? "validation" : "llm_empty",
  };
}
