/**
 * Paid destiny-matrix reading assembled zone-by-zone.
 * Each zone: short LLM call → on fail, premium engine template from dictionary.
 * Always ships a complete report that passes isCompleteMatrixReading.
 */
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { resolveMatrixModelChain } from "@/lib/ai-model";
import {
  buildClientGenderInstruction,
  genderLabelRu,
  resolveClientGender,
  type BinaryGender,
} from "@/lib/russian-name-gender";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { getArcanaEntry } from "./arcana-dictionary";
import { destinyMatrix, type DestinyMatrixResult } from "./destiny-matrix";
import {
  isCompleteMatrixReading,
  matrixMissingSections,
} from "./matrix-completeness";
import {
  buildMatrixPlainFinale,
  matrixRoleLens,
  type MatrixPointRole,
} from "./matrix-point-prompt";
import { appendNumerologFinale } from "./numerolog-finale-client";
import {
  listMatrixZones,
  type MatrixZoneId,
  type MatrixZoneInstance,
} from "./matrix-zones";
import {
  MATRIX_READING_SCHEMA_VERSION,
  headingLineForZone,
  parseZoneBlock,
  renderMatrixReadingMarkdown,
  type MatrixReadingDocument,
  type MatrixReadingMeta,
} from "./matrix-reading-document";

/**
 * Parallel OpenRouter calls. 9 ≈ 3 waves for ~19 zones.
 * Deepseek/chat models handle this; reasoning models still fail fast per-zone.
 */
const ZONE_BATCH = 9;
/** Non-reasoning chat models — enough for 4–6 sentences + practice. */
const ZONE_MAX_TOKENS_FAST = 750;
/**
 * Gemini 3.x burns max_tokens on reasoning_tokens; need headroom or zones truncate.
 */
const ZONE_MAX_TOKENS_REASONING = 2500;
/** Fail faster to engine template — don't hold the whole report on one stuck zone. */
const ZONE_TIMEOUT_MS = 16_000;

function isReasoningHeavyModel(model: string | undefined): boolean {
  const id = (model || "").toLowerCase();
  return id.includes("gemini-3") || id.includes("gemini-2.5") || id.includes("mimo");
}

function trimDot(s: string): string {
  return (s || "").trim().replace(/[.!?…]+$/u, "");
}

function endSentence(s: string): string {
  const t = trimDot(s);
  return t ? `${t}.` : "";
}

/**
 * Optional hero-only mode (faster/cheaper). Default paid path uses "all" —
 * hybrid left ~10 dictionary zones that users correctly call «не нормально».
 */
const HERO_LLM_ZONE_IDS: ReadonlySet<MatrixZoneId> = new Set([
  "character",
  "money",
  "love",
  "comfort",
  "year",
  "steps",
  "tail_root",
  "tail_mid",
  "tail_tip",
]);

export type MatrixLlmMode = boolean | "hero" | "all";

export type MatrixSectionedMeta = MatrixReadingMeta;

/** Soft quality floor for paid full-matrix runs (ops canary). */
export const MATRIX_AI_ZONES_CANARY_MIN = 15;

export type MatrixZoneProgress = {
  done: number;
  total: number;
  label: string;
  message: string;
};

function isReasoningLeakModelId(model: string | undefined): boolean {
  return Boolean(model && model.toLowerCase().includes("mimo"));
}

function headingLine(zone: MatrixZoneInstance): string {
  return headingLineForZone(zone);
}


function hasZoneTitle(block: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    String.raw`(?:^|\n)\s*(?:#{1,3}\s*)?(?:[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*)?${escaped}`,
    "iu"
  ).test(block);
}

