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
  /** LLM model that produced the text — provenance for audits/regressions. */
  model?: string;
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
В каждом разделе 1–5 claims, суммарно не менее 300 знаков содержательного текста. Каждый claim содержит непустой text и evidenceIds.
Пиши как умный друг: сначала как это ощущается в паре простыми словами, потом одна короткая отсылка к аспекту из evidence. Запрещено слово «расклад». Не начинай абзац с названия планеты.
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

const SECTION_TITLES: Record<CompatibilityReportSectionKey, string> = {
  summary: "Итог",
  communication: "Общение",
  emotional: "Эмоции",
  attraction: "Притяжение",
  stability: "Стабильность",
  growth: "Рост",
  recommendations: "Рекомендации",
};

const DEFAULT_DISCLAIMER =
  "Отчёт о совместимости — символическая интерпретация рассчитанной синастрии и не гарантирует событий. Не заменяет психологическую, юридическую или медицинскую консультацию.";

export type ValidateCompatibilityOptions = {
  /** Coerce unknown/missing evidence IDs and accept sections by key (any order). */
  coerceEvidence?: boolean;
};

function evidenceSets(evidence: CompatibilityEvidence) {
  const allowedEvidence = new Set([
    ...evidence.crossAspects.map((item) => item.id),
    ...evidence.dimensions.map((item) => `dimension:${item.key}`),
  ]);
  const evidenceByDimension = new Map(
    evidence.dimensions.map((dimension) => [
      dimension.key,
      new Set([`dimension:${dimension.key}`, ...dimension.supportingAspectIds]),
    ])
  );
  return { allowedEvidence, evidenceByDimension };
}

function defaultEvidenceIdsForSection(
  key: CompatibilityReportSectionKey,
  evidence: CompatibilityEvidence
): string[] {
  if (key === "summary" || key === "recommendations") {
    const topAspect = evidence.crossAspects[0]?.id;
    const topDim = evidence.dimensions[0] ? `dimension:${evidence.dimensions[0].key}` : null;
    return [topAspect, topDim].filter((id): id is string => Boolean(id));
  }
  const dimension = evidence.dimensions.find((item) => item.key === key);
  if (!dimension) return evidence.crossAspects[0]?.id ? [evidence.crossAspects[0].id] : [];
  const ids = [`dimension:${dimension.key}`, ...dimension.supportingAspectIds.slice(0, 3)];
  return ids.filter(Boolean);
}

function groundedClaimText(
  key: CompatibilityReportSectionKey,
  evidence: CompatibilityEvidence
): string {
  const dimension = evidence.dimensions.find((item) => item.key === key);
  const topAspects = (
    key === "summary" || key === "recommendations"
      ? evidence.crossAspects
      : evidence.crossAspects.filter((aspect) =>
          dimension?.supportingAspectIds.includes(aspect.id)
        )
  ).slice(0, 3);
  const aspectLine = topAspects.length
    ? topAspects
        .map((aspect) => `${aspect.label} (орб ${aspect.orb.toFixed(1)}°)`)
        .join("; ")
    : "пересечения карт по выбранным факторам";
  const scoreBit = `Общий индекс синастрии: ${evidence.overallScore}.`;
  if (key === "summary") {
    return [
      "Простыми словами: рассчитанные пересечения карт показывают, где паре обычно легко и где чаще трёт.",
      scoreBit,
      `Опора расчёта: ${aspectLine}.`,
      "Это ориентир, не вердикт и не обещание событий. Смотри, что из этого узнаёшь в обычном общении.",
    ].join(" ");
  }
  if (key === "recommendations") {
    return [
      "Договоритесь заранее, чего каждый ждёт, и не читайте каждый напряжённый аспект как приговор.",
      scoreBit,
      `Опора: ${aspectLine}.`,
      "Выберите одну тему на ближайшие недели и смотрите, что подтверждается в быту.",
    ].join(" ");
  }
  const band = dimension?.band ?? "смешанно";
  const index = dimension?.index ?? evidence.overallScore;
  return [
    `Измерение «${dimension?.label ?? SECTION_TITLES[key]}»: индекс ${index}, тон «${band}».`,
    `Опорные факторы: ${aspectLine}.`,
    "Это рассчитанная геометрия между картами, а не вердикт о будущем: проявление зависит от контекста отношений и выбора людей.",
    `В быту замечай тему «${(dimension?.label ?? SECTION_TITLES[key]).toLowerCase()}» и сверяй ощущения с перечисленными факторами, не с общими словами.`,
  ].join(" ");
}

