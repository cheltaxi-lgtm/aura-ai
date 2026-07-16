import { getNatalModel } from "@/lib/ai-model";
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import type { NatalEvidence } from "./evidence";
import {
  extractJsonObject,
  NATAL_REPORT_SECTION_KEYS,
  prepareNatalReportCandidate,
  validateNatalReport,
  type NatalReport,
  type NatalReportSection,
  type NatalReportSectionKey,
  type NatalReportValidation,
  type ValidateNatalReportOptions,
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
  clientName?: string;
};

export type GenerateValidatedNatalReportResult =
  | { ok: true; report: NatalReport; raw: string | null }
  | { ok: false; errors: string[]; raw: string | null; reason?: "llm_empty" | "validation" };

const INITIAL_TIMEOUT_MS = 90_000;
const REPAIR_TIMEOUT_MS = 60_000;
const MAX_REPAIR_PASSES = 1;

const PLACEHOLDER_CLAIM_RE = /Ключевой вывод по разделу/i;
const GENERIC_TEXT_RE =
  /(?:натальная карта указывает|вы обладаете потенциалом|могут возникать изменения|сфокусируйтесь на своих целях)/i;
const MIN_SECTION_TEXT_LENGTH = 300;
const MIN_REPORT_TEXT_LENGTH = 2_800;
const EVIDENCE_ID_PAREN_RE =
  /\s*\((?:ne|не)\.(?:timing|western|vedic)\.[a-z0-9._-]+\)/giu;
const EVIDENCE_ID_RE = /(?:ne|не)\.(?:timing|western|vedic)\.[a-z0-9._-]+/giu;

const CHAT_OPTS = {
  maxTokens: 8000,
  jsonObject: true as const,
  allowReasoningFallback: false,
  skipTemperatureRetry: true,
  maxAttempts: 2,
};

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

