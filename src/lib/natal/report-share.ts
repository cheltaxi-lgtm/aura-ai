import { sanitizeSynastryForClient } from "./synastry";

export const REPORT_SHARE_SECTION_ALLOWLIST = {
  natal: ["summary", "personality", "relationships", "career", "resources", "tensions", "currentPeriod", "recommendations", "methodology", "evidence"],
  relationship: ["summary", "dimensions", "aspects", "composite", "methodology"],
} as const;

export type ShareReportKind = keyof typeof REPORT_SHARE_SECTION_ALLOWLIST;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function allowedShareSections(kind: ShareReportKind, requested: unknown): string[] {
  if (!Array.isArray(requested)) return [];
  const allow = new Set<string>(REPORT_SHARE_SECTION_ALLOWLIST[kind]);
  return [...new Set(requested.filter((item): item is string =>
    typeof item === "string" && allow.has(item)
  ))];
}

function sanitizeEvidence(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    if (!source || typeof source.id !== "string" || typeof source.label !== "string") return [];
    return [{
      id: source.id.slice(0, 120),
      label: source.label.slice(0, 160),
      value: typeof source.value === "string" ? source.value.slice(0, 300) : "",
      confidence: ["high", "medium", "low"].includes(String(source.confidence))
        ? source.confidence : "medium",
      uncertainty: typeof source.uncertainty === "string" ? source.uncertainty.slice(0, 300) : undefined,
    }];
  });
}

export function sanitizeNatalReportShare(params: {
  structuredData: unknown;
  content: string;
  evidenceRefs: unknown;
  sections: unknown;
  meta: Record<string, unknown>;
}): Record<string, unknown> {
  const selected = allowedShareSections("natal", params.sections);
  const report = record(params.structuredData);
  const rawSections = Array.isArray(report?.sections) ? report.sections : [];
  const sections = rawSections.flatMap((item) => {
    const section = record(item);
    if (!section || typeof section.key !== "string" || !selected.includes(section.key)) return [];
    const claims = Array.isArray(section.claims) ? section.claims.flatMap((claim) => {
      const value = record(claim);
      return typeof value?.text === "string" ? [{ text: value.text.slice(0, 4000) }] : [];
    }) : [];
    return [{ key: section.key, title: typeof section.title === "string" ? section.title.slice(0, 160) : section.key, claims }];
  });
  return {
    kind: "natal",
    meta: params.meta,
    sections,
    legacyContent: !report && selected.includes("summary") ? params.content.slice(0, 50_000) : undefined,
    methodology: selected.includes("methodology") && typeof report?.methodology === "string"
      ? report.methodology.slice(0, 4000) : undefined,
    disclaimer: typeof report?.disclaimer === "string" ? report.disclaimer.slice(0, 2000) : undefined,
    evidence: selected.includes("evidence") ? sanitizeEvidence(params.evidenceRefs) : undefined,
  };
}

export function sanitizeRelationshipReportShare(params: {
  synastry: unknown;
  combinedReading?: string | null;
  labels: { a: string; b: string };
  sections: unknown;
  meta: Record<string, unknown>;
}): Record<string, unknown> {
  const selected = allowedShareSections("relationship", params.sections);
  const safe = sanitizeSynastryForClient(record(params.synastry));
  return {
    kind: "relationship",
    meta: params.meta,
    labels: params.labels,
    summary: selected.includes("summary") ? params.combinedReading?.slice(0, 50_000) ?? null : undefined,
    dimensions: selected.includes("dimensions") ? safe?.dimensions ?? [] : undefined,
    aspects: selected.includes("aspects") ? safe?.crossAspects ?? [] : undefined,
    composite: selected.includes("composite") ? safe?.composite ?? null : undefined,
    methodology: selected.includes("methodology") ? {
      synastryVersion: safe?.version ?? null,
      description: "Индексы основаны только на показанных межкартных аспектах; композит — круговые мидпойнты.",
      limitation: safe?.composite?.limitation ?? null,
    } : undefined,
  };
}

export function isHighEntropyShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