/**
 * Build a structurally valid compatibility report from synastry evidence,
 * optionally keeping usable LLM prose when it cites real evidence.
 */
export function salvageCompatibilityReport(
  value: unknown,
  evidence: CompatibilityEvidence
):
  | { ok: true; report: CompatibilityReport }
  | { ok: false; errors: string[] } {
  if (!evidence.dimensions.length && !evidence.crossAspects.length) {
    return { ok: false, errors: ["no_evidence"] };
  }
  const root = asRecord(value);
  const byKey = new Map<string, Record<string, unknown>>();
  if (Array.isArray(root?.sections)) {
    for (const item of root.sections) {
      const section = asRecord(item);
      if (section && typeof section.key === "string") byKey.set(section.key, section);
    }
  }
  const { allowedEvidence, evidenceByDimension } = evidenceSets(evidence);
  const sections: CompatibilityReportSection[] = COMPATIBILITY_REPORT_SECTION_KEYS.map((key) => {
    const raw = byKey.get(key);
    const rawClaims = Array.isArray(raw?.claims) ? raw.claims : [];
    const claims: CompatibilityReportClaim[] = [];
    for (const rawClaim of rawClaims.slice(0, 5)) {
      const claim = asRecord(rawClaim);
      const text = typeof claim?.text === "string" ? claim.text.trim().slice(0, 3000) : "";
      if (!text || text.length < 80) continue;
      if (/ключевой вывод|у вас есть потенциал|возможны изменения|сосредоточьтесь на своих целях/i.test(text)) {
        continue;
      }
      let evidenceIds = Array.isArray(claim?.evidenceIds)
        ? [...new Set(claim.evidenceIds.filter((id): id is string => typeof id === "string" && allowedEvidence.has(id)))]
        : [];
      if (
        key !== "summary" &&
        key !== "recommendations" &&
        !evidenceIds.some((id) => evidenceByDimension.get(key)?.has(id))
      ) {
        evidenceIds = defaultEvidenceIdsForSection(key, evidence);
      }
      if (!evidenceIds.length) evidenceIds = defaultEvidenceIdsForSection(key, evidence);
      if (evidenceIds.length) claims.push({ text, evidenceIds });
    }
    if (!claims.length) {
      claims.push({
        text: groundedClaimText(key, evidence),
        evidenceIds: defaultEvidenceIdsForSection(key, evidence),
      });
    } else {
      // Pad short sections with grounded prose so the 300-char gate is met.
      const length = claims.reduce((sum, claim) => sum + claim.text.length, 0);
      if (length < 300) {
        claims.push({
          text: groundedClaimText(key, evidence),
          evidenceIds: defaultEvidenceIdsForSection(key, evidence),
        });
      }
    }
    return {
      key,
      title:
        typeof raw?.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 160)
          : SECTION_TITLES[key],
      claims: claims.slice(0, 5),
    };
  });
  const disclaimer =
    typeof root?.disclaimer === "string" && root.disclaimer.trim()
      ? root.disclaimer.trim().slice(0, 2000)
      : DEFAULT_DISCLAIMER;
  return validateCompatibilityReport(
    { version: "1.0", sections, disclaimer },
    evidence,
    { coerceEvidence: true }
  );
}

