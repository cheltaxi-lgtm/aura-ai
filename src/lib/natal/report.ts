import { toParagraphs } from "@/lib/format-paragraphs";
import { normalizeClientTyAddress } from "@/lib/reading-quality-gate";
import type { NatalEvidence } from "./evidence";
import {
  findNearDuplicateSections,
  FORECAST_SECTION_ROLE_CONTRACTS,
  FORECAST_SECTION_TITLES,
  natalSectionRoleSubtitle,
  NATAL_FLUFF_RE,
  NATAL_HUMAN_VOICE,
  SECTION_ROLE_CONTRACTS,
  type NatalSectionKey,
} from "./report-quality";
import type { NatalTradition } from "./types";

export const NATAL_REPORT_VERSION = "1.0";
export const NATAL_REPORT_SECTION_KEYS = [
  "summary", "personality", "relationships", "career", "resources",
  "tensions", "currentPeriod", "recommendations",
] as const;
export type NatalReportSectionKey = (typeof NATAL_REPORT_SECTION_KEYS)[number];

const FORECAST_TIMING_SECTION_KEYS = new Set<NatalReportSectionKey>([
  "summary",
  "currentPeriod",
  "recommendations",
]);

export interface NatalReportClaim {
  text: string;
  evidenceIds: string[];
}

export interface NatalReportSection {
  key: NatalReportSectionKey;
  title: string;
  claims: NatalReportClaim[];
}

export interface NatalReport {
  version: typeof NATAL_REPORT_VERSION;
  tradition: NatalTradition;
  reportType: "interpretation" | "forecast";
  horizonDays?: 7 | 30 | 90 | 365;
  sections: NatalReportSection[];
  disclaimer: string;
  methodology: string;
  /** LLM model that produced the text — provenance for audits/regressions. */
  model?: string;
}

export type NatalReportValidation =
  | { ok: true; report: NatalReport }
  | { ok: false; errors: string[] };

export type ValidateNatalReportOptions = {
  coerceEvidence?: boolean;
  skipCategoryRules?: boolean;
};

const SECTION_CATEGORY_HINTS: Partial<Record<NatalReportSectionKey, Set<string>>> = {
  personality: new Set(["identity", "emotions"]),
  relationships: new Set(["relationships", "emotions"]),
  career: new Set(["career", "identity"]),
  resources: new Set(["resources", "career"]),
  tensions: new Set(["tensions", "emotions"]),
  currentPeriod: new Set(["timing"]),
};

const SECTION_TITLES: Record<NatalReportSectionKey, string> = {
  summary: "Краткое резюме",
  personality: "Личность",
  relationships: "Отношения",
  career: "Карьера",
  resources: "Ресурсы",
  tensions: "Напряжения",
  currentPeriod: "Текущий период",
  recommendations: "Рекомендации",
};

function sectionTitle(
  key: NatalReportSectionKey,
  reportType: NatalReport["reportType"] = "interpretation"
): string {
  return reportType === "forecast" ? FORECAST_SECTION_TITLES[key] : SECTION_TITLES[key];
}

function resolveEvidenceId(
  rawId: string,
  validIds: Set<string>
): string | null {
  if (validIds.has(rawId)) return rawId;
  const normalized = rawId.trim().toLowerCase();
  for (const id of validIds) {
    if (id.toLowerCase() === normalized) return id;
  }
  const slug = normalized.split(".").pop();
  if (!slug) return null;
  for (const id of validIds) {
    if (id.toLowerCase().endsWith(`.${slug}`)) return id;
  }
  return null;
}

function defaultEvidenceIdForSection(
  sectionKey: NatalReportSectionKey,
  evidence: readonly NatalEvidence[],
  expectedReportType: NatalReport["reportType"]
): string | null {
  if (
    expectedReportType === "forecast" &&
    FORECAST_TIMING_SECTION_KEYS.has(sectionKey)
  ) {
    return evidence.find((item) => item.tradition === "timing")?.id ?? evidence[0]?.id ?? null;
  }
  const categories = SECTION_CATEGORY_HINTS[sectionKey];
  if (categories) {
    return (
      evidence.find((item) => categories.has(item.category))?.id ??
      evidence[0]?.id ??
      null
    );
  }
  return evidence[0]?.id ?? null;
}

