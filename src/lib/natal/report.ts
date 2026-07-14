import type { NatalEvidence } from "./evidence";
import type { NatalTradition } from "./types";

export const NATAL_REPORT_VERSION = "1.0";
export const NATAL_REPORT_SECTION_KEYS = [
  "summary", "personality", "relationships", "career", "resources",
  "tensions", "currentPeriod", "recommendations",
] as const;
export type NatalReportSectionKey = (typeof NATAL_REPORT_SECTION_KEYS)[number];

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
  reportType: "interpretation";
  sections: NatalReportSection[];
  disclaimer: string;
  methodology: string;
}

export type NatalReportValidation =
  | { ok: true; report: NatalReport }
  | { ok: false; errors: string[] };

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

export function validateNatalReport(
  value: unknown,
  evidence: readonly NatalEvidence[],
  expectedTradition: NatalTradition
): NatalReportValidation {
  const errors: string[] = [];
  const root = record(value);
  if (!root) return { ok: false, errors: ["Корень ответа должен быть JSON-объектом."] };
  if (root.version !== NATAL_REPORT_VERSION) errors.push(`version должен быть "${NATAL_REPORT_VERSION}".`);
  if (root.tradition !== expectedTradition) errors.push(`tradition должен быть "${expectedTradition}".`);
  if (root.reportType !== "interpretation") errors.push('reportType должен быть "interpretation".');
  if (typeof root.disclaimer !== "string" || !root.disclaimer.trim()) errors.push("disclaimer обязателен.");
  if (typeof root.methodology !== "string" || !root.methodology.trim()) errors.push("methodology обязательна.");

  const ids = new Set(evidence.map((item) => item.id));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const allowedCategories: Partial<Record<NatalReportSectionKey, Set<string>>> = {
    personality: new Set(["identity", "emotions"]),
    relationships: new Set(["relationships", "emotions"]),
    career: new Set(["career", "identity"]),
    resources: new Set(["resources", "career"]),
    tensions: new Set(["tensions", "emotions"]),
    currentPeriod: new Set(["timing"]),
  };
  const sections = Array.isArray(root.sections) ? root.sections : [];
  if (sections.length !== NATAL_REPORT_SECTION_KEYS.length) {
    errors.push(`Нужно ровно ${NATAL_REPORT_SECTION_KEYS.length} разделов.`);
  }
  const parsedSections: NatalReportSection[] = [];
  for (let index = 0; index < NATAL_REPORT_SECTION_KEYS.length; index += 1) {
    const expectedKey = NATAL_REPORT_SECTION_KEYS[index];
    const rawSection = record(sections[index]);
    if (!rawSection || rawSection.key !== expectedKey) {
      errors.push(`Раздел ${index + 1} должен иметь key="${expectedKey}" и правильный порядок.`);
      continue;
    }
    const title = typeof rawSection.title === "string" ? rawSection.title.trim() : "";
    if (!title) errors.push(`Раздел ${expectedKey}: title обязателен.`);
    const rawClaims = Array.isArray(rawSection.claims) ? rawSection.claims : [];
    if (!rawClaims.length) errors.push(`Раздел ${expectedKey}: нужен минимум один claim.`);
    const claims: NatalReportClaim[] = [];
    for (let claimIndex = 0; claimIndex < rawClaims.length; claimIndex += 1) {
      const rawClaim = record(rawClaims[claimIndex]);
      const text = typeof rawClaim?.text === "string" ? rawClaim.text.trim() : "";
      const evidenceIds = Array.isArray(rawClaim?.evidenceIds)
        ? [...new Set(rawClaim.evidenceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
        : [];
      if (!text) errors.push(`${expectedKey}.claims[${claimIndex}]: text не может быть пустым.`);
      if (!evidenceIds.length) errors.push(`${expectedKey}.claims[${claimIndex}]: нужна минимум одна ссылка на evidence.`);
      const unknown = evidenceIds.filter((id) => !ids.has(id));
      if (unknown.length) errors.push(`${expectedKey}.claims[${claimIndex}]: неизвестные evidence ID: ${unknown.join(", ")}.`);
      const allowed = allowedCategories[expectedKey];
      if (
        allowed &&
        !unknown.length &&
        !evidenceIds.some((id) => allowed.has(evidenceById.get(id)?.category ?? ""))
      ) {
        errors.push(`${expectedKey}.claims[${claimIndex}]: citation не относится к тематике раздела.`);
      }
      if (text && evidenceIds.length && !unknown.length) claims.push({ text, evidenceIds });
    }
    parsedSections.push({ key: expectedKey, title, claims });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    report: {
      version: NATAL_REPORT_VERSION,
      tradition: expectedTradition,
      reportType: "interpretation",
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

export function buildNatalReportJsonInstructions(tradition: NatalTradition): string {
  return `Верни ТОЛЬКО JSON-объект без markdown.
Схема:
{"version":"${NATAL_REPORT_VERSION}","tradition":"${tradition}","reportType":"interpretation","sections":[
${NATAL_REPORT_SECTION_KEYS.map((key) => `{"key":"${key}","title":"локализованный заголовок","claims":[{"text":"вывод на русском","evidenceIds":["точный ID из блока evidence"]}]}`).join(",\n")}
],"disclaimer":"не научный прогноз и не замена профессиональной консультации","methodology":"как использованы расчёты и ограничения"}
Правила: все восемь разделов обязательны и идут в указанном порядке; в каждом минимум один непустой claim; у каждого claim один или несколько существующих evidenceIds; не добавляй факты, которые прямо не поддержаны указанными evidence.
Для personality цитируй identity/emotions; relationships — relationships/emotions; career — career/identity; resources — resources/career; tensions — tensions/emotions; currentPeriod — только evidence категории timing.`;
}

export function isNatalReport(value: unknown): value is NatalReport {
  const root = record(value);
  return root?.version === NATAL_REPORT_VERSION && Array.isArray(root.sections);
}
