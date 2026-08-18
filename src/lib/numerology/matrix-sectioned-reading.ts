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
  type BinaryGender,
} from "@/lib/russian-name-gender";
import type { MatrixSubjectKind } from "@/lib/services/matrix-subject-service";
import { getArcanaEntry } from "./arcana-dictionary";
import { destinyMatrix, type DestinyMatrixResult } from "./destiny-matrix";
import {
  buildMatrixAudience,
  buildMatrixAudiencePromptBlock,
  isMatrixAboutOther,
  subjectHandle,
  type MatrixAudience,
} from "./matrix-audience";
import {
  canonicalizeArcanaNamesInText,
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
 * Parallel OpenRouter calls. 10 ≈ 2 waves for ~19 zones (hero-first ordering).
 * Deepseek/chat models handle this; reasoning models still fail fast per-zone.
 */
const ZONE_BATCH = 10;
/** Non-reasoning chat models — enough for 4–6 sentences + practice. */
const ZONE_MAX_TOKENS_FAST = 750;
/**
 * Gemini 3.x burns max_tokens on reasoning_tokens; need headroom or zones truncate.
 */
const ZONE_MAX_TOKENS_REASONING = 2500;
/** Fail faster to engine template — don't hold the whole report on one stuck zone. */
const ZONE_TIMEOUT_MS = 12_000;

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

/** Hard quality floor for paid full-matrix runs (mode=all). Below → fail + refund. */
export const MATRIX_AI_ZONES_CANARY_MIN = 15;

export class MatrixQualityCanaryError extends Error {
  readonly code = "matrix_ai_canary" as const;
  readonly meta: MatrixSectionedMeta;

  constructor(meta: MatrixSectionedMeta) {
    super(
      `matrix_ai_canary: aiZones=${meta.aiZones} < ${MATRIX_AI_ZONES_CANARY_MIN} (engine=${meta.engineZones})`
    );
    this.name = "MatrixQualityCanaryError";
    this.meta = meta;
  }
}

export function isMatrixQualityCanaryError(err: unknown): err is MatrixQualityCanaryError {
  return err instanceof MatrixQualityCanaryError ||
    (err instanceof Error && (err as { code?: string }).code === "matrix_ai_canary");
}

/** Clamp user-controlled name before it enters LLM prompts. */
export function clampMatrixPromptName(raw: string): string {
  const cleaned = (raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  // Block obvious instruction-injection shapes inside the name slot.
  if (/ignor(e|ир)|system\s*:|you\s+are|ты\s+теперь/i.test(cleaned)) {
    return "друг";
  }
  return cleaned || "друг";
}

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
function audienceFromLegacyName(
  name: string,
  gender: BinaryGender | null
): MatrixAudience {
  return buildMatrixAudience({
    subjectKind: "self",
    readerName: name,
    readerGender: gender,
    subjectName: name,
  });
}

export function renderEngineZoneProse(
  zone: MatrixZoneInstance,
  nameOrAudience: string | MatrixAudience,
  genderOrMatrix: BinaryGender | null | DestinyMatrixResult,
  matrixMaybe?: DestinyMatrixResult
): string {
  // Back-compat: (zone, name, gender, matrix) or (zone, audience, matrix).
  const audience: MatrixAudience =
    typeof nameOrAudience === "string"
      ? audienceFromLegacyName(nameOrAudience, genderOrMatrix as BinaryGender | null)
      : nameOrAudience;
  const matrix =
    typeof nameOrAudience === "string"
      ? (matrixMaybe as DestinyMatrixResult)
      : (genderOrMatrix as DestinyMatrixResult);

  const reader = audience.readerName.trim() || "друг";
  const aboutOther = isMatrixAboutOther(audience.subjectKind);
  const subject = subjectHandle(audience.subjectKind, audience.subjectName);
  const title = headingLine(zone);

  if (zone.id === "steps") {
    const year = getArcanaEntry(matrix.yearArcana.number);
    const money = getArcanaEntry(matrix.money.number);
    const comfort = getArcanaEntry(matrix.comfort.number);
    if (aboutOther) {
      return [
        title,
        `1) Опора характера ${subject}: раз в неделю отмечай, где «${
          getArcanaEntry(matrix.body.number)?.title ?? matrix.body.arcanaName
        }» проявляется рядом с тобой — одно наблюдение без оценки.`,
        `2) Зона комфорта «${comfort?.title ?? matrix.comfort.arcanaName}»: одно решение на 30 дней, как ты поддерживаешь ${subject} в этом векторе — без чужих сценариев.`,
        `3) Деньги через «${money?.title ?? matrix.money.arcanaName}»: один конкретный шаг с твоей стороны (${
          money?.advice ?? "разговор о границах, учёте или договорённостях"
        }).`,
        `4) Фон года «${year?.title ?? matrix.yearArcana.arcanaName}»: не форсируй то, что просит паузы у ${subject}; усиливай то, что уже двигается.`,
        `5) Узел периода (${matrix.focusLabel}): одна практика на 7 дней для тебя как сопровождающего — маленький шаг, который можно повторить.`,
      ].join("\n");
    }
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
      ? aboutOther
        ? ` Сейчас ${subject} около ${zone.age} — это пояс «${arcana}».`
        : ` Сейчас тебе около ${zone.age} — это пояс «${arcana}».`
      : "";
  const focusBit = zone.focusLabel ? ` Фокус периода: ${zone.focusLabel}.` : "";

  const lines = aboutOther
    ? [
        `${reader}, в «${zone.label}» у ${subject} ${arcana} (${n}): ${trimDot(short)}.${ageBit}${focusBit}`,
        `Свет: ${trimDot(light)}. Тень: ${trimDot(shadow)}.`,
      ]
    : [
        `${reader}, в «${zone.label}» у тебя ${arcana} (${n}): ${trimDot(short)}.${ageBit}${focusBit}`,
        `Свет: ${trimDot(light)}. Тень: ${trimDot(shadow)}.`,
      ];

  if (lens) {
    lines.push(endSentence(lens));
  } else {
    lines.push(
      aboutOther
        ? `Практика для тебя: ${trimDot(advice)}.`
        : `Практика: ${trimDot(advice)}.`
    );
  }

  if (!/Практика\s*:/i.test(lines.join("\n"))) {
    lines.push(
      aboutOther
        ? `Практика для тебя: ${trimDot(advice)}.`
        : `Практика: ${trimDot(advice)}.`
    );
  }

  return `${title}\n${lines.join("\n")}`;
}

function renderEngineIntro(
  audience: MatrixAudience,
  matrix: DestinyMatrixResult
): string {
  const who = audience.readerName.trim() || "друг";
  const gender = audience.readerGender;
  if (isMatrixAboutOther(audience.subjectKind)) {
    const subject = subjectHandle(audience.subjectKind, audience.subjectName);
    const kindLabel =
      audience.subjectKind === "child"
        ? "детскую матрицу"
        : "матрицу судьбы";
    return `${who}, ты смотришь ${kindLabel} ${subject} — карту ресурсов и точек роста этого человека. Ниже — разбор по зонам: что видно в арканах, где опора и риск, и короткая практика для тебя. Аркан года (${matrix.yearArcana.number} — ${matrix.yearArcana.arcanaName}) задаёт фон периода, а не заменяет остальные точки.`;
  }
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

/**
 * Arcana-number fidelity: the zone's own number must appear (title or body), and any
 * other 1–22 number mentioned next to an arcana-ish word must belong to this matrix.
 * Otherwise the model swapped/invented an arcana and the block is unsafe to ship.
 */
function zoneHasForeignArcana(text: string, zone: MatrixZoneInstance, matrix: DestinyMatrixResult): boolean {
  if (zone.number == null) return false;
  const allowed = new Set<number>([
    matrix.body.number,
    matrix.energy.number,
    matrix.roots.number,
    matrix.comfort.number,
    matrix.talents.number,
    matrix.money.number,
    matrix.relationships.number,
    matrix.paternal.number,
    matrix.maternal.number,
    matrix.purpose.number,
    matrix.skySpirit.number,
    matrix.yearArcana.number,
    matrix.monthArcana.number,
    matrix.ageCurrent.number,
    matrix.karmicTail[0].number,
    matrix.karmicTail[1].number,
    matrix.karmicTail[2].number,
  ]);
  if (matrix.ageNext) allowed.add(matrix.ageNext.number);
  for (const p of matrix.agePoints) allowed.add(p.number);
  for (const ch of matrix.channels) {
    for (const p of ch.points) allowed.add(p.number);
  }

  const t = text.replace(/\*\*/g, "");
  if (!new RegExp(`\\b${zone.number}\\b`).test(t)) return true;
  for (const m of t.matchAll(/(\d{1,2})(?=\s*(?:[—–-]\s*)?[А-ЯЁA-Z][^\n]{0,40}(?:аркан|старш))/giu)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 22 && !allowed.has(n)) return true;
  }
  for (const m of t.matchAll(/аркан[а-яё]*\s*(?:№\s*)?(\d{1,2})/giu)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 22 && !allowed.has(n)) return true;
  }
  return false;
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

/** LLM block is only usable when its arcana numbers match the engine for this matrix. */
function zoneLlmFidelityOk(
  text: string,
  zone: MatrixZoneInstance,
  matrix: DestinyMatrixResult
): boolean {
  if (!zoneHasForeignArcana(text, zone, matrix)) return true;
  console.warn(`[matrix-sectioned] zone reject arcana-fidelity label=${zone.label}`);
  return false;
}

async function generateMatrixZoneLlm(
  zone: MatrixZoneInstance,
  audience: MatrixAudience,
  matrix: DestinyMatrixResult,
  contextFacts?: string | null
): Promise<string | null> {
  const readerName = clampMatrixPromptName(audience.readerName);
  const gender = audience.readerGender;
  const genderBlock = buildClientGenderInstruction({
    gender,
    firstName: readerName,
  });
  const audienceBlock = buildMatrixAudiencePromptBlock({
    ...audience,
    readerName,
  });
  const aboutOther = isMatrixAboutOther(audience.subjectKind);
  const n = zone.number;
  const entry = n != null ? getArcanaEntry(n) : null;
  const role = zone.role === "steps" ? null : (zone.role as MatrixPointRole);
  const lens =
    entry && role ? matrixRoleLens(role, entry) : entry ? entry.advice : "";
  const skyRaw = contextFacts?.trim() || "";
  const skyIsClientFocus =
    /ГЛАВНЫЙ ЗАПРОС|Фокус запроса заказчика/i.test(skyRaw);
  const skyHint = skyRaw
    ? skyIsClientFocus
      ? `ОБЯЗАТЕЛЬНЫЙ ФОКУС ОТЧЁТА (вернись к нему в тексте этой зоны и в практике; арканы не меняй): ${skyRaw.slice(0, 900)}`
      : `Небо (мягкий слой, не меняй арканы): ${skyRaw.slice(0, 600)}`
    : "";

  if (zone.id === "steps") {
    const system = [
      "Ты — Эвелина. Пишешь только блок «Шаги на 30 дней» для матрицы судьбы.",
      genderBlock,
      audienceBlock,
      aboutOther
        ? "Шаги — действия для заказчика (на «ты»), опираясь на матрицу другого человека. Без markdown. Без других зон."
        : "Только «ты» к клиенту. Без markdown. Без других зон. Без «Простыми словами».",
      "Формат: первая строка точно «Шаги на 30 дней», затем 4–6 нумерованных шагов 1) 2) 3)…",
      "Названия арканов ниже — готовые строки движка. Запрещено переименовывать арканы.",
    ].join("\n");
    const user = [
      audienceBlock,
      gender ? `Пол заказчика: ${genderLabelRu(gender)}` : "",
      `Аркан года (готовая строка): ${matrix.yearArcana.number} — ${matrix.yearArcana.arcanaName}`,
      `Зона комфорта (готовая строка): ${matrix.comfort.number} — ${matrix.comfort.arcanaName}`,
      `Деньги (готовая строка): ${matrix.money.number} — ${matrix.money.arcanaName}`,
      `Узел периода: ${matrix.focusLabel}`,
      skyHint,
      aboutOther
        ? "Напиши практичные шаги на 30 дней для заказчика."
        : "Напиши практичные шаги на 30 дней.",
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

  const lockedArcana =
    n != null
      ? `${n} — ${entry?.title ?? zone.arcanaName ?? "аркан"}`
      : null;
  const system = [
    "Ты — Эвелина. Пишешь ОДНУ зону полной матрицы судьбы.",
    genderBlock,
    audienceBlock,
    aboutOther
      ? "К заказчику только «ты». Человека матрицы описывай в третьем лице. Практика — для заказчика."
      : "Только «ты» к клиенту.",
    "Без markdown (*, #). Без других зон. Без «Простыми словами».",
    `Первая строка заголовка ДОЛЖНА быть точно: ${headingLine(zone)}`,
    lockedArcana
      ? `Название аркана ЗАФИКСИРОВАНО движком: «${lockedArcana}». Запрещено называть иначе (не Правосудие/Justice вместо Справедливость, не Марсельская нумерация 8=Справедливость). Не выдумывай другие номера и названия.`
      : "",
    aboutOther
      ? "Далее 4–6 предложений про человека матрицы и строка «Практика: …» для заказчика."
      : "Далее 4–6 предложений и строка «Практика: …».",
    "Не копируй словарь дословно — пиши конкретно: ресурс, риск, что делать.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    audienceBlock,
    gender ? `Пол заказчика: ${genderLabelRu(gender)}` : "",
    `Зона: ${zone.label}`,
    lockedArcana ? `Аркан (готовая строка, копируй как есть): ${lockedArcana}` : "",
    entry
      ? `Словарь: свет=${entry.light}; тень=${entry.shadow}; опора=${entry.resource}; риск=${entry.risk}; совет=${entry.advice}`
      : "",
    lens ? `Угол зоны: ${lens}` : "",
    zone.age != null ? `Возраст пояса: ${zone.age}` : "",
    zone.focusLabel ? `Фокус: ${zone.focusLabel}` : "",
    skyHint,
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
  if (!raw) return null;
  const normalized = normalizeZoneBlock(
    canonicalizeArcanaNamesInText(raw),
    zone
  );
  if (!normalized) return null;
  return zoneLlmFidelityOk(normalized, zone, matrix) ? normalized : null;
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
  nameOrAudience: string | MatrixAudience,
  gender: BinaryGender | null = null,
  toolId?: string
): string {
  const audience =
    typeof nameOrAudience === "string"
      ? audienceFromLegacyName(nameOrAudience, gender)
      : nameOrAudience;
  let out = (text || "").trim();
  const zones = listMatrixZones(matrix, toolId);
  const missing = new Set(matrixMissingSections(out, toolId));

  for (const zone of zones) {
    if (!zone.required && !missing.has(zone.label)) continue;
    const need =
      missing.has(zone.label) ||
      (zone.id.startsWith("tail_") &&
        missing.has("Кармический хвост · корень/середина/остриё")) ||
      !hasZoneTitle(out, zone.label);
    if (!need && hasZoneTitle(out, zone.label)) continue;
    if (hasZoneTitle(out, zone.label) && zone.id !== "steps") continue;

    const block = renderEngineZoneProse(zone, audience, matrix);
    out = `${out}\n\n${block}`.trim();
  }

  // Tail aggregate missing label → ensure all three tail blocks exist.
  if (missing.has("Кармический хвост · корень/середина/остриё")) {
    for (const id of ["tail_root", "tail_mid", "tail_tip"] as MatrixZoneId[]) {
      const zone = zones.find((z) => z.id === id);
      if (!zone || hasZoneTitle(out, zone.label)) continue;
      out = `${out}\n\n${renderEngineZoneProse(zone, audience, matrix)}`.trim();
    }
  }

  if (!hasZoneTitle(out, "Шаги на 30 дней")) {
    const steps = zones.find((z) => z.id === "steps");
    if (steps) {
      out = `${out}\n\n${renderEngineZoneProse(steps, audience, matrix)}`.trim();
    }
  }

  if (!/Простыми\s+словами/i.test(out)) {
    out = appendNumerologFinale(
      out,
      "Матрица собрана по дате рождения. Держите внимание на шагах на ближайшие 30 дней."
    );
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export async function generateFullMatrixSectionedReading(input: {
  birthDate: string;
  name: string;
  toolId?: "destiny_matrix" | "child_matrix";
  gender?: string | null;
  /** Whose matrix this is. Default self — address `name` on «ты». */
  subjectKind?: MatrixSubjectKind | null;
  /** Subject display name when kind ≠ self. Defaults to `name`. */
  subjectName?: string | null;
  /**
   * Soft natal / memory facts for LLM prompts only (does not change arcana numbers).
   */
  contextFacts?: string | null;
  /**
   * Freeze calendar day for period-dependent zones (guest→auth continuity).
   * When omitted, destinyMatrix uses "now" (existing behavior).
   */
  asOfDate?: string | null;
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
  const asOf =
    typeof input.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)
      ? input.asOfDate
      : undefined;
  const matrix = destinyMatrix(input.birthDate, asOf ? { asOfDate: asOf } : undefined);
  if (!matrix) {
    throw new Error("matrix_calc_failed");
  }

  const audience = buildMatrixAudience({
    subjectKind:
      input.subjectKind ??
      (input.toolId === "child_matrix" ? "child" : "self"),
    readerName: input.name,
    readerGender: input.gender,
    subjectName: input.subjectName ?? input.name,
  });
  audience.readerName = clampMatrixPromptName(audience.readerName);
  audience.subjectName = clampMatrixPromptName(audience.subjectName);
  const contextFacts = input.contextFacts?.trim() || null;
  const toolId = input.toolId ?? "destiny_matrix";
  const zones = listMatrixZones(matrix, toolId);
  const mode: "off" | "hero" | "all" =
    input.useLlm === false ? "off" : input.useLlm === "hero" ? "hero" : "all";
  const aboutOther = isMatrixAboutOther(audience.subjectKind);

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
  const intro = renderEngineIntro(audience, matrix);

  const runZoneLlm = async (zone: MatrixZoneInstance): Promise<string | null> => {
    try {
      return await generateMatrixZoneLlm(zone, audience, matrix, contextFacts);
    } catch (err) {
      console.warn(
        `[matrix-sectioned] zone throw label=${zone.label}`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  };

  // Hero zones first — progress UI reaches money/love/comfort sooner; 2 waves total.
  const orderedZones = [
    ...zones.filter((z) => HERO_LLM_ZONE_IDS.has(z.id)),
    ...zones.filter((z) => !HERO_LLM_ZONE_IDS.has(z.id)),
  ];

  let zoneBlocks = await mapInBatches(orderedZones, ZONE_BATCH, async (zone) => {
    const wantLlm =
      mode === "all" || (mode === "hero" && HERO_LLM_ZONE_IDS.has(zone.id));
    let block: string;
    let source: "ai" | "engine";
    if (wantLlm) {
      const llm = await runZoneLlm(zone);
      if (llm) {
        aiZones += 1;
        block = llm;
        source = "ai";
      } else {
        engineZones += 1;
        block = renderEngineZoneProse(zone, audience, matrix);
        source = "engine";
      }
    } else {
      engineZones += 1;
      block = renderEngineZoneProse(zone, audience, matrix);
      source = "engine";
    }
    completedZones += 1;
    await reportProgress(zone.label);
    return { zone, block, source };
  });

  // One parallel retry pass only for zones that wanted LLM but fell to engine.
  if (mode !== "off") {
    const retryIdx = zoneBlocks
      .map((b, i) => ({ b, i }))
      .filter(
        ({ b }) =>
          b.source === "engine" &&
          (mode === "all" || HERO_LLM_ZONE_IDS.has(b.zone.id))
      );
    if (retryIdx.length) {
      await reportProgress("Добираю зоны…");
      const retried = await mapInBatches(retryIdx, ZONE_BATCH, async ({ b }) => {
        const llm = await runZoneLlm(b.zone);
        return { id: b.zone.id, llm };
      });
      const byId = new Map(retried.map((r) => [r.id, r.llm]));
      zoneBlocks = zoneBlocks.map((item) => {
        const llm = byId.get(item.zone.id);
        if (!llm || item.source === "ai") return item;
        aiZones += 1;
        engineZones = Math.max(0, engineZones - 1);
        return { zone: item.zone, block: llm, source: "ai" as const };
      });
    }
  }

  // Restore canonical zone order for the document (not hero-first).
  {
    const byId = new Map(zoneBlocks.map((b) => [b.zone.id, b]));
    zoneBlocks = zones.map(
      (z) =>
        byId.get(z.id) ?? {
          zone: z,
          block: renderEngineZoneProse(z, audience, matrix),
          source: "engine" as const,
        }
    );
  }

  const finale = buildMatrixPlainFinale(audience.readerName, matrix, {
    aboutOther,
    subjectName: audience.subjectName,
  });

  // Rebuild missing zones from engine into the block list (by zone id).
  let filledBlocks = [...zoneBlocks];
  {
    const draftPlain = [
      intro,
      ...filledBlocks.map((z) => z.block),
      finale,
    ].join("\n\n");
    const missing = new Set(
      matrixMissingSections(draftPlain, toolId).filter((m) => m !== "Простыми словами")
    );
    if (missing.size) {
      filledBlocks = filledBlocks.map((item) => {
        if (!missing.has(item.zone.label) && !missing.has("Кармический хвост · корень/середина/остриё")) {
          return item;
        }
        // Tail coverage is aggregate — refill individual missing tails via title check.
        const engine = renderEngineZoneProse(item.zone, audience, matrix);
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
          block: renderEngineZoneProse(z, audience, matrix),
          source: "engine",
        });
        engineZones += 1;
      }
    }
  }
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

  if (!isCompleteMatrixReading(reading, toolId)) {
    console.warn(
      "[matrix-sectioned] structured markdown incomplete; engine-filling missing:",
      matrixMissingSections(reading, toolId).join(", ")
    );
    const byId = new Map(document.zones.map((z) => [z.id, z]));
    for (const z of zones) {
      const title = headingLine(z);
      if (hasZoneTitle(reading, z.label) || hasZoneTitle(reading, title)) continue;
      const engineBlock = renderEngineZoneProse(z, audience, matrix);
      byId.set(z.id, parseZoneBlock(engineBlock, z, "engine"));
      engineZones += 1;
    }
    document = {
      ...document,
      zones: zones.map(
        (z) =>
          byId.get(z.id) ??
          parseZoneBlock(renderEngineZoneProse(z, audience, matrix), z, "engine")
      ),
      meta: {
        aiZones,
        engineZones,
        totalZones: zones.length,
      },
    };
    reading = renderMatrixReadingMarkdown(document);
  }

  if (!isCompleteMatrixReading(reading, toolId)) {
    // Paid full path must never silently ship a pure dictionary report.
    if (mode === "all") {
      const metaFail: MatrixSectionedMeta = {
        aiZones: document.meta.aiZones,
        engineZones: document.meta.engineZones,
        totalZones: zones.length,
      };
      console.error(
        "[matrix-sectioned] incomplete after fill on paid path; refusing engine dump",
        matrixMissingSections(reading, toolId).join(", "),
        metaFail
      );
      throw new MatrixQualityCanaryError(metaFail);
    }
    console.warn(
      "[matrix-sectioned] forcing pure engine document; still missing:",
      matrixMissingSections(reading).join(", ")
    );
    document = {
      schemaVersion: MATRIX_READING_SCHEMA_VERSION,
      intro: renderEngineIntro(audience, matrix),
      zones: zones.map((z) =>
        parseZoneBlock(renderEngineZoneProse(z, audience, matrix), z, "engine")
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

  // Engine titles win over LLM renames (Marseille swaps / synonyms).
  reading = canonicalizeArcanaNamesInText(reading);

  const meta: MatrixSectionedMeta = {
    aiZones: document.meta.aiZones,
    engineZones: document.meta.engineZones,
    totalZones: document.meta.totalZones,
  };
  console.info(
    `[matrix-sectioned] zones ai=${meta.aiZones} engine=${meta.engineZones} total=${meta.totalZones} len=${reading.length} structured=1`
  );
  if (mode === "all" && meta.aiZones < MATRIX_AI_ZONES_CANARY_MIN) {
    console.error(
      `[matrix-sectioned] quality canary FAIL: aiZones=${meta.aiZones} < ${MATRIX_AI_ZONES_CANARY_MIN} (engine=${meta.engineZones})`
    );
    throw new MatrixQualityCanaryError(meta);
  }

  return { reading, meta, matrix, document };
}