function coerceClaimEvidenceIds(
  evidenceIds: string[],
  sectionKey: NatalReportSectionKey,
  evidence: readonly NatalEvidence[],
  expectedReportType: NatalReport["reportType"],
  validIds: Set<string>
): string[] {
  const resolved = [...new Set(
    evidenceIds
      .map((id) => resolveEvidenceId(id, validIds))
      .filter((id): id is string => Boolean(id))
  )];
  // Forecast timing sections must cite a timing evidence even when the model
  // supplied only valid non-timing IDs — otherwise the timing rule rejects the
  // report after every salvage pass (the dominant invalid_model_report mode).
  if (
    expectedReportType === "forecast" &&
    FORECAST_TIMING_SECTION_KEYS.has(sectionKey) &&
    !resolved.some((id) => evidence.find((item) => item.id === id)?.tradition === "timing")
  ) {
    const timingId = evidence.find((item) => item.tradition === "timing")?.id;
    if (timingId) resolved.push(timingId);
  }
  if (resolved.length) return resolved;
  const fallback = defaultEvidenceIdForSection(sectionKey, evidence, expectedReportType);
  return fallback ? [fallback] : [];
}

export function prepareNatalReportCandidate(
  value: unknown,
  params: {
    tradition: NatalTradition;
    reportType: NatalReport["reportType"];
    horizonDays?: NatalReport["horizonDays"];
    metadataDefaults?: { disclaimer: string; methodology: string };
  }
): unknown {
  const withDefaults = params.metadataDefaults
    ? withReportMetadataDefaults(value, params.metadataDefaults)
    : value;
  const root = record(withDefaults);
  if (!root) return withDefaults;

  const sections = Array.isArray(root.sections) ? root.sections : [];
  const byKey = new Map<NatalReportSectionKey, Record<string, unknown>>();
  for (const item of sections) {
    const section = record(item);
    if (!section) continue;
    const key = section.key;
    if (typeof key === "string" && NATAL_REPORT_SECTION_KEYS.includes(key as NatalReportSectionKey)) {
      byKey.set(key as NatalReportSectionKey, section);
    }
  }
  const normalizedSections = NATAL_REPORT_SECTION_KEYS.map((expectedKey) => {
    const existing = byKey.get(expectedKey);
    if (existing) return existing;
    return {
      key: expectedKey,
      title: sectionTitle(expectedKey, params.reportType),
      claims: [],
    };
  });

  return {
    ...root,
    version: NATAL_REPORT_VERSION,
    tradition: params.tradition,
    reportType: params.reportType,
    sections: normalizedSections,
    ...(params.reportType === "forecast" ? { horizonDays: params.horizonDays ?? root.horizonDays } : {}),
  };
}

