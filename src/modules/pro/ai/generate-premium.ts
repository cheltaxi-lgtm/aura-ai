/**
 * Pro premium practice reports via consumer generators.
 * Never writes consumer cabinet rows / entitlements.
 */

import type { ChatMessage } from "@/lib/llm";
import { buildNatalEvidence } from "@/lib/natal/evidence";
import { generateValidatedNatalReport } from "@/lib/natal/generate-validated-report";
import {
  buildNatalReportJsonInstructions,
  natalReportToPlainText,
  type NatalReport,
} from "@/lib/natal/report";
import { NATAL_ENGINE_VERSION, type NatalChartRecord } from "@/lib/natal/types";
import { generateFullMatrixSectionedReading } from "@/lib/numerology/matrix-sectioned-reading";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { hdReportTextToPrintSections } from "@/lib/human-design/packages";
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { isHdSectionalReportEnabled } from "@/lib/hd-report-pipeline/flags";
import { completeHdFullReport } from "@/lib/human-design/report-generate";
import { buildHdReportSystemPrompt, formatHdEvidence } from "@/lib/human-design/prompt";
import type { ProCaseType, ProReportBlock } from "../domain/types";
import { filterPractitionerOutput } from "../safety";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "./report-plain";
import {
  computeHdFacts,
  computeMatrixFacts,
  computeNatalFacts,
  enrichBirthPlace,
  normalizeBirthFields,
} from "../adapters/chart-facts";

function toProBlock(
  id: string,
  title: string,
  body: string,
  extras?: Partial<ProReportBlock>
): ProReportBlock {
  const filtered = filterPractitionerOutput(body);
  return {
    id,
    title: polishProReportTitle(title),
    body: polishProReportPlainText(filtered.text),
    ai_confidence: 0.75,
    ...extras,
  };
}

/** Shared Pro delivery voice: address the chart owner as «Вы». */
function proClientVoiceRules(clientAlias: string, focus: string | null): string {
  const name = clientAlias.trim() || "клиент";
  const focusBlock = focus
    ? `
ФОКУС ЗАПРОСА (главная нить всего отчёта): «${focus}»
— Если формулировка в 3-м лице («у неё/у него») про носителя карты — это запрос о ВАС (читателе отчёта).
— Во вступлении явно назови фокус и как карта отвечает на него.
— В каждом релевантном разделе (особенно «Отношения», «Как вы себя видите», «Автоматические реакции», практики) возвращайся к фокусу конкретно.
— Не отвечай «да/нет» и не ставь сроки. Дай понятную механику: что помогает, что мешает, что делать.`
    : "";
  return `
ПРАВИЛА ОТЧЁТА ДЛЯ КЛИЕНТА ZOVUS PRO:
1) Обращение ТОЛЬКО на «Вы», по имени: «${name}, Вы…». Запрещено третье лицо («она/он/Светлана делает») — заказчик читает про себя.
2) Текст для клиента: ясный, конкретный, полный, без воды и общих фраз («все уникальны», «важно быть собой»).
3) В теле разделов НЕ используй markdown-декор: никаких **, *, #, ###, таблиц. Подпункты — обычными абзацами или тире «—». (Служебные ## заголовки разделов из списка — оставляй как требуют правила генерации; внутри раздела — чистая проза.)
4) Каждый раздел: механика простыми словами → как это проявляется → 1–2 бытовых примера → что делать.
${focusBlock}`;
}

export type ProChartSnapshot = {
  caseType: "natal" | "matrix" | "hd";
  birthDate: string | null;
  birthTime: string | null;
  timeKnown: boolean;
  placeLabel: string | null;
  timezone: string | null;
  western?: Record<string, unknown> | null;
  matrix?: Record<string, unknown> | null;
  hdChart?: Record<string, unknown> | null;
};

