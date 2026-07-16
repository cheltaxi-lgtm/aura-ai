import type { NatalEvidence } from "./evidence";
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
      title: SECTION_TITLES[expectedKey],
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
    const text =
      typeof firstClaim?.text === "string" && firstClaim.text.trim()
        ? firstClaim.text.trim()
        : `Ключевой вывод по разделу «${SECTION_TITLES[expectedKey]}».`;
    const evidenceIds = coerceClaimEvidenceIds(
      Array.isArray(firstClaim?.evidenceIds)
        ? firstClaim.evidenceIds.filter((id): id is string => typeof id === "string")
        : [],
      expectedKey,
      evidence,
      expectedReportType,
      validIds
    );
    return {
      key: expectedKey,
      title:
        typeof rawSection?.title === "string" && rawSection.title.trim()
          ? rawSection.title.trim()
          : SECTION_TITLES[expectedKey],
      claims: [{ text, evidenceIds }],
    };
  });

  return validateNatalReport(
    prepared,
    evidence,
    expectedTradition,
    expectedReportType,
    expectedHorizonDays,
    { coerceEvidence: true, skipCategoryRules: true }
  );
}

/** Deterministic last-resort report that always validates when evidence is non-empty. */
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
      title: SECTION_TITLES[key],
      claims: [{
        text: `${item.label}: ${item.value}. Этот рассчитанный фактор задаёт основную тему раздела «${SECTION_TITLES[key]}».`,
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
    const title = titleRaw || (options.coerceEvidence ? (SECTION_TITLES[expectedKey] ?? expectedKey) : "");
    if (!title) errors.push(`Раздел ${expectedKey}: title обязателен.`);
    const rawClaims = Array.isArray(rawSection.claims) ? rawSection.claims : [];
    if (!rawClaims.length) errors.push(`Раздел ${expectedKey}: нужен минимум один claim.`);
    const claims: NatalReportClaim[] = [];
    for (let claimIndex = 0; claimIndex < rawClaims.length; claimIndex += 1) {
      const rawClaim = record(rawClaims[claimIndex]);
      const textRaw = typeof rawClaim?.text === "string" ? rawClaim.text.trim() : "";
      const text = textRaw || (options.coerceEvidence ? `Ключевой вывод по разделу «${SECTION_TITLES[expectedKey]}».` : "");
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
      if (
        allowed &&
        !unknown.length &&
        !evidenceIds.some((id) => allowed.has(evidenceById.get(id)?.category ?? ""))
      ) {
        errors.push(`${expectedKey}.claims[${claimIndex}]: citation не относится к тематике раздела.`);
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
    },
  };
}

export function natalReportToPlainText(report: NatalReport): string {
  return report.sections
    .map((section) => `${section.title}\n${section.claims.map((claim) => claim.text).join("\n\n")}`)
    .concat([`Методология\n${report.methodology}`, `Важно\n${report.disclaimer}`])
    .join("\n\n");
}

export function buildNatalReportJsonInstructions(
  tradition: NatalTradition,
  reportType: NatalReport["reportType"] = "interpretation",
  horizonDays?: NatalReport["horizonDays"]
): string {
  const horizonField = reportType === "forecast" ? `,"horizonDays":${horizonDays}` : "";
  return `Верни ТОЛЬКО JSON-объект без markdown.
Схема:
{"version":"${NATAL_REPORT_VERSION}","tradition":"${tradition}","reportType":"${reportType}"${horizonField},"sections":[
${NATAL_REPORT_SECTION_KEYS.map((key) => `{"key":"${key}","title":"локализованный заголовок","claims":[{"text":"вывод на русском","evidenceIds":["точный ID из блока evidence"]}]}`).join(",\n")}
],"disclaimer":"не научный прогноз и не замена профессиональной консультации","methodology":"как использованы расчёты и ограничения"}
Правила качества:
- все восемь разделов обязательны и идут в указанном порядке;
- каждый раздел — полноценная часть единого персонального текста: 5–8 содержательных предложений и не менее 350 знаков;
- общий объём текста восьми разделов — не менее 3200 знаков;
- раскрывай причинно-следственную связь: конкретный рассчитанный фактор → его символическое значение → проявление в жизни → практический вывод;
- называй конкретные планеты, знаки, дома, аспекты, даты или периоды только из переданных evidence; не заменяй их общими словами;
- используй имя клиента из пользовательского сообщения естественно, но не в каждом разделе;
- не пиши универсальные фразы вроде «у вас есть потенциал», «возможны изменения», «сосредоточьтесь на целях» без конкретного объяснения через evidence;
- разделы не должны повторять друг друга по смыслу или формулировкам;
- в каждом разделе минимум один непустой claim; у каждого claim один или несколько существующих evidenceIds;
- не добавляй факты, которые прямо не поддержаны указанными evidence.
${reportType === "forecast"
  ? `Это прогноз на ${horizonDays} дней: формулируй возможности, напряжения и практические рекомендации как вероятностные темы, а не гарантированные события. В разделах summary, currentPeriod и recommendations каждый claim обязан содержать минимум один точный timing evidence ID (префикс ne.timing.). В остальных разделах можно ссылаться на натальные или timing evidence из блока ниже.`
  : "Для personality цитируй identity/emotions; relationships — relationships/emotions; career — career/identity; resources — resources/career; tensions — tensions/emotions; currentPeriod — только evidence категории timing."}`;
}

export function isNatalReport(value: unknown): value is NatalReport {
  const root = record(value);
  return root?.version === NATAL_REPORT_VERSION && Array.isArray(root.sections);
}