export function salvageNatalReport(
  value: unknown,
  evidence: readonly NatalEvidence[],
  expectedTradition: NatalTradition,
  expectedReportType: NatalReport["reportType"] = "interpretation",
  expectedHorizonDays?: NatalReport["horizonDays"]
): NatalReportValidation {
  const root = record(value) ?? {};

  const prepared = prepareNatalReportCandidate(root, {
    tradition: expectedTradition,
    reportType: expectedReportType,
    horizonDays: expectedHorizonDays,
    metadataDefaults: {
      disclaimer:
        typeof root.disclaimer === "string" && root.disclaimer.trim()
          ? root.disclaimer
          : "Символическая интерпретация не заменяет профессиональную консультацию.",
      methodology:
        typeof root.methodology === "string" && root.methodology.trim()
          ? root.methodology
          : "Выводы привязаны к рассчитанным астрологическим evidence.",
    },
  }) as Record<string, unknown>;

  const validIds = new Set(evidence.map((item) => item.id));
  const sections = Array.isArray(prepared.sections) ? prepared.sections : [];
  const sectionsByKey = new Map<NatalReportSectionKey, Record<string, unknown>>();
  for (const item of sections) {
    const section = record(item);
    if (!section) continue;
    const key = section.key;
    if (typeof key === "string" && NATAL_REPORT_SECTION_KEYS.includes(key as NatalReportSectionKey)) {
      sectionsByKey.set(key as NatalReportSectionKey, section);
    }
  }
  prepared.sections = NATAL_REPORT_SECTION_KEYS.map((expectedKey) => {
    const rawSection = sectionsByKey.get(expectedKey) ?? record(sections[NATAL_REPORT_SECTION_KEYS.indexOf(expectedKey)]);
    const rawClaims = Array.isArray(rawSection?.claims) ? rawSection.claims : [];
    const firstClaim = record(rawClaims[0]);
    const evidenceIds = coerceClaimEvidenceIds(
      Array.isArray(firstClaim?.evidenceIds)
        ? firstClaim.evidenceIds.filter((id): id is string => typeof id === "string")
        : [],
      expectedKey,
      evidence,
      expectedReportType,
      validIds
    );
    const primaryId = evidenceIds[0] ?? evidence[0]?.id;
    const item =
      (primaryId ? evidence.find((entry) => entry.id === primaryId) : null) ?? evidence[0];
    const rawText =
      typeof firstClaim?.text === "string" && firstClaim.text.trim()
        ? firstClaim.text.trim()
        : "";
    const keepRaw =
      rawText &&
      rawText.length >= 120 &&
      !/Ключевой вывод по разделу/i.test(rawText) &&
      !NATAL_FLUFF_RE.test(rawText);
    const text =
      keepRaw && item
        ? rawText
        : item
          ? buildEvidenceGroundedClaimText(
              item,
              expectedKey,
              expectedReportType,
              expectedHorizonDays
            )
          : buildFallbackSectionText(expectedKey, expectedReportType, expectedHorizonDays);
    return {
      key: expectedKey,
      title:
        typeof rawSection?.title === "string" && rawSection.title.trim()
          ? rawSection.title.trim()
          : sectionTitle(expectedKey, expectedReportType),
      claims: [{ text, evidenceIds: evidenceIds.length ? evidenceIds : primaryId ? [primaryId] : [] }],
    };
  });

  // Collapse near-duplicates in the timing trio (and other pairs) into role-specific templates.
  const draft = {
    sections: prepared.sections as Array<{
      key: NatalReportSectionKey;
      claims: Array<{ text: string; evidenceIds: string[] }>;
    }>,
  };
  const dupes = findNearDuplicateSections(draft, 0.62);
  if (dupes.length) {
    const forceKeys = new Set<NatalReportSectionKey>();
    const timingTrioHit = dupes.some(
      (pair) =>
        (pair.a === "summary" || pair.a === "currentPeriod" || pair.a === "recommendations") &&
        (pair.b === "summary" || pair.b === "currentPeriod" || pair.b === "recommendations")
    );
    if (timingTrioHit) {
      // Identical timing essays → rebuild all three with role-specific templates.
      forceKeys.add("summary");
      forceKeys.add("currentPeriod");
      forceKeys.add("recommendations");
    }
    for (const pair of dupes) {
      forceKeys.add(pair.a);
      forceKeys.add(pair.b);
    }
    prepared.sections = (prepared.sections as Array<Record<string, unknown>>).map((section) => {
      const key = section.key as NatalReportSectionKey;
      if (!forceKeys.has(key)) return section;
      const evidenceIds = Array.isArray(section.claims)
        ? ((record((section.claims as unknown[])[0])?.evidenceIds as string[] | undefined) ?? [])
        : [];
      const primaryId = evidenceIds[0] ?? evidence[0]?.id;
      const item =
        (primaryId ? evidence.find((entry) => entry.id === primaryId) : null) ?? evidence[0];
      if (!item) return section;
      return {
        ...section,
        claims: [
          {
            text: buildEvidenceGroundedClaimText(
              item,
              key,
              expectedReportType,
              expectedHorizonDays
            ),
            evidenceIds: evidenceIds.length ? evidenceIds : [item.id],
          },
        ],
      };
    });
  }

  return validateNatalReport(
    prepared,
    evidence,
    expectedTradition,
    expectedReportType,
    expectedHorizonDays,
    { coerceEvidence: true, skipCategoryRules: true }
  );
}

function buildFallbackSectionText(
  sectionKey: NatalReportSectionKey,
  reportType: NatalReport["reportType"],
  horizonDays?: NatalReport["horizonDays"]
): string {
  const horizonBit =
    reportType === "forecast" && horizonDays ? ` на горизонте ${horizonDays} дней` : "";
  return `Раздел «${sectionTitle(sectionKey, reportType)}»${horizonBit} опирается на рассчитанные факторы. Скажи простыми словами, что человек может заметить в жизни, и один раз сошлись на фактор из evidence.`;
}