function isSubstantiveReport(report: NatalReport): boolean {
  const totalLength = report.sections.reduce(
    (sum, section) =>
      sum + section.claims.reduce((sectionSum, claim) => sectionSum + claim.text.trim().length, 0),
    0
  );
  return totalLength >= MIN_REPORT_TEXT_LENGTH && report.sections.every((section) =>
    section.claims.some(
      (claim) =>
        claim.text.trim().length >= MIN_SECTION_TEXT_LENGTH &&
        !PLACEHOLDER_CLAIM_RE.test(claim.text) &&
        !GENERIC_TEXT_RE.test(claim.text) &&
        claim.evidenceIds.length > 0
    )
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function transliterateLatinName(name: string): string {
  const known: Record<string, string> = {
    gennady: "Геннадий",
    gennadiy: "Геннадий",
    genadiy: "Геннадий",
  };
  const pairs: Array<[RegExp, string]> = [
    [/shch/g, "щ"], [/sch/g, "щ"], [/yo/g, "ё"], [/zh/g, "ж"],
    [/kh/g, "х"], [/ts/g, "ц"], [/ch/g, "ч"], [/sh/g, "ш"],
    [/yu/g, "ю"], [/ya/g, "я"], [/ye/g, "е"],
  ];
  const letters: Record<string, string> = {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г",
    h: "х", i: "и", j: "дж", k: "к", l: "л", m: "м", n: "н",
    o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у",
    v: "в", w: "в", x: "кс", y: "ы", z: "з",
  };
  return name.split(/\s+/).map((part) => {
    const lower = part.toLowerCase();
    if (known[lower]) return known[lower];
    let value = lower;
    for (const [pattern, replacement] of pairs) value = value.replace(pattern, replacement);
    value = [...value].map((char) => letters[char] ?? char).join("");
    return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
  }).join(" ");
}

function sanitizeNatalText(text: string, clientName?: string): string {
  let output = text
    .replace(EVIDENCE_ID_PAREN_RE, "")
    .replace(EVIDENCE_ID_RE, "")
    .replace(/\b(?:в|по)\s+(?:вашем\s+)?натальном раскладе\b/giu, "в вашей натальной карте")
    .replace(/\bв вашем раскладе\b/giu, "в вашей натальной карте");
  const rawName = clientName?.trim();
  if (rawName && /[a-z]/i.test(rawName)) {
    const russianName = transliterateLatinName(rawName);
    output = output.replace(new RegExp(rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), russianName);
    const sourceParts = rawName.split(/\s+/);
    const targetParts = russianName.split(/\s+/);
    sourceParts.forEach((part, index) => {
      if (!part || !targetParts[index]) return;
      output = output.replace(
        new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "giu"),
        targetParts[index]!
      );
    });
  }
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
  expectedKey: NatalReportSectionKey
): value is NatalReportSection {
  const section = record(value);
  if (!section || section.key !== expectedKey) return false;
  const title = typeof section.title === "string" ? section.title.trim() : "";
  if (!title) return false;
  const claims = Array.isArray(section.claims) ? section.claims : [];
  return claims.some((value) => {
    const claim = record(value);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    return (
      text.length >= MIN_SECTION_TEXT_LENGTH &&
      !PLACEHOLDER_CLAIM_RE.test(text) &&
      !GENERIC_TEXT_RE.test(text)
    );
  });
}

async function requestNatalReportJson(
  messages: ChatMessage[],
  timeoutMs: number,
  temperature: number,
  model: string
): Promise<string | null> {
  const thread: ChatMessage[] = [...messages];
  let combined = "";

  for (let pass = 0; pass < 3; pass++) {
    const result = await completeChatDetailed({
      messages: thread,
      ...CHAT_OPTS,
      modelOverride: model,
      temperature,
      timeoutMs,
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
    if (pass >= 2) return combined || null;

    thread.push({ role: "assistant", content: combined });
    thread.push({ role: "user", content: JSON_CONTINUE_USER_PROMPT });
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
    "Каждый раздел должен содержать глубокий персональный текст: 5–8 предложений, минимум 350 знаков, конкретные факторы из evidence и практический вывод.",
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
    currentPeriod: ["timing"],
  };
  const allowedCategories = categoryHints[key];
  const allowedIds = allowedCategories
    ? params.evidence
        .filter((item) => allowedCategories.includes(item.category))
        .map((item) => item.id)
    : params.evidence.map((item) => item.id);
  const timingRule =
    params.reportType === "forecast" &&
    (key === "summary" || key === "currentPeriod" || key === "recommendations")
      ? "Каждый claim обязан ссылаться минимум на один timing evidence ID с префиксом ne.timing."
      : "";
  return [
    `Предыдущий JSON не содержал полноценный раздел "${key}".`,
    "Создай ТОЛЬКО этот раздел как JSON-объект без markdown:",
    `{"key":"${key}","title":"выразительный русский заголовок","claims":[{"text":"глубокий персональный разбор объёмом 5–8 предложений и не менее 350 знаков","evidenceIds":["точный ID из EVIDENCE"]}]}`,
    "Свяжи конкретные evidence, их символическое значение, проявление в жизни и практический вывод.",
    "Не используй универсальные, шаблонные или технические фразы.",
    "Не повторяй содержание других разделов.",
    "Не выдумывай факты и ID. Используй только EVIDENCE из системного сообщения.",
    allowedCategories
      ? `Для раздела "${key}" разрешены только evidence категорий: ${allowedCategories.join(", ")}.`
      : "",
    allowedIds.length
      ? `Точные допустимые evidenceIds для этого раздела:\n${allowedIds.join("\n")}`
      : "",
    timingRule,
  ].filter(Boolean).join("\n");
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
    (key) => invalidKeys.has(key) || !isSubstantiveSection(byKey.get(key), key)
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
        model
      );
      if (!replacementRaw) return [key, null] as const;
      try {
        const replacement = extractJsonObject(replacementRaw);
        return [
          key,
          isSubstantiveSection(replacement, key) ? replacement : null,
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

async function editorialPass(
  report: NatalReport,
  params: GenerateValidatedNatalReportParams,
  model: string
): Promise<NatalReport | null> {
  const traditionRule = params.tradition === "vedic"
    ? "Это отчёт джйотиш: используй только ведические положения, накшатры и даши из evidence. Не добавляй западные транзиты и западные дома."
    : "Это западная тропическая интерпретация: не добавляй накшатры, даши или другие термины джйотиш.";
  const nameRule =
    params.clientName && /[a-z]/i.test(params.clientName)
      ? `Имя клиента записано латиницей как "${params.clientName}". В тексте пиши его кириллицей; если не уверен — обращайся без имени.`
      : "";
  const prompt = [
    "Отредактируй готовый JSON-отчёт и верни весь JSON целиком без markdown.",
    "Сохрани ровно 8 разделов, их key и массивы evidenceIds.",
    "Удали смысловые повторы: у каждого раздела должен быть свой набор тем и конкретных факторов.",
    "Не сокращай текст: общий объём claims должен остаться не менее 2800 знаков.",
    "Не показывай технические evidence ID внутри поля text — они допустимы только в evidenceIds.",
    "Не используй слово «расклад»: это натальный отчёт или прогноз.",
    "Сделай русский язык естественным, редакторским, без канцелярита и универсальных советов.",
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
    model
  );
  if (!editedRaw) return null;

  try {
    const candidate = parseCandidate(editedRaw, params);
    const validation = validateCandidate(candidate, params);
    if (!validation.ok) return null;
    const sanitized = sanitizeNatalReport(validation.report, params);
    return isSubstantiveReport(sanitized) ? sanitized : null;
  } catch {
    return null;
  }
}

export async function generateValidatedNatalReport(
  params: GenerateValidatedNatalReportParams
): Promise<GenerateValidatedNatalReportResult> {
  const model = await getNatalModel();
  let raw: string | null = await requestNatalReportJson(
    params.baseMessages,
    INITIAL_TIMEOUT_MS,
    0.3,
    model
  );

  if (!raw) {
    console.warn(`[natal-chart] ${params.reportType} LLM empty (model=${model})`);
    return { ok: false, errors: ["LLM не вернула JSON."], raw, reason: "llm_empty" };
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

  for (let repairPass = 0; !validation.ok && repairPass < MAX_REPAIR_PASSES; repairPass += 1) {
    raw = await requestNatalReportJson(
      [
        ...params.baseMessages,
        { role: "assistant", content: raw },
        { role: "user", content: buildRepairMessage(validation.errors, params) },
      ],
      REPAIR_TIMEOUT_MS,
      repairPass === 0 ? 0.12 : 0.08,
      model
    );
    if (!raw) break;
    try {
      validation = validateCandidate(parseCandidate(raw, params), params);
    } catch (error) {
      validation = {
        ok: false,
        errors: [error instanceof Error ? error.message : "Некорректный JSON."],
      };
    }
  }

  if ((!validation.ok || (validation.ok && !isSubstantiveReport(validation.report))) && raw) {
    try {
      const repairedCandidate = await repairMissingSections(
        raw,
        params,
        model,
        validation.ok ? [] : validation.errors
      );
      const strict = validateCandidate(repairedCandidate ?? parseCandidate(raw, params), params);
      if (strict.ok && isSubstantiveReport(strict.report)) {
        validation = strict;
      }
    } catch {
      /* keep prior validation errors */
    }
  }

  if (validation.ok && isSubstantiveReport(validation.report)) {
    const sanitized = sanitizeNatalReport(validation.report, params);
    const edited = await editorialPass(sanitized, params, model);
    return { ok: true, report: edited ?? sanitized, raw };
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
    reason: "validation",
  };
}