/** Premium deterministic prose for one zone — exact title on its own line. */
export function renderEngineZoneProse(
  zone: MatrixZoneInstance,
  name: string,
  _gender: BinaryGender | null,
  matrix: DestinyMatrixResult
): string {
  const who = name.trim() || "друг";
  const title = headingLine(zone);

  if (zone.id === "steps") {
    const year = getArcanaEntry(matrix.yearArcana.number);
    const money = getArcanaEntry(matrix.money.number);
    const comfort = getArcanaEntry(matrix.comfort.number);
    return [
      title,
      `1) Опора характера: раз в неделю отмечай, где «${
        getArcanaEntry(matrix.body.number)?.title ?? matrix.body.arcanaName
      }» помогает, а где мешает — одно наблюдение без самокритики.`,
      `2) Зона комфорта «${comfort?.title ?? matrix.comfort.arcanaName}»: одно решение на 30 дней строго в этом векторе — без чужих сценариев.`,
      `3) Деньги через «${money?.title ?? matrix.money.arcanaName}»: один конкретный шаг (${
        money?.advice ?? "учёт, офер или разговор о цене"
      }).`,
      `4) Фон года «${year?.title ?? matrix.yearArcana.arcanaName}»: не форсируй то, что просит паузы; усиливай то, что уже двигается.`,
      `5) Узел периода (${matrix.focusLabel}): одна практика на 7 дней — маленький шаг, который можно повторить.`,
    ].join("\n");
  }

  const n = zone.number ?? 0;
  const entry = getArcanaEntry(n);
  const arcana = entry?.title ?? zone.arcanaName ?? `Аркан ${n}`;
  const role = zone.role === "steps" ? "body" : (zone.role as MatrixPointRole);
  const lens = entry ? matrixRoleLens(role, entry) : "";

  const short = entry?.shortMeaning ?? "тема этой точки матрицы";
  const light = entry?.light ?? "ресурс зоны";
  const shadow = entry?.shadow ?? "ловушка зоны";
  const advice =
    entry?.advice ?? "сделай один маленький шаг в эту сторону на этой неделе";

  const ageBit =
    zone.age != null
      ? ` Сейчас тебе около ${zone.age} — это пояс «${arcana}».`
      : "";
  const focusBit = zone.focusLabel ? ` Фокус периода: ${zone.focusLabel}.` : "";

  // Fallback when LLM misses — still zone-specific, not a shared mantra.
  const lines = [
    `${who}, в «${zone.label}» у тебя ${arcana} (${n}): ${trimDot(short)}.${ageBit}${focusBit}`,
    `Свет: ${trimDot(light)}. Тень: ${trimDot(shadow)}.`,
  ];

  if (lens) {
    lines.push(endSentence(lens));
  } else {
    lines.push(`Практика: ${trimDot(advice)}.`);
  }

  if (!/Практика\s*:/i.test(lines.join("\n"))) {
    lines.push(`Практика: ${trimDot(advice)}.`);
  }

  return `${title}\n${lines.join("\n")}`;
}

function renderEngineIntro(
  name: string,
  matrix: DestinyMatrixResult,
  gender: BinaryGender | null
): string {
  const who = name.trim() || "друг";
  const verb = gender === "female" ? "получила" : gender === "male" ? "получил" : "получил(а)";
  return `${who}, ты ${verb} полную матрицу судьбы Zovus — карту ресурсов и точек роста, где каждый аркан раскрывается в своём ключе. Ниже — разбор по зонам: опора, риск и короткая практика. Аркан года (${matrix.yearArcana.number} — ${matrix.yearArcana.arcanaName}) задаёт фон периода, а не заменяет остальные точки.`;
}

async function matrixModelChain(): Promise<string[]> {
  const models = await resolveMatrixModelChain();
  const filtered = models.filter((m) => !isReasoningLeakModelId(m));
  return filtered.length ? filtered : models;
}