function buildEvidenceGroundedClaimText(
  item: NatalEvidence,
  sectionKey: NatalReportSectionKey,
  reportType: NatalReport["reportType"],
  horizonDays?: NatalReport["horizonDays"]
): string {
  const horizonBit =
    reportType === "forecast" && horizonDays ? ` на ${horizonDays} дней` : "";
  const uncertainty = item.uncertainty?.trim()
    ? ` ${item.uncertainty.trim().replace(/\.*$/, ".")}`
    : "";
  const fact = `${item.label}: ${item.value}.${uncertainty}`.replace(/\s+/g, " ").trim();

  switch (sectionKey) {
    case "summary":
      return [
        `Простыми словами${horizonBit}: тема «${item.label}» может задавать тон обычным дням.`,
        fact,
        "Это ориентир, не обещание событий. Подробности дат — ниже, шаги — в конце.",
      ].join(" ");
    case "currentPeriod":
      return [
        `В эти дни имеет смысл заметить тему «${item.label}» — не как прогноз судьбы, а как календарную веху.`,
        fact,
        "Сверяй ощущения с датой из расчёта. Советы вынесены отдельно.",
      ].join(" ");
    case "recommendations":
      return [
        `Сделай одно конкретное дело вокруг темы «${item.label}»${horizonBit}: заложив час в календарь и проверив в конце окна, что подтвердилось.`,
        fact,
        "Не растягивай решение на весь срок — привяжи шаг к этой теме.",
      ].join(" ");
    case "tensions":
      return [
        `Там, где всплывает «${item.label}», чаще всего тесно. Назови себе одно место трения и сузь реакцию до одного шага.`,
        fact,
      ].join(" ");
    case "personality":
      return [
        `В характере это может читаться как привычный стиль вокруг темы «${item.label}». Опирайся на него, а не жди от себя противоположного без причины.`,
        fact,
      ].join(" ");
    case "relationships":
      return [
        `В близости тема «${item.label}» часто задаёт ритм сближения и дистанции. Замечай повтор и называй его в разговоре без обвинений.`,
        fact,
      ].join(" ");
    case "career":
      return [
        `В деле «${item.label}» подсказывает, где ты держишь рамку и где растёт нагрузка. Выбери один рабочий фокус.`,
        fact,
      ].join(" ");
    case "resources":
      return [
        `По силам и деньгам «${item.label}» показывает, куда утекает ресурс. Отслеживай один контур и сверяй его с расчётом.`,
        fact,
      ].join(" ");
    default:
      return [
        `Сверяй выводы с темой «${item.label}» и не подменяй её общими словами.`,
        fact,
      ].join(" ");
  }
}

/** Deterministic last-resort report that always validates when evidence is non-empty. */
/** @deprecated Fail-closed delivery — do not call from production success paths. */
export function buildMinimalNatalReport(
  evidence: readonly NatalEvidence[],
  tradition: NatalTradition,
  reportType: NatalReport["reportType"] = "interpretation",
  horizonDays?: NatalReport["horizonDays"],
  metadataDefaults?: { disclaimer: string; methodology: string }
): NatalReportValidation {
  if (!evidence.length) {
    return { ok: false, errors: ["Нет evidence для сборки отчёта."] };
  }
  const disclaimer =
    metadataDefaults?.disclaimer ??
    "Символическая интерпретация не заменяет профессиональную консультацию.";
  const methodology =
    metadataDefaults?.methodology ??
    "Выводы привязаны к рассчитанным астрологическим evidence.";
  const validIds = new Set(evidence.map((item) => item.id));
  const sections: NatalReportSection[] = NATAL_REPORT_SECTION_KEYS.map((key) => {
    const evidenceIds = coerceClaimEvidenceIds([], key, evidence, reportType, validIds);
    const primaryId = evidenceIds[0] ?? evidence[0].id;
    const item = evidence.find((entry) => entry.id === primaryId) ?? evidence[0];
    return {
      key,
      title: reportType === "forecast" ? FORECAST_SECTION_TITLES[key] : SECTION_TITLES[key],
      claims: [{
        text: buildEvidenceGroundedClaimText(
          item,
          key,
          reportType,
          horizonDays
        ),
        evidenceIds: [primaryId],
      }],
    };
  });
  return {
    ok: true,
    report: {
      version: NATAL_REPORT_VERSION,
      tradition,
      reportType,
      ...(reportType === "forecast" ? { horizonDays } : {}),
      sections,
      disclaimer,
      methodology,
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(trimmed); } catch { /* scan below */ }
  const start = trimmed.indexOf("{");
  if (start < 0) throw new Error("JSON object not found");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quoted) { escaped = true; continue; }
    if (char === "\"") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return JSON.parse(trimmed.slice(start, index + 1));
  }
  throw new Error("Incomplete JSON object");
}

