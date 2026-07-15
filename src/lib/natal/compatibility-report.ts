import type {
  ClientSynastryPayload,
  SynastryCrossAspect,
} from "./synastry";

export const COMPATIBILITY_REPORT_SECTION_KEYS = [
  "summary",
  "communication",
  "emotional",
  "attraction",
  "stability",
  "growth",
  "recommendations",
] as const;

export type CompatibilityReportSectionKey =
  (typeof COMPATIBILITY_REPORT_SECTION_KEYS)[number];

export type CompatibilityReportClaim = {
  text: string;
  evidenceIds: string[];
};

export type CompatibilityReportSection = {
  key: CompatibilityReportSectionKey;
  title: string;
  claims: CompatibilityReportClaim[];
};

export type CompatibilityReport = {
  version: "1.0";
  sections: CompatibilityReportSection[];
  disclaimer: string;
};

export type CompatibilityEvidence = {
  version: string;
  overallScore: number;
  dimensions: ClientSynastryPayload["dimensions"];
  crossAspects: SynastryCrossAspect[];
  composite: ClientSynastryPayload["composite"];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildCompatibilityEvidence(
  synastry: ClientSynastryPayload
): CompatibilityEvidence {
  return {
    version: synastry.version,
    overallScore: synastry.overallScore,
    dimensions: synastry.dimensions,
    crossAspects: synastry.crossAspects,
    composite: synastry.composite,
  };
}

export function formatCompatibilityEvidence(evidence: CompatibilityEvidence): string {
  return JSON.stringify(evidence);
}

export function compatibilityReportJsonInstructions(): string {
  return `Верни только JSON:
{"version":"1.0","sections":[{"key":"summary","title":"Итог","claims":[{"text":"...","evidenceIds":["aspect-id"]}]}],"disclaimer":"..."}
Обязательные sections ровно по одному и в этом порядке: ${COMPATIBILITY_REPORT_SECTION_KEYS.join(", ")}.
В каждом разделе 1–5 claims. Каждый claim содержит непустой text и evidenceIds.
Для summary/recommendations допустимы ID аспектов и dimension:<key>; для тематических разделов используй evidence соответствующего dimension.
Не добавляй факты, которых нет в evidence. Не делай фаталистичных утверждений.`;
}

export function extractCompatibilityJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("invalid_json");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

export function validateCompatibilityReport(
  value: unknown,
  evidence: CompatibilityEvidence
):
  | { ok: true; report: CompatibilityReport }
  | { ok: false; errors: string[] } {
  const root = asRecord(value);
  const errors: string[] = [];
  if (!root || !Array.isArray(root.sections)) {
    return { ok: false, errors: ["sections must be an array"] };
  }

  const allowedEvidence = new Set([
    ...evidence.crossAspects.map((item) => item.id),
    ...evidence.dimensions.map((item) => `dimension:${item.key}`),
  ]);
  const sections: CompatibilityReportSection[] = [];

  for (const [index, expectedKey] of COMPATIBILITY_REPORT_SECTION_KEYS.entries()) {
    const raw = asRecord(root.sections[index]);
    if (!raw || raw.key !== expectedKey) {
      errors.push(`section ${index} must be ${expectedKey}`);
      continue;
    }
    const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];
    if (rawClaims.length < 1 || rawClaims.length > 5) {
      errors.push(`${expectedKey}: claims count must be 1..5`);
    }
    const claims: CompatibilityReportClaim[] = [];
    for (const rawClaim of rawClaims.slice(0, 5)) {
      const claim = asRecord(rawClaim);
      const text = typeof claim?.text === "string" ? claim.text.trim().slice(0, 3000) : "";
      const evidenceIds = Array.isArray(claim?.evidenceIds)
        ? [...new Set(claim.evidenceIds.filter(
            (id): id is string => typeof id === "string" && allowedEvidence.has(id)
          ))].slice(0, 8)
        : [];
      if (!text) errors.push(`${expectedKey}: empty claim`);
      if (!evidenceIds.length) errors.push(`${expectedKey}: claim has no valid evidence`);
      claims.push({ text, evidenceIds });
    }
    sections.push({
      key: expectedKey,
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 160)
          : expectedKey,
      claims,
    });
  }

  if (root.sections.length !== COMPATIBILITY_REPORT_SECTION_KEYS.length) {
    errors.push("unexpected sections count");
  }
  const disclaimer =
    typeof root.disclaimer === "string" ? root.disclaimer.trim().slice(0, 2000) : "";
  if (!disclaimer) errors.push("disclaimer is required");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    report: { version: "1.0", sections, disclaimer },
  };
}