export function validateCompatibilityReport(
  value: unknown,
  evidence: CompatibilityEvidence,
  options: ValidateCompatibilityOptions = {}
):
  | { ok: true; report: CompatibilityReport }
  | { ok: false; errors: string[] } {
  const root = asRecord(value);
  const errors: string[] = [];
  if (!root || !Array.isArray(root.sections)) {
    return { ok: false, errors: ["sections must be an array"] };
  }

  const { allowedEvidence, evidenceByDimension } = evidenceSets(evidence);
  const sectionsByKey = new Map<string, Record<string, unknown>>();
  for (const item of root.sections) {
    const section = asRecord(item);
    if (section && typeof section.key === "string") {
      sectionsByKey.set(section.key, section);
    }
  }
  const sections: CompatibilityReportSection[] = [];
  const seenTexts = new Set<string>();

  for (const [index, expectedKey] of COMPATIBILITY_REPORT_SECTION_KEYS.entries()) {
    const raw =
      sectionsByKey.get(expectedKey) ??
      (options.coerceEvidence ? null : asRecord(root.sections[index]));
    if (!raw || raw.key !== expectedKey) {
      errors.push(`section ${index} must be ${expectedKey}`);
      continue;
    }
    const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];
    if (rawClaims.length < 1 || rawClaims.length > 5) {
      errors.push(`${expectedKey}: claims count must be 1..5`);
    }
    const claims: CompatibilityReportClaim[] = [];
    let sectionTextLength = 0;
    for (const rawClaim of rawClaims.slice(0, 5)) {
      const claim = asRecord(rawClaim);
      const text = typeof claim?.text === "string" ? claim.text.trim().slice(0, 3000) : "";
      const suppliedEvidenceIds = Array.isArray(claim?.evidenceIds)
        ? [...new Set(claim.evidenceIds.filter((id): id is string => typeof id === "string"))].slice(0, 8)
        : [];
      let evidenceIds = suppliedEvidenceIds.filter((id) => allowedEvidence.has(id));
      if (options.coerceEvidence) {
        if (
          expectedKey !== "summary" &&
          expectedKey !== "recommendations" &&
          !evidenceIds.some((id) => evidenceByDimension.get(expectedKey)?.has(id))
        ) {
          evidenceIds = defaultEvidenceIdsForSection(expectedKey, evidence);
        } else if (!evidenceIds.length) {
          evidenceIds = defaultEvidenceIdsForSection(expectedKey, evidence);
        }
      }
      if (!text) errors.push(`${expectedKey}: empty claim`);
      if (!options.coerceEvidence && suppliedEvidenceIds.length !== evidenceIds.length) {
        errors.push(`${expectedKey}: claim contains unknown evidence`);
      }
      if (!evidenceIds.length) errors.push(`${expectedKey}: claim has no valid evidence`);
      const normalizedText = text.toLocaleLowerCase("ru").replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
      if (normalizedText.length > 40 && seenTexts.has(normalizedText)) {
        errors.push(`${expectedKey}: repeated claim text`);
      }
      seenTexts.add(normalizedText);
      if (/ключевой вывод|у вас есть потенциал|возможны изменения|сосредоточьтесь на своих целях/i.test(text)) {
        errors.push(`${expectedKey}: placeholder or generic claim`);
      }
      if (
        !options.coerceEvidence &&
        expectedKey !== "summary" &&
        expectedKey !== "recommendations" &&
        !evidenceIds.some((id) => evidenceByDimension.get(expectedKey)?.has(id))
      ) {
        errors.push(`${expectedKey}: claim evidence does not match section dimension`);
      }
      sectionTextLength += text.length;
      if (text && evidenceIds.length) {
        claims.push({ text, evidenceIds });
      }
    }
    if (sectionTextLength < 300) errors.push(`${expectedKey}: section is too short`);
    sections.push({
      key: expectedKey,
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 160)
          : SECTION_TITLES[expectedKey],
      claims,
    });
  }

  if (!options.coerceEvidence && root.sections.length !== COMPATIBILITY_REPORT_SECTION_KEYS.length) {
    errors.push("unexpected sections count");
  }
  const disclaimer =
    typeof root.disclaimer === "string" ? root.disclaimer.trim().slice(0, 2000) : "";
  if (!disclaimer) errors.push("disclaimer is required");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    report: {
      version: "1.0",
      sections,
      disclaimer,
      // Preserve model provenance across re-validation/salvage of a stamped report.
      ...(typeof root.model === "string" && root.model.trim()
        ? { model: root.model.trim().slice(0, 120) }
        : {}),
    },
  };
}