export function withReportMetadataDefaults(
  value: unknown,
  defaults: { disclaimer: string; methodology: string }
): unknown {
  const root = record(value);
  if (!root) return value;
  return {
    ...root,
    disclaimer:
      typeof root.disclaimer === "string" && root.disclaimer.trim()
        ? root.disclaimer
        : defaults.disclaimer,
    methodology:
      typeof root.methodology === "string" && root.methodology.trim()
        ? root.methodology
        : defaults.methodology,
  };
}

export function validateNatalReport(
  value: unknown,
  evidence: readonly NatalEvidence[],
  expectedTradition: NatalTradition,
  expectedReportType: NatalReport["reportType"] = "interpretation",
  expectedHorizonDays?: NatalReport["horizonDays"],
  options: ValidateNatalReportOptions = {}
): NatalReportValidation {
  const errors: string[] = [];
  const rootInput = record(value);
  if (!rootInput) return { ok: false, errors: ["Корень ответа должен быть JSON-объектом."] };

  const root: Record<string, unknown> = { ...rootInput };
  if (options.coerceEvidence || root.version !== NATAL_REPORT_VERSION) {
    root.version = NATAL_REPORT_VERSION;
  }
  if (options.coerceEvidence || root.tradition !== expectedTradition) {
    root.tradition = expectedTradition;
  }
  if (options.coerceEvidence || root.reportType !== expectedReportType) {
    root.reportType = expectedReportType;
  }
  if (expectedReportType === "forecast" && options.coerceEvidence) {
    root.horizonDays = expectedHorizonDays;
  }

  if (!options.coerceEvidence && root.version !== NATAL_REPORT_VERSION) {
    errors.push(`version должен быть "${NATAL_REPORT_VERSION}".`);
  }
  if (!options.coerceEvidence && root.tradition !== expectedTradition) {
    errors.push(`tradition должен быть "${expectedTradition}".`);
  }
  if (!options.coerceEvidence && root.reportType !== expectedReportType) {
    errors.push(`reportType должен быть "${expectedReportType}".`);
  }
  if (
    expectedReportType === "forecast" &&
    !options.coerceEvidence &&
    (root.horizonDays !== expectedHorizonDays || ![7, 30, 90, 365].includes(Number(root.horizonDays)))
  ) {
    errors.push(`horizonDays должен быть ${expectedHorizonDays}.`);
  }
  if (typeof root.disclaimer !== "string" || !root.disclaimer.trim()) errors.push("disclaimer обязателен.");
  if (typeof root.methodology !== "string" || !root.methodology.trim()) errors.push("methodology обязательна.");

  const ids = new Set(evidence.map((item) => item.id));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const sectionList = Array.isArray(root.sections) ? root.sections : [];
  const sectionsByKey = new Map<string, Record<string, unknown>>();
  for (const item of sectionList) {
    const section = record(item);
    if (section && typeof section.key === "string") {
      sectionsByKey.set(section.key, section);
    }
  }
  const missingKeys = NATAL_REPORT_SECTION_KEYS.filter((key) => !sectionsByKey.has(key));
  if (missingKeys.length) {
    errors.push(`Отсутствуют разделы: ${missingKeys.join(", ")}.`);
  }
  const parsedSections: NatalReportSection[] = [];
  for (let index = 0; index < NATAL_REPORT_SECTION_KEYS.length; index += 1) {
    const expectedKey = NATAL_REPORT_SECTION_KEYS[index];
    const rawSection = sectionsByKey.get(expectedKey) ?? record(sectionList[index]);
    if (!rawSection || rawSection.key !== expectedKey) {
      errors.push(`Раздел ${index + 1} должен иметь key="${expectedKey}" и правильный порядок.`);
      continue;
    }
    const titleRaw = typeof rawSection.title === "string" ? rawSection.title.trim() : "";
    const title = titleRaw || (options.coerceEvidence ? sectionTitle(expectedKey, expectedReportType) : "");
    if (!title) errors.push(`Раздел ${expectedKey}: title обязателен.`);
    const rawClaims = Array.isArray(rawSection.claims) ? rawSection.claims : [];
    if (!rawClaims.length) errors.push(`Раздел ${expectedKey}: нужен минимум один claim.`);
    const claims: NatalReportClaim[] = [];
    for (let claimIndex = 0; claimIndex < rawClaims.length; claimIndex += 1) {
      const rawClaim = record(rawClaims[claimIndex]);
      const textRaw = typeof rawClaim?.text === "string" ? rawClaim.text.trim() : "";
      const text = textRaw || (options.coerceEvidence ? `Ключевой вывод по разделу «${sectionTitle(expectedKey, expectedReportType)}».` : "");
      let evidenceIds = Array.isArray(rawClaim?.evidenceIds)
        ? [...new Set(rawClaim.evidenceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
        : [];
      if (options.coerceEvidence) {
        evidenceIds = coerceClaimEvidenceIds(
          evidenceIds,
          expectedKey,
          evidence,
          expectedReportType,
          ids
        );
      }
      if (!text) errors.push(`${expectedKey}.claims[${claimIndex}]: text не может быть пустым.`);
      if (!evidenceIds.length) errors.push(`${expectedKey}.claims[${claimIndex}]: нужна минимум одна ссылка на evidence.`);
      const unknown = evidenceIds.filter((id) => !ids.has(id));
      if (!options.coerceEvidence && unknown.length) {
        errors.push(`${expectedKey}.claims[${claimIndex}]: неизвестные evidence ID: ${unknown.join(", ")}.`);
      }
      const allowed = !options.skipCategoryRules && expectedReportType === "interpretation"
        ? SECTION_CATEGORY_HINTS[expectedKey]
        : undefined;
      if (allowed && !unknown.length) {
        const okCitation =
          expectedKey === "currentPeriod"
            ? evidenceIds.some((id) => {
                const item = evidenceById.get(id);
                return Boolean(
                  item && (item.category === "timing" || item.tradition === "timing")
                );
              })
            : evidenceIds.some((id) => allowed.has(evidenceById.get(id)?.category ?? ""));
        if (!okCitation) {
          errors.push(`${expectedKey}.claims[${claimIndex}]: citation не относится к тематике раздела.`);
        }
      }
      if (
        expectedReportType === "forecast" &&
        FORECAST_TIMING_SECTION_KEYS.has(expectedKey) &&
        !unknown.length &&
        !evidenceIds.some((id) => evidenceById.get(id)?.tradition === "timing")
      ) {
        errors.push(
          `${expectedKey}.claims[${claimIndex}]: в этом разделе прогноза нужна ссылка на timing evidence.`
        );
      }
      if (text && evidenceIds.length && (options.coerceEvidence || !unknown.length)) {
        claims.push({ text, evidenceIds });
      }
    }
    parsedSections.push({ key: expectedKey, title, claims });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    report: {
      version: NATAL_REPORT_VERSION,
      tradition: expectedTradition,
      reportType: expectedReportType,
      ...(expectedReportType === "forecast" ? { horizonDays: expectedHorizonDays } : {}),
      sections: parsedSections,
      disclaimer: (root.disclaimer as string).trim(),
      methodology: (root.methodology as string).trim(),
      // Preserve model provenance across re-validation/salvage of a stamped report.
      ...(typeof root.model === "string" && root.model.trim()
        ? { model: root.model.trim().slice(0, 120) }
        : {}),
    },
  };
}

const LEGACY_NATAL_SECTION_MARKERS: Array<{ re: RegExp; title: string }> = [
  { re: /Асцендент|в первом доме|1[-‑ ]?доме/i, title: "Личность и внешний образ" },
  { re: /стеллиум|ядро твоей личности/i, title: "Ядро личности" },
  { re: /\bЛун[аыуе]\b|эмоциональн/i, title: "Эмоции и потребности" },
  { re: /Венер|отношен|партн|седьмой дом|7[-‑ ]?доме/i, title: "Отношения" },
  {
    re: /карьер|професс|десятый дом|10[-‑ ]?доме|середина неба|\bMC\b/i,
    title: "Карьера и призвание",
  },
  { re: /Сатурн|напряжен|урок|вызов|ограничен/i, title: "Напряжения и уроки" },
  { re: /ресурс|второй дом|2[-‑ ]?доме|деньг|финанс/i, title: "Ресурсы" },
  { re: /совет|рекоменд|практик|важно помнить|в итоге/i, title: "Рекомендации" },
];

function emphasizeNatalTerms(text: string): string {
  return text.replace(
    /(?<![\w*])(Асцендент|Середина неба|Солнце|Луна|Луны|Луну|Меркурий|Венера|Венеры|Марс|Марса|Юпитер|Сатурн|Уран|Нептун|Плутон|стеллиум)(?![\w*])/giu,
    "**$1**"
  );
}

/**
 * Legacy natal interpretations were saved as a single wall of prose
 * (no structured_data, often no newlines). Turn them into mystic markdown
 * so they render like modern spread readings.
 */
export function formatLegacyNatalProseForDisplay(raw: string): string {
  const input = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!input) return raw;
  if ((input.match(/^#{1,3}\s/gm) ?? []).length >= 2) {
    return normalizeClientTyAddress(input);
  }

  const paras = toParagraphs(input);
  if (!paras.length) return input;

  const chunks: string[] = [];
  let lastTitle = "";

  paras.forEach((para, index) => {
    let title: string | null = null;
    if (index === 0) {
      title = "Вступление";
    } else {
      for (const marker of LEGACY_NATAL_SECTION_MARKERS) {
        if (marker.re.test(para) && marker.title !== lastTitle) {
          title = marker.title;
          break;
        }
      }
    }

    const body = emphasizeNatalTerms(para);
    if (title && title !== lastTitle) {
      if (chunks.length) chunks.push("---");
      chunks.push(`## ${title}\n\n${body}`);
      lastTitle = title;
    } else {
      chunks.push(body);
    }
  });

  return normalizeClientTyAddress(chunks.join("\n\n"));
}

/** One report section as mystic markdown (same pipeline as spread readings). */
export function formatNatalSectionForDisplay(section: {
  key?: string;
  title: string;
  claims: Array<{ text: string }>;
}, reportType?: NatalReport["reportType"]): string {
  const title = section.title.trim();
  const subtitle = natalSectionRoleSubtitle(section.key, reportType);
  const body = section.claims
    .map((claim) => claim.text.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!title && !body) return "";
  if (!title) return body;
  const headed = subtitle ? `## ${title}\n\n*${subtitle}*` : `## ${title}`;
  if (!body) return headed;
  return `${headed}\n\n${body}`;
}

/** Full structured natal report as premium reading markdown. */
export function formatNatalReportForDisplay(report: NatalReport): string {
  const sections = report.sections
    .map((section) => formatNatalSectionForDisplay(section, report.reportType))
    .filter(Boolean);
  const footer = [
    report.methodology.trim()
      ? `## Методология\n\n${report.methodology.trim()}`
      : "",
    report.disclaimer.trim() ? `## Важно\n\n${report.disclaimer.trim()}` : "",
  ].filter(Boolean);
  return normalizeClientTyAddress([...sections, ...footer].join("\n\n---\n\n"));
}

export function natalReportToPlainText(report: NatalReport): string {
  return formatNatalReportForDisplay(report);
}

export function buildNatalReportJsonInstructions(
  tradition: NatalTradition,
  reportType: NatalReport["reportType"] = "interpretation",
  horizonDays?: NatalReport["horizonDays"]
): string {
  const horizonField = reportType === "forecast" ? `,"horizonDays":${horizonDays}` : "";
  const shortForecast = reportType === "forecast" && (horizonDays ?? 30) <= 7;
  const longForecast = reportType === "forecast" && (horizonDays ?? 30) >= 90;
  const sectionDepth = shortForecast
    ? "каждый раздел — плотный текст 4–7 предложений и не менее 320 знаков: назови фактор из evidence и сделай один точный вывод без воды"
    : longForecast
      ? "каждый раздел — плотный текст 3–5 предложений и не менее 220 знаков; приоритет — конкретика, не объём"
      : reportType === "forecast"
        ? "каждый раздел — плотный текст 3–5 предложений и не менее 220 знаков: фактор из evidence → вывод; без канцелярита"
        : "каждый раздел — плотный текст 4–6 предложений и не менее 220 знаков: фактор из evidence → вывод; без канцелярита";
  const totalDepth = shortForecast
    ? "общий объём текста восьми разделов — не менее 2400 знаков"
    : longForecast
      ? "общий объём текста восьми разделов — не менее 1800 знаков; приоритет — полный валидный JSON и разные роли разделов"
      : reportType === "forecast"
        ? "общий объём текста восьми разделов — не менее 1800 знаков"
        : "общий объём текста восьми разделов — не менее 2000 знаков";
  const roles = reportType === "forecast" ? FORECAST_SECTION_ROLE_CONTRACTS : SECTION_ROLE_CONTRACTS;
  const roleBlock = NATAL_REPORT_SECTION_KEYS.map(
    (key) => `- ${key}: ${roles[key as NatalSectionKey]}`
  ).join("\n");
  const titleHint = reportType === "forecast"
    ? NATAL_REPORT_SECTION_KEYS.map((key) => `${key}→«${FORECAST_SECTION_TITLES[key]}»`).join("; ")
    : NATAL_REPORT_SECTION_KEYS.map((key) => `${key}→«${SECTION_TITLES[key]}»`).join("; ");
  return `Верни ТОЛЬКО JSON-объект без markdown.
${NATAL_HUMAN_VOICE}
Схема:
{"version":"${NATAL_REPORT_VERSION}","tradition":"${tradition}","reportType":"${reportType}"${horizonField},"sections":[
${NATAL_REPORT_SECTION_KEYS.map((key) => `{"key":"${key}","title":"локализованный заголовок","claims":[{"text":"вывод на русском","evidenceIds":["точный ID из блока evidence"]}]}`).join(",\n")}
],"disclaimer":"не научный прогноз и не замена профессиональной консультации","methodology":"как использованы расчёты и ограничения"}
Роли разделов (обязательны, не смешивай):
${roleBlock}
Правила качества:
- все восемь разделов обязательны и идут в указанном порядке;
- ${sectionDepth};
- ${totalDepth};
- заголовки разделов человеческие: ${titleHint};
- плотность важнее объёма: убери воду, повторы и общие фразы;
- в тексте claim сначала жизненный вывод, затем одна короткая отсылка к фактору из evidence (планета, знак, аспект или дата) — не только ID в JSON и не лекция по астрологии;
- запрещено слово «расклад»;
- используй имя клиента из пользовательского сообщения естественно, но не в каждом разделе; имя — Title Case, не КАПСОМ;
- обращайся к клиенту строго на «ты» (ты/тебе/твой/твоя/твои); запрещены «вы/вам/вас/ваш/ваша/ваши» в обращении к клиенту;
- запрещены универсальные фразы: «у тебя есть потенциал», «возможны изменения», «сосредоточься на целях», «практический акцент», «интерпретация символическая»;
- разделы НЕ должны повторять друг друга по смыслу или формулировкам; summary ≠ recommendations ≠ currentPeriod;
- в каждом разделе минимум один непустой claim; у каждого claim один или несколько существующих evidenceIds;
- не добавляй факты, которые прямо не поддержаны указанными evidence;
- копируй evidenceIds ТОЧНО из блока EVIDENCE, без сокращений и выдуманных ID;
- JSON должен быть синтаксически полным: закрой все массивы и объекты, не обрывай ответ на середине claim.
${reportType === "forecast"
  ? `Это прогноз на ${horizonDays} дней: формулируй темы как вероятностные, не как гарантию событий. Опирайся на события выбранного окна; если транзитов мало — углубляй натальный контекст в personality/relationships/career/resources/tensions, а summary/currentPeriod/recommendations держи на timing evidence. В разделах summary, currentPeriod и recommendations каждый claim обязан содержать минимум один точный timing evidence ID (префикс ne.timing.). В остальных разделах можно ссылаться на натальные или timing evidence из блока ниже.`
  : "Для personality цитируй identity/emotions; relationships — relationships/emotions; career — career/identity; resources — resources/career; tensions — tensions/emotions; currentPeriod — evidence традиции timing (транзиты/даши/солнечное возвращение)."}`;
}

export function isNatalReport(value: unknown): value is NatalReport {
  const root = record(value);
  return root?.version === NATAL_REPORT_VERSION && Array.isArray(root.sections);
}