function markdownToBlocks(markdown: string, prefix: string): ProReportBlock[] {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  // Never split on ### subsections.
  const chunks = text.split(/^##(?!#)\s+/m);
  const blocks: ProReportBlock[] = [];
  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && !/^##(?!#)\s*\S/m.test(text) && !text.startsWith("##")) {
      blocks.push(
        toProBlock(`${prefix}-intro`, "Вступление", trimmed, {
          ai_confidence: 0.7,
        })
      );
      return;
    }
    const nl = trimmed.indexOf("\n");
    const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : trimmed.slice(nl + 1)).trim();
    if (!title) return;
    blocks.push(
      toProBlock(`${prefix}-${blocks.length + 1}`, title, body || title, {
        ai_confidence: 0.7,
        position_ref: String(blocks.length + 1),
      })
    );
  });
  return blocks;
}

function natalSectionsToBlocks(report: NatalReport): ProReportBlock[] {
  return report.sections.map((s, i) =>
    toProBlock(s.key || `n-${i + 1}`, s.title, s.claims.map((c) => c.text).join("\n\n"), {
      position_ref: String(i + 1),
    })
  );
}

async function buildNatalSnapshot(
  payload: Record<string, unknown>
): Promise<{ snapshot: ProChartSnapshot; record: NatalChartRecord; facts: Record<string, unknown> }> {
  const enriched = await enrichBirthPlace(payload);
  const facts = await computeNatalFacts(enriched);
  if (!facts.ok) {
    throw Object.assign(new Error(String(facts.error || "natal_facts_failed")), {
      status: 400,
      details: facts,
    });
  }
  const n = normalizeBirthFields(enriched);
  // Recompute western into snapshot for UI (facts already ran computeWesternChart)
  const { computeWesternChart } = await import("@/lib/natal/western");
  const {
    birthTimeLabel,
    parseBirthTimeToDecimal,
    resolveBirthUtcOffsetHours,
  } = await import("@/lib/natal/time");
  const lat = Number(enriched.latitude ?? enriched.birthLat);
  const lon = Number(enriched.longitude ?? enriched.birthLon);
  const tz = String(enriched.timezone || enriched.birthTz || "Europe/Moscow");
  const decimalHour = n.timeKnown ? parseBirthTimeToDecimal(n.birthTime) : null;
  const effectiveHour = decimalHour ?? 12;
  const timeKnown = Boolean(n.timeKnown && decimalHour != null);
  const timeStr = birthTimeLabel(effectiveHour);
  const utcOffset = resolveBirthUtcOffsetHours(String(n.birthDate), timeStr, tz);
  const western = await computeWesternChart({
    birthDate: String(n.birthDate),
    localHourDecimal: effectiveHour,
    utcOffsetHours: utcOffset,
    latitude: lat,
    longitude: lon,
    timeKnown,
  });
  const place = {
    label: String(n.birthPlace || enriched.birthPlace || ""),
    latitude: lat,
    longitude: lon,
    timezone: tz,
  };
  const record: NatalChartRecord = {
    userId: `pro-ephemeral`,
    timeKnown,
    place,
    western,
    vedic: null,
    computedAt: new Date().toISOString(),
    engineVersion: NATAL_ENGINE_VERSION,
    warnings: Array.isArray(facts.warnings) ? (facts.warnings as string[]) : [],
  };
  const snapshot: ProChartSnapshot = {
    caseType: "natal",
    birthDate: n.birthDate ?? null,
    birthTime: timeKnown ? timeStr : null,
    timeKnown,
    placeLabel: place.label || null,
    timezone: tz,
    western,
  };
  return { snapshot, record, facts };
}