async function llmOnce(
  messages: ChatMessage[],
  maxTokens: number,
  label?: string
): Promise<string | null> {
  const models = await matrixModelChain();
  if (!models.length) {
    console.warn(`[matrix-sectioned] no matrix model configured zone=${label ?? "?"}`);
    return null;
  }

  for (const model of models) {
    const budget =
      isReasoningHeavyModel(model) && maxTokens < 2000
        ? Math.max(maxTokens * 3, 2500)
        : maxTokens;

    const run = async (tokens: number) =>
      completeChatDetailed({
        messages,
        maxTokens: tokens,
        temperature: 0.45,
        isPaid: true,
        modelOverride: model,
        timeoutMs: ZONE_TIMEOUT_MS,
        // One shot per model — stuck zones fall to engine, not multi-minute retries.
        maxAttempts: 1,
        skipTemperatureRetry: true,
      });

    try {
      let result = await run(budget);
      let text = (result.text || "").trim();
      // Reasoning models often hit length with tiny content — one richer retry only for them.
      if (
        (!text || text.length < 120) &&
        result.finishReason === "length" &&
        isReasoningHeavyModel(model)
      ) {
        const richer = Math.max(budget, ZONE_MAX_TOKENS_REASONING);
        console.warn(
          `[matrix-sectioned] llm retry richer zone=${label ?? "?"} model=${model} finish=${result.finishReason} len=${text.length} tokens=${richer} usage=${JSON.stringify(result.usage ?? {})}`
        );
        result = await run(richer);
        text = (result.text || "").trim();
      }
      if (!text || text.length < 80) {
        console.warn(
          `[matrix-sectioned] llm empty/short zone=${label ?? "?"} model=${model} finish=${result.finishReason} len=${text.length} usage=${JSON.stringify(result.usage ?? {})}`
        );
        continue;
      }
      if (/Простыми\s+словами/i.test(text)) {
        text = text.split(/Простыми\s+словами/i)[0]?.trim() || "";
        if (text.length < 80) continue;
      }
      return text;
    } catch (err) {
      console.warn(
        `[matrix-sectioned] llm fail zone=${label ?? "?"} model=${model}`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return null;
}

function looksBrokenZoneLlm(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Truncated / markup debris from failed generations.
  if (t.includes("-):*") || /:\s*\*\s*$/u.test(t)) return true;
  if (/^:\s*\*/m.test(t)) return true;
  // Gemini sometimes echoes English prompt scaffolding into content.
  if (/\b(?:Practice|Prompt)\s*[:?)]/i.test(t) && !/Практика\s*:/i.test(t)) {
    return true;
  }
  if (/line\s*\(\s*Practice\s*\)/i.test(t) || /practice\?\s*Prompt\s*:/i.test(t)) {
    return true;
  }
  const bodyLines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  // Drop the title line if present — judge the prose body.
  const body = (
    bodyLines.length > 1 &&
    /^(?:Характер|Небо|Материя|Зона|Таланты|Деньги|Отношения|Род|Кармический|Точка|Ближайший|Аркан|Узел|Духовный|Шаги)/iu.test(
      bodyLines[0]!
    )
      ? bodyLines.slice(1)
      : bodyLines
  ).join("\n").trim();
  if (/^[\-):*.•]+/u.test(body)) return true;
  if (body.length < 100) return true;
  if (
    body.length < 420 &&
    !/Практика\s*:/i.test(body) &&
    !/[.!?…)]\s*$/u.test(body)
  ) {
    return true;
  }
  return false;
}

function normalizeZoneBlock(raw: string, zone: MatrixZoneInstance): string | null {
  let text = raw.replace(/\r\n/g, "\n").replace(/\*\*/g, "").trim();
  if (!text) return null;
  // Drop accidental other zone headers after the first block.
  const lines = text.split("\n");
  const kept: string[] = [];
  let sawBody = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      sawBody &&
      /^(?:Характер|Небо\s*\/\s*энергия|Материя|Зона\s+комфорта|Таланты|Деньги|Отношения|Род\s+|Кармический|Точка\s+возраста|Ближайший|Аркан\s+|Узел\s+|Духовный|Шаги\s+на)/iu.test(
        trimmed
      ) &&
      !trimmed.startsWith(zone.label)
    ) {
      break;
    }
    kept.push(line);
    if (trimmed && !trimmed.startsWith(zone.label)) sawBody = true;
  }
  text = kept.join("\n").trim();
  if (!hasZoneTitle(text, zone.label)) {
    text = `${headingLine(zone)}\n${text}`;
  }
  if (text.length < 120) {
    console.warn(
      `[matrix-sectioned] zone reject short label=${zone.label} len=${text.length}`
    );
    return null;
  }
  if (looksBrokenZoneLlm(text)) {
    console.warn(
      `[matrix-sectioned] zone reject broken label=${zone.label} len=${text.length} head=${text.slice(0, 80).replace(/\n/g, " ")}`
    );
    return null;
  }
  return text;
}

