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
import { getArcanaEntry } from "@/lib/numerology/arcana-dictionary";
import type { DestinyMatrixResult } from "@/lib/numerology/destiny-matrix";
import type {
  MatrixReadingDocument,
  MatrixReadingZoneBlock,
} from "@/lib/numerology/matrix-reading-document";
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
import { normalizeProPremiumBlocks } from "./pro-premium-normalize";
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
  const practiceRaw =
    typeof extras?.practice === "string" ? extras.practice.trim() : extras?.practice;
  const practiceFiltered =
    typeof practiceRaw === "string" && practiceRaw
      ? filterPractitionerOutput(practiceRaw).text
      : practiceRaw;
  return {
    id,
    title: polishProReportTitle(title),
    body: polishProReportPlainText(filtered.text),
    ai_confidence: 0.75,
    ...extras,
    practice:
      typeof practiceFiltered === "string" && practiceFiltered
        ? polishProReportPlainText(practiceFiltered)
        : practiceFiltered ?? null,
    eyebrow:
      typeof extras?.eyebrow === "string"
        ? polishProReportTitle(extras.eyebrow)
        : extras?.eyebrow ?? null,
  };
}

/** Shared Pro delivery voice: address the chart owner as «Вы». */
function proClientVoiceRules(clientAlias: string, focus: string | null): string {
  const name = clientAlias.trim() || "клиент";
  const focusBlock = focus
    ? `
ФОКУС ЗАПРОСА (главная нить всего отчёта): «${focus}»
— Если формулировка в 3-м лице («у неё/у него») про носителя карты — это запрос о ВАС (читателе отчёта).
— Во вступлении один раз назови фокус и как карта отвечает на него.
— В релевантных разделах связывай смысл с фокусом (механика / что помогает / что мешает), но НЕ повторяй формулировку запроса в начале каждого раздела и не открывай зоны фразой «ваш запрос — …».
— Не отвечай «да/нет» и не ставь сроки. Дай понятную механику: что помогает, что мешает, что делать.`
    : "";
  return `
ПРАВИЛА ОТЧЁТА ДЛЯ КЛИЕНТА ZOVUS PRO:
1) Обращение ТОЛЬКО на «Вы», по имени: «${name}, Вы…». Запрещено «ты/тебе/твой» и третье лицо («она/он/Светлана делает») — заказчик читает про себя.
2) Текст для клиента: ясный, конкретный, полный, без воды и общих фраз («все уникальны», «важно быть собой»).
3) В теле разделов НЕ используй markdown-декор: никаких **, *, #, ###, таблиц. Подпункты — обычными абзацами или тире «—». (Служебные ## заголовки разделов из списка — оставляй как требуют правила генерации; внутри раздела — чистая проза.)
4) Каждый раздел: механика простыми словами → как это проявляется → 1–2 бытовых примера.
5) В КАЖДОМ ## разделе (кроме «Вступление») завершай отдельной строкой ровно в формате:
Практика: <одно конкретное действие на 3–7 дней>
Не пиши «Что делать:» — только «Практика:». Без практики раздел считается браком.
6) Если в данных рождения есть точное время и место — во вступлении назови их один раз; в «Переменные и среда» опирайся на реальное место. Не пиши, что время неизвестно, если оно точное.
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

function matrixFocusAnswerBlock(
  clientAlias: string,
  focus: string,
  matrix: DestinyMatrixResult
): ProReportBlock {
  const money = matrix.money;
  const love = matrix.relationships;
  const moneyEntry = getArcanaEntry(money.number);
  const loveEntry = getArcanaEntry(love.number);
  const name = clientAlias.trim() || "клиент";
  const moneySense = moneyEntry?.money ?? money.arcanaMeaning;
  const loveSense = loveEntry?.love ?? love.arcanaMeaning;
  const moneyDo =
    moneyEntry?.advice ??
    "прозрачный учёт дохода/расхода и один конкретный денежный шаг за 7 дней.";
  const loveDo =
    loveEntry?.advice ??
    "одна честная граница или разговор без давления — без ультиматумов.";
  return toProBlock(
    "focus-answer",
    "Ответ на ваш запрос",
    [
      `${name}, Вы пришли с запросом «${focus}». Карта отвечает через две ключевые зоны — деньги (${money.number}, ${money.arcanaName}) и отношения (${love.number}, ${love.arcanaName}). Ниже — сжатый синтез; полный разбор зон идёт следом.`,
      "",
      `По деньгам аркан ${money.number} задаёт механику: ${moneySense} На практике это значит не ждать «удачного месяца», а выстроить понятный контур: что приносит ресурс, что его съедает, и какой один шаг Вы делаете на этой неделе. Конкретно: ${moneyDo}`,
      "",
      `По отношениям аркан ${love.number}: ${loveSense} Здесь важнее ясность контакта, чем красивая картина. Берите не обещание исхода, а действие: ${loveDo}`,
      "",
      "Читайте разделы «Деньги» и «Отношения» как главный ответ на запрос. Остальные зоны показывают опору, риски и то, что усиливает или мешает именно здесь. Без сроков и «да/нет» — только механика и шаги.",
    ].join("\n"),
    { ai_confidence: 0.95, sectionKind: "focus" }
  );
}

function prioritizeMatrixZones(
  zones: MatrixReadingZoneBlock[]
): MatrixReadingZoneBlock[] {
  const rank = (z: MatrixReadingZoneBlock) => {
    if (z.id === "money") return 0;
    if (z.id === "love") return 1;
    if (z.id === "character") return 2;
    if (z.id === "steps") return 90;
    return 50;
  };
  return [...zones].sort((a, b) => rank(a) - rank(b));
}

/** Structured matrix document → premium section cards (not a markdown wall). */
function matrixDocumentToProBlocks(
  doc: MatrixReadingDocument,
  opts: { clientAlias: string; focus: string; matrix: DestinyMatrixResult }
): ProReportBlock[] {
  const blocks: ProReportBlock[] = [];
  if (opts.focus) {
    blocks.push(matrixFocusAnswerBlock(opts.clientAlias, opts.focus, opts.matrix));
  }
  if (doc.intro?.trim()) {
    blocks.push(
      toProBlock("matrix-intro", "Вступление", doc.intro.trim(), {
        sectionKind: "intro",
        ai_confidence: 0.8,
      })
    );
  }

  const zones = opts.focus ? prioritizeMatrixZones(doc.zones) : doc.zones;
  let pos = 1;
  for (const z of zones) {
    const kind =
      z.id === "steps" ? ("steps" as const) : ("zone" as const);
    const eyebrow =
      z.number != null && z.arcanaName
        ? `${z.number} — ${z.arcanaName}`
        : null;
    blocks.push(
      toProBlock(`matrix-zone-${z.id}`, z.label, z.prose || z.title, {
        practice: z.practice,
        eyebrow,
        arcanaNumber: z.number,
        sectionKind: kind,
        ai_confidence: z.source === "ai" ? 0.78 : 0.55,
        position_ref: String(pos++),
      })
    );
  }

  if (doc.finale?.trim()) {
    blocks.push(
      toProBlock("matrix-finale", "Простыми словами", doc.finale.trim(), {
        sectionKind: "finale",
        ai_confidence: 0.9,
      })
    );
  }
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
  const tz = String(enriched.timezone || enriched.birthTz || "");
  if (!tz) {
    throw Object.assign(new Error("timezone_required"), { status: 400 });
  }
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
    focus
      ? [
          `ГЛАВНЫЙ ЗАПРОС КЛИЕНТА (нить отчёта): «${focus}».`,
          "Если формулировка в 3-м лице про носителя матрицы — это запрос о самом заказчике.",
          "Во вступлении один раз назови запрос и как карта на него отвечает.",
          "НЕ повторяй формулировку запроса в начале каждой зоны и не открывай разделы фразой «ваш запрос — …» / «ты исследуешь деньги и отношения…».",
          "Связывай зоны с запросом по смыслу (механика, что помогает/мешает), без механического рефрена.",
          "Зоны «Деньги» и «Отношения» — ключевые: там самый конкретный ответ + практика под запрос.",
          "Практики без просроченных дат-примеров; только действие на ближайшие дни/неделю.",
          "Не обещай исход, сроки, «да/нет».",
        ].join(" ")
      : null,
    typeof facts.focusLabel === "string"
      ? `Узел периода матрицы: ${facts.focusLabel}.`
      : null,
    `Обращение к заказчику ТОЛЬКО на «Вы» и по имени «${clientAlias}» (не «ты», не третье лицо).`,
    "Без markdown (** # ###) внутри прозы зоны. Чистая проза.",
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
  const blocks = matrixDocumentToProBlocks(result.document, {
    clientAlias,
    focus,
    matrix: result.matrix,
  });
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
): Promise<{
  blocks: ProReportBlock[];
  snapshot: ProChartSnapshot;
  uncertaintyMarks?: { blockId: string; note: string }[];
}> {
  const enriched = await enrichBirthPlace(payload);
  const n = normalizeBirthFields(enriched);
  if (!n.birthDate) {
    throw Object.assign(new Error("birth_date_required"), { status: 400 });
  }
  const tz = n.timezone || n.birthTz;
  if (!tz) {
    throw Object.assign(new Error("timezone_required"), {
      status: 400,
      message: "Сохраните город рождения с часовым поясом",
    });
  }
  const placeLabel = n.birthPlace || n.birthCity || null;
  const chart = calculateHdChart({
    birthDate: n.birthDate,
    birthTime: n.timeKnown ? n.birthTime ?? null : null,
    timezone: tz,
  });
  const facts = computeHdFacts({
    ...enriched,
    timezone: tz,
    birthTz: tz,
    birthPlace: placeLabel,
  });
  const focus = focusQuestion?.trim() || "";
  const proVoice = proClientVoiceRules(clientAlias, focus || null);
  const birthEvidenceOpts = { placeLabel };
  // Client receives the report about themselves → «Вы», not third person.
  // Rollback flag: HD_SECTIONAL_REPORT=0 → legacy multi-pass path.
  const generated = isHdSectionalReportEnabled()
    ? await generateHdReportSectional({
        chart,
        clientName: clientAlias,
        aboutOther: false,
        focusQuestion: focus || null,
        extraSystem: proVoice,
        placeLabel,
        maxSectionRetries: 2,
      })
    : null;
  if (!generated) {
    const text = await completeHdFullReport({
      systemPrompt:
        `${buildHdReportSystemPrompt(clientAlias, "personal", { aboutOther: false })}\n\n${proVoice}`,
      evidence: formatHdEvidence(chart, birthEvidenceOpts),
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
  // Soft-accept only cosmetic meta/md (V1/V11/V12). Everything else hard-fails.
  const SOFT_HD_QUALITY = new Set(["V1", "V11", "V12"]);
  if (!generated.text) {
    throw Object.assign(new Error("hd_generation_failed"), {
      status: 502,
      qualityFindings: generated.quality.findings,
    });
  }
  if (generated.needsRegeneration) {
    const hard = generated.quality.findings.filter(
      (f) => !SOFT_HD_QUALITY.has(f.rule)
    );
    if (hard.length) {
      throw Object.assign(new Error("hd_quality_needs_regeneration"), {
        status: 502,
        qualityFindings: generated.quality.findings,
      });
    }
    console.warn("[pro-premium] hd soft-accept after cosmetic quality findings", {
      findings: generated.quality.findings.slice(0, 12),
    });
  }
  const text = generated.text;
  const sections = hdReportTextToPrintSections(text);
  const blocks: ProReportBlock[] = sections.map((s, i) =>
    toProBlock(
      s.key || `h-${i + 1}`,
      s.title,
      s.claims.map((c) => c.text).join("\n\n"),
      {
        position_ref: String(i + 1),
        ai_confidence: generated.needsRegeneration ? 0.45 : 0.75,
      }
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
  return {
    blocks,
    snapshot,
    uncertaintyMarks: generated.needsRegeneration
      ? generated.quality.findings.map((f) => ({
          blockId: "report",
          note: `hd_quality:${f.rule}:${f.detail}`,
        }))
      : [],
  };
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
  let result: {
    blocks: ProReportBlock[];
    snapshot: ProChartSnapshot;
    uncertaintyMarks?: { blockId: string; note: string }[];
  };
  if (input.type === "natal") {
    result = await generateNatal(input.payload, input.clientAlias, focus);
  } else if (input.type === "matrix") {
    result = await generateMatrix(input.payload, input.clientAlias, focus);
  } else {
    result = await generateHd(input.payload, input.clientAlias, focus);
  }

  const blocks = normalizeProPremiumBlocks(result.blocks, {
    clientAlias: input.clientAlias,
    focus,
    caseType: input.type,
  });

  const fromConfidence = blocks
    .filter((b) => (b.ai_confidence ?? 1) < 0.5)
    .map((b) => ({ blockId: b.id, note: "low_confidence" }));
  const fromHd = result.uncertaintyMarks ?? [];
  const seen = new Set<string>();
  const uncertaintyMarks = [...fromHd, ...fromConfidence].filter((m) => {
    const key = `${m.blockId}:${m.note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    blocks,
    snapshot: result.snapshot,
    uncertaintyMarks,
  };
}