async function generateNatal(
  payload: Record<string, unknown>,
  clientAlias: string,
  focusQuestion?: string | null
): Promise<{ blocks: ProReportBlock[]; snapshot: ProChartSnapshot }> {
  const { snapshot, record } = await buildNatalSnapshot(payload);
  const evidence = buildNatalEvidence(record, { tradition: "western" });
  const evidenceIds = evidence.map((e) => e.id);
  const evidenceBlock = evidence
    .map((e) => `- [${e.id}] ${e.label}: ${e.value}${e.uncertainty ? ` (${e.uncertainty})` : ""}`)
    .join("\n");
  const focus = focusQuestion?.trim() || "";
  const systemPrompt = `Ты — астролог Zovus Pro. Составь доказуемую западную натальную трактовку на русском.
Опирайся ТОЛЬКО на evidence. Не выдумывай положения и дома.
${buildNatalReportJsonInstructions("western")}
${record.timeKnown ? "" : "Время рождения неизвестно: не заявляй дома/ASC/MC однозначно."}
Имя клиента: «${clientAlias}».
${proClientVoiceRules(clientAlias, focus || null)}
В JSON-полях claims пиши чистую прозу без **, # и markdown.

EVIDENCE:
${evidenceBlock}

VALID EVIDENCE ID:
${evidenceIds.join("\n")}`;

  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: focus
        ? `Создай отчёт для ${clientAlias} на «Вы». Фокус: «${focus}». Верни только JSON.`
        : `Создай отчёт для ${clientAlias} на «Вы». Верни только JSON.`,
    },
  ];
  const generated = await generateValidatedNatalReport({
    baseMessages,
    evidence,
    tradition: "western",
    reportType: "interpretation",
    evidenceIdsHint: evidenceIds,
    clientName: clientAlias,
  });
  if (!generated.ok) {
    throw Object.assign(new Error("natal_generation_failed"), {
      status: 502,
      details: generated.errors?.slice(0, 8),
    });
  }
  const blocks = natalSectionsToBlocks(generated.report);
  if (!blocks.length) {
    const plain = natalReportToPlainText(generated.report);
    return { blocks: markdownToBlocks(plain, "natal"), snapshot };
  }
  return { blocks, snapshot };
}