async function generateMatrixZoneLlm(
  zone: MatrixZoneInstance,
  name: string,
  gender: BinaryGender | null,
  matrix: DestinyMatrixResult
): Promise<string | null> {
  const genderBlock = buildClientGenderInstruction({ gender, firstName: name });
  const n = zone.number;
  const entry = n != null ? getArcanaEntry(n) : null;
  const role = zone.role === "steps" ? null : (zone.role as MatrixPointRole);
  const lens =
    entry && role ? matrixRoleLens(role, entry) : entry ? entry.advice : "";

  if (zone.id === "steps") {
    const system = [
      "Ты — Эвелина. Пишешь только блок «Шаги на 30 дней» для матрицы судьбы.",
      genderBlock,
      "Только «ты». Без markdown. Без других зон. Без «Простыми словами».",
      "Формат: первая строка точно «Шаги на 30 дней», затем 4–6 нумерованных шагов 1) 2) 3)…",
    ].join("\n");
    const user = [
      `Имя: ${name}`,
      gender ? `Пол: ${genderLabelRu(gender)}` : "",
      `Аркан года: ${matrix.yearArcana.number} — ${matrix.yearArcana.arcanaName}`,
      `Зона комфорта: ${matrix.comfort.number} — ${matrix.comfort.arcanaName}`,
      `Деньги: ${matrix.money.number} — ${matrix.money.arcanaName}`,
      `Узел периода: ${matrix.focusLabel}`,
      "Напиши практичные шаги на 30 дней.",
    ]
      .filter(Boolean)
      .join("\n");
    const raw = await llmOnce(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      600,
      zone.id
    );
    return raw ? normalizeZoneBlock(raw, zone) : null;
  }

  const system = [
    "Ты — Эвелина. Пишешь ОДНУ зону полной матрицы судьбы.",
    genderBlock,
    "Только «ты». Без markdown (*, #). Без других зон. Без «Простыми словами».",
    `Первая строка заголовка ДОЛЖНА быть точно: ${headingLine(zone)}`,
    "Далее 4–6 предложений и строка «Практика: …».",
    "Не копируй словарь дословно — пиши конкретно: ресурс, риск, что делать.",
  ].join("\n");

  const user = [
    `Имя: ${name}`,
    gender ? `Пол: ${genderLabelRu(gender)}` : "",
    `Зона: ${zone.label}`,
    n != null ? `Аркан: ${n} — ${entry?.title ?? zone.arcanaName}` : "",
    entry
      ? `Словарь: свет=${entry.light}; тень=${entry.shadow}; опора=${entry.resource}; риск=${entry.risk}; совет=${entry.advice}`
      : "",
    lens ? `Угол зоны: ${lens}` : "",
    zone.age != null ? `Возраст пояса: ${zone.age}` : "",
    zone.focusLabel ? `Фокус: ${zone.focusLabel}` : "",
    "Напиши только эту зону.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await llmOnce(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ZONE_MAX_TOKENS_FAST,
    zone.id
  );
  return raw ? normalizeZoneBlock(raw, zone) : null;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const part = await Promise.all(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

/**
 * Force-insert engine prose for any required titles still missing from assembled text.
 */
export function forceFillMissingSections(
  text: string,
  matrix: DestinyMatrixResult,
  name: string,
  gender: BinaryGender | null
): string {
  let out = (text || "").trim();
  const zones = listMatrixZones(matrix);
  const missing = new Set(matrixMissingSections(out));

  for (const zone of zones) {
    if (!zone.required && !missing.has(zone.label)) continue;
    const need =
      missing.has(zone.label) ||
      (zone.id.startsWith("tail_") &&
        missing.has("Кармический хвост · корень/середина/остриё")) ||
      !hasZoneTitle(out, zone.label);
    if (!need && hasZoneTitle(out, zone.label)) continue;
    if (hasZoneTitle(out, zone.label) && zone.id !== "steps") continue;

    const block = renderEngineZoneProse(zone, name, gender, matrix);
    out = `${out}\n\n${block}`.trim();
  }

  // Tail aggregate missing label → ensure all three tail blocks exist.
  if (missing.has("Кармический хвост · корень/середина/остриё")) {
    for (const id of ["tail_root", "tail_mid", "tail_tip"] as MatrixZoneId[]) {
      const zone = zones.find((z) => z.id === id);
      if (!zone || hasZoneTitle(out, zone.label)) continue;
      out = `${out}\n\n${renderEngineZoneProse(zone, name, gender, matrix)}`.trim();
    }
  }

  if (!hasZoneTitle(out, "Шаги на 30 дней")) {
    const steps = zones.find((z) => z.id === "steps");
    if (steps) {
      out = `${out}\n\n${renderEngineZoneProse(steps, name, gender, matrix)}`.trim();
    }
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export async function generateFullMatrixSectionedReading(input: {
  birthDate: string;
  name: string;
  gender?: string | null;
  /**
   * LLM coverage:
   * - omitted / true / "all" → every zone (default paid quality)
   * - "hero" → ~9 key zones + engine for the rest (faster fallback mode)
   * - false → engine templates only
   */
  useLlm?: MatrixLlmMode;
  onProgress?: (progress: MatrixZoneProgress) => void | Promise<void>;
}): Promise<{
  reading: string;
  meta: MatrixSectionedMeta;
  matrix: DestinyMatrixResult;
  document: MatrixReadingDocument;
}> {
  const matrix = destinyMatrix(input.birthDate);
  if (!matrix) {
    throw new Error("matrix_calc_failed");
  }

  const displayName =
    normalizePersonDisplayName(input.name) || input.name.trim() || "друг";
  const gender = resolveClientGender(input.gender, displayName);
  const zones = listMatrixZones(matrix);
  const mode: "off" | "hero" | "all" =
    input.useLlm === false ? "off" : input.useLlm === "hero" ? "hero" : "all";

  let aiZones = 0;
  let engineZones = 0;
  let completedZones = 0;

  const reportProgress = async (label: string) => {
    if (!input.onProgress) return;
    await input.onProgress({
      done: completedZones,
      total: zones.length,
      label,
      message:
        completedZones === 0
          ? "Собираю вступление…"
          : `Собираю зоны ${completedZones}/${zones.length}: ${label}`,
    });
  };

  await reportProgress("Вступление");
  // Engine intro — skip a serial LLM round-trip before ~19 zone calls.
  const intro = renderEngineIntro(displayName, matrix, gender);

  const zoneBlocks = await mapInBatches(zones, ZONE_BATCH, async (zone) => {
    const wantLlm =
      mode === "all" || (mode === "hero" && HERO_LLM_ZONE_IDS.has(zone.id));
    let block: string;
    let source: "ai" | "engine";
    if (wantLlm) {
      let llm: string | null = null;
      try {
        llm = await generateMatrixZoneLlm(zone, displayName, gender, matrix);
      } catch (err) {
        console.warn(
          `[matrix-sectioned] zone throw label=${zone.label}`,
          err instanceof Error ? err.message : err
        );
      }
      if (llm) {
        aiZones += 1;
        block = llm;
        source = "ai";
      } else {
        engineZones += 1;
        block = renderEngineZoneProse(zone, displayName, gender, matrix);
        source = "engine";
      }
    } else {
      engineZones += 1;
      block = renderEngineZoneProse(zone, displayName, gender, matrix);
      source = "engine";
    }
    completedZones += 1;
    await reportProgress(zone.label);
    return { zone, block, source };
  });

  // Rebuild missing zones from engine into the block list (by zone id).
  let filledBlocks = [...zoneBlocks];
  {
    const draftPlain = [
      intro,
      ...filledBlocks.map((z) => z.block),
    ].join("\n\n");
    const missing = new Set(matrixMissingSections(draftPlain));
    if (missing.size) {
      filledBlocks = filledBlocks.map((item) => {
        if (!missing.has(item.zone.label) && !missing.has("Кармический хвост · корень/середина/остриё")) {
          return item;
        }
        // Tail coverage is aggregate — refill individual missing tails via title check.
        const engine = renderEngineZoneProse(item.zone, displayName, gender, matrix);
        if (missing.has(item.zone.label) || !hasZoneTitle(item.block, item.zone.label)) {
          engineZones += 1;
          if (item.source === "ai") aiZones = Math.max(0, aiZones - 1);
          return { zone: item.zone, block: engine, source: "engine" as const };
        }
        return item;
      });
      // Add any required zone completely absent from list (shouldn't happen).
      for (const z of zones) {
        if (filledBlocks.some((b) => b.zone.id === z.id)) continue;
        filledBlocks.push({
          zone: z,
          block: renderEngineZoneProse(z, displayName, gender, matrix),
          source: "engine",
        });
        engineZones += 1;
      }
    }
  }

  const finale = buildMatrixPlainFinale(displayName, matrix);
  let document: MatrixReadingDocument = {
    schemaVersion: MATRIX_READING_SCHEMA_VERSION,
    intro: intro.trim(),
    zones: filledBlocks.map((b) => parseZoneBlock(b.block, b.zone, b.source)),
    finale,
    meta: {
      aiZones,
      engineZones,
      totalZones: zones.length,
    },
  };

  let reading = renderMatrixReadingMarkdown(document);

  if (!isCompleteMatrixReading(reading)) {
    console.warn(
      "[matrix-sectioned] structured markdown incomplete; engine-filling missing:",
      matrixMissingSections(reading).join(", ")
    );
    const byId = new Map(document.zones.map((z) => [z.id, z]));
    for (const z of zones) {
      const title = headingLine(z);
      if (hasZoneTitle(reading, z.label) || hasZoneTitle(reading, title)) continue;
      const engineBlock = renderEngineZoneProse(z, displayName, gender, matrix);
      byId.set(z.id, parseZoneBlock(engineBlock, z, "engine"));
      engineZones += 1;
    }
    document = {
      ...document,
      zones: zones.map(
        (z) => byId.get(z.id) ?? parseZoneBlock(renderEngineZoneProse(z, displayName, gender, matrix), z, "engine")
      ),
      meta: {
        aiZones,
        engineZones,
        totalZones: zones.length,
      },
    };
    reading = renderMatrixReadingMarkdown(document);
  }

  if (!isCompleteMatrixReading(reading)) {
    console.warn(
      "[matrix-sectioned] forcing pure engine document; still missing:",
      matrixMissingSections(reading).join(", ")
    );
    document = {
      schemaVersion: MATRIX_READING_SCHEMA_VERSION,
      intro: renderEngineIntro(displayName, matrix, gender),
      zones: zones.map((z) =>
        parseZoneBlock(renderEngineZoneProse(z, displayName, gender, matrix), z, "engine")
      ),
      finale,
      meta: {
        aiZones: 0,
        engineZones: zones.length,
        totalZones: zones.length,
      },
    };
    reading = renderMatrixReadingMarkdown(document);
    aiZones = 0;
    engineZones = zones.length;
  }

  // Keep finale append helper for clients that scan «Простыми словами».
  if (!/Простыми\s+словами/i.test(reading)) {
    reading = appendNumerologFinale(reading, finale);
  }

  const meta: MatrixSectionedMeta = {
    aiZones: document.meta.aiZones,
    engineZones: document.meta.engineZones,
    totalZones: document.meta.totalZones,
  };
  console.info(
    `[matrix-sectioned] zones ai=${meta.aiZones} engine=${meta.engineZones} total=${meta.totalZones} len=${reading.length} structured=1`
  );
  if (mode === "all" && meta.aiZones < MATRIX_AI_ZONES_CANARY_MIN) {
    console.warn(
      `[matrix-sectioned] quality canary: aiZones=${meta.aiZones} < ${MATRIX_AI_ZONES_CANARY_MIN} (engine=${meta.engineZones})`
    );
  }

  return { reading, meta, matrix, document };
}