async function generateMatrix(
  payload: Record<string, unknown>,
  clientAlias: string,
  focusQuestion?: string | null
): Promise<{ blocks: ProReportBlock[]; snapshot: ProChartSnapshot }> {
  const birthDate = String(payload.birthDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw Object.assign(new Error("birth_date_required"), { status: 400 });
  }
  const facts = computeMatrixFacts(birthDate, payload.matrix as never);
  if (!facts.ok) {
    throw Object.assign(new Error(String(facts.error || "matrix_facts_failed")), {
      status: 400,
    });
  }
  const focus = focusQuestion?.trim() || "";
  const contextFacts = [
    typeof facts.focusLabel === "string"
      ? `Узел периода матрицы: ${facts.focusLabel}.`
      : null,
    `Обращение к заказчику на «вы» и по имени «${clientAlias}» (не третье лицо).`,
    focus
      ? `Фокус запроса заказчика: «${focus}». Если формулировка в 3-м лице про носителя матрицы — это запрос о самом заказчике. Прошей фокус через зоны; не обещай исход и сроки.`
      : null,
    "Без markdown (** # ###). Чистая проза.",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await generateFullMatrixSectionedReading({
    birthDate,
    name: clientAlias,
    toolId: "destiny_matrix",
    subjectKind: "self",
    subjectName: clientAlias,
    useLlm: true,
    contextFacts: contextFacts || null,
  });
  const blocks = markdownToBlocks(result.reading, "matrix");
  const snapshot: ProChartSnapshot = {
    caseType: "matrix",
    birthDate,
    birthTime: null,
    timeKnown: false,
    placeLabel: null,
    timezone: null,
    matrix: result.matrix as unknown as Record<string, unknown>,
  };
  return { blocks, snapshot };
}

async function generateHd(
  payload: Record<string, unknown>,
  clientAlias: string,
  focusQuestion?: string | null
): Promise<{ blocks: ProReportBlock[]; snapshot: ProChartSnapshot }> {
  const enriched = await enrichBirthPlace(payload);
  const n = normalizeBirthFields(enriched);
  if (!n.birthDate) {
    throw Object.assign(new Error("birth_date_required"), { status: 400 });
  }
  const tz = n.timezone || n.birthTz || "Europe/Moscow";
  const chart = calculateHdChart({
    birthDate: n.birthDate,
    birthTime: n.timeKnown ? n.birthTime ?? null : null,
    timezone: tz,
  });
  const facts = computeHdFacts({ ...enriched, timezone: tz, birthTz: tz });
  const focus = focusQuestion?.trim() || "";
  const proVoice = proClientVoiceRules(clientAlias, focus || null);
  // Client receives the report about themselves → «Вы», not third person.
  // Rollback flag: HD_SECTIONAL_REPORT=0 → legacy multi-pass path.
  const generated = isHdSectionalReportEnabled()
    ? await generateHdReportSectional({
        chart,
        clientName: clientAlias,
        aboutOther: false,
        focusQuestion: focus || null,
        extraSystem: proVoice,
        maxSectionRetries: 2,
      })
    : null;
  if (!generated) {
    const text = await completeHdFullReport({
      systemPrompt:
        `${buildHdReportSystemPrompt(clientAlias, "personal", { aboutOther: false })}\n\n${proVoice}`,
      evidence: formatHdEvidence(chart),
      clientName: clientAlias,
      aboutOther: false,
      focusQuestion: focus || null,
    });
    if (!text) {
      throw Object.assign(new Error("hd_generation_failed"), { status: 502 });
    }
    const sections = hdReportTextToPrintSections(text);
    const blocks: ProReportBlock[] = sections.map((s, i) =>
      toProBlock(
        s.key || `h-${i + 1}`,
        s.title,
        s.claims.map((c) => c.text).join("\n\n"),
        { position_ref: String(i + 1) }
      )
    );
    const snapshot: ProChartSnapshot = {
      caseType: "hd",
      birthDate: n.birthDate,
      birthTime: chart.birth?.time ?? null,
      timeKnown: chart.timeKnown,
      placeLabel: n.birthPlace ?? null,
      timezone: tz,
      hdChart: chart as unknown as Record<string, unknown>,
    };
    void facts;
    return { blocks, snapshot };
  }
  if (!generated.text || generated.needsRegeneration) {
    throw Object.assign(
      new Error(
        generated.needsRegeneration ? "hd_quality_needs_regeneration" : "hd_generation_failed"
      ),
      {
        status: 502,
        qualityFindings: generated.quality.findings,
        draftText: generated.text,
      }
    );
  }
  const text = generated.text;
  const sections = hdReportTextToPrintSections(text);
  const blocks: ProReportBlock[] = sections.map((s, i) =>
    toProBlock(
      s.key || `h-${i + 1}`,
      s.title,
      s.claims.map((c) => c.text).join("\n\n"),
      { position_ref: String(i + 1) }
    )
  );
  const snapshot: ProChartSnapshot = {
    caseType: "hd",
    birthDate: n.birthDate,
    birthTime: chart.birth?.time ?? null,
    timeKnown: chart.timeKnown,
    placeLabel: n.birthPlace ?? null,
    timezone: tz,
    hdChart: chart as unknown as Record<string, unknown>,
  };
  void facts;
  return { blocks, snapshot };
}

export async function generateProPremiumReport(input: {
  type: ProCaseType;
  payload: Record<string, unknown>;
  clientAlias: string;
  question?: string | null;
}): Promise<{
  blocks: ProReportBlock[];
  snapshot: ProChartSnapshot;
  uncertaintyMarks: { blockId: string; note: string }[];
}> {
  if (input.type !== "natal" && input.type !== "matrix" && input.type !== "hd") {
    throw Object.assign(new Error("unsupported_practice"), { status: 400 });
  }

  const focus = input.question?.trim() || null;
  let result: { blocks: ProReportBlock[]; snapshot: ProChartSnapshot };
  if (input.type === "natal") {
    result = await generateNatal(input.payload, input.clientAlias, focus);
  } else if (input.type === "matrix") {
    result = await generateMatrix(input.payload, input.clientAlias, focus);
  } else {
    result = await generateHd(input.payload, input.clientAlias, focus);
  }

  if (focus) {
    result.blocks = [
      toProBlock("q0", "Запрос", focus, { ai_confidence: 1 }),
      ...result.blocks,
    ];
  }

  return {
    blocks: result.blocks,
    snapshot: result.snapshot,
    uncertaintyMarks: result.blocks
      .filter((b) => (b.ai_confidence ?? 1) < 0.5)
      .map((b) => ({ blockId: b.id, note: "low_confidence" })),
  };
}
