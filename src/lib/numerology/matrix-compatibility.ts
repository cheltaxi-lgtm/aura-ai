/**
 * Pair destiny-matrix compatibility (matrix-v2) — MVP keys for love/money/comfort/tail/year.
 */
import { getMatrixArcanaEntry } from "./matrix-arcana-map";
import { MATRIX_METHODOLOGY_ID } from "./matrix-result";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  reduceToArcanaNumber,
  type DestinyMatrixResult,
} from "./destiny-matrix";
import { parseBirthDate } from "./constants";

export type MatrixCompatKey = {
  id: "comfort" | "love" | "money" | "tail" | "year" | "purpose" | "tension" | "pairYear";
  label: string;
  numberA: number;
  numberB: number;
  titleA: string;
  titleB: string;
  score: number;
  note: string;
  practice: string;
};

export type MatrixCompatibilityResult = {
  score: number;
  matrixA: DestinyMatrixResult;
  matrixB: DestinyMatrixResult;
  keys: MatrixCompatKey[];
  summary: string;
  strengths: string[];
  risks: string[];
  pairComfort: number;
  pairYear: number;
  personA: { methodologyId: string; calculationVersion: string };
  personB: { methodologyId: string; calculationVersion: string };
  compatibility: { methodologyId: string; calculationVersion: string };
};

function pairScore(a: number, b: number): number {
  if (a === b) return 92;
  const diff = Math.abs(a - b);
  if (diff === 1 || diff === 21) return 84;
  if (diff === 2 || diff === 20) return 76;
  if (diff <= 4) return 68;
  if (diff <= 7) return 58;
  return Math.max(38, 55 - diff);
}

function titleOf(n: number): string {
  return getMatrixArcanaEntry(n, MATRIX_CALCULATION_VERSION)?.title ?? `Аркан ${n}`;
}

function noteFor(
  label: string,
  a: number,
  b: number,
  soft: string,
  hard: string
): string {
  if (a === b) return `${label}: общий аркан ${a} (${titleOf(a)}) — ${soft}`;
  const s = pairScore(a, b);
  if (s >= 75) return `${label}: ${a} (${titleOf(a)}) и ${b} (${titleOf(b)}) — ${soft}`;
  return `${label}: ${a} (${titleOf(a)}) и ${b} (${titleOf(b)}) — ${hard}`;
}

/** Compare two birth dates via matrix-v2 key points. */
export function matrixCompatibility(
  dateA: string,
  dateB: string
): MatrixCompatibilityResult | null {
  if (!parseBirthDate(dateA) || !parseBirthDate(dateB)) return null;
  const matrixA = destinyMatrix(dateA);
  const matrixB = destinyMatrix(dateB);
  if (!matrixA || !matrixB) return null;

  const keys: MatrixCompatKey[] = [
    {
      id: "purpose",
      label: "Зачем встретились",
      numberA: matrixA.purpose.number,
      numberB: matrixB.purpose.number,
      titleA: matrixA.purpose.arcanaName,
      titleB: matrixB.purpose.arcanaName,
      score: pairScore(matrixA.purpose.number, matrixB.purpose.number),
      note: noteFor("Смысл встречи", matrixA.purpose.number, matrixB.purpose.number, "пара усиливает общий вектор роста.", "союз учит видеть разные способы быть собой."),
      practice: "Раз в месяц сверяйте: что каждый хочет сохранить в этом союзе и чему научиться рядом.",
    },
    {
      id: "comfort",
      label: "Зона комфорта",
      numberA: matrixA.comfort.number,
      numberB: matrixB.comfort.number,
      titleA: matrixA.comfort.arcanaName,
      titleB: matrixB.comfort.arcanaName,
      score: pairScore(matrixA.comfort.number, matrixB.comfort.number),
      note: noteFor(
        "Комфорт",
        matrixA.comfort.number,
        matrixB.comfort.number,
        "похожий ритм восстановления и «домашней» энергии.",
        "разный базовый ритм — важно договариваться о личном пространстве."
      ),
      practice:
        "Раз в неделю явно называйте, что сейчас нужно каждому для восстановления (тишина / разговор / дело).",
    },
    {
      id: "love",
      label: "Канал отношений",
      numberA: matrixA.relationships.number,
      numberB: matrixB.relationships.number,
      titleA: matrixA.relationships.arcanaName,
      titleB: matrixB.relationships.arcanaName,
      score: pairScore(matrixA.relationships.number, matrixB.relationships.number),
      note: noteFor(
        "Отношения",
        matrixA.relationships.number,
        matrixB.relationships.number,
        "близкий язык близости и поддержки.",
        "разные ожидания от близости — проговаривайте формат внимания."
      ),
      practice:
        "Один короткий ритуал недели: 20 минут без телефона — только про «как ты?» и «что тебе важно».",
    },
    {
      id: "money",
      label: "Денежный канал",
      numberA: matrixA.money.number,
      numberB: matrixB.money.number,
      titleA: matrixA.money.arcanaName,
      titleB: matrixB.money.arcanaName,
      score: pairScore(matrixA.money.number, matrixB.money.number),
      note: noteFor(
        "Деньги",
        matrixA.money.number,
        matrixB.money.number,
        "схожий стиль решений вокруг ресурсов.",
        "разный темп/риск в деньгах — лучше явные роли и бюджетные правила."
      ),
      practice:
        "Раз в месяц 15 минут: общий обзор «что тянет / что кормит» без спора о вине.",
    },
    {
      id: "tail",
      label: "Кармический хвост · остриё",
      numberA: matrixA.karmicTail[2].number,
      numberB: matrixB.karmicTail[2].number,
      titleA: matrixA.karmicTail[2].arcanaName,
      titleB: matrixB.karmicTail[2].arcanaName,
      score: pairScore(matrixA.karmicTail[2].number, matrixB.karmicTail[2].number),
      note: noteFor(
        "Хвост",
        matrixA.karmicTail[2].number,
        matrixB.karmicTail[2].number,
        "похожие точки напряжения — можно расти рядом, не списывая друг на друга.",
        "разные триггеры — не лечите чужой хвост, поддерживайте границы."
      ),
      practice:
        "Когда вспышка повторяется — пауза 10 минут и фраза: «это мой урок, не атака на тебя».",
    },
    {
      id: "tension",
      label: "Точки напряжения",
      numberA: matrixA.karmicTail[0].number,
      numberB: matrixB.karmicTail[0].number,
      titleA: matrixA.karmicTail[0].arcanaName,
      titleB: matrixB.karmicTail[0].arcanaName,
      score: pairScore(matrixA.karmicTail[0].number, matrixB.karmicTail[0].number),
      note: noteFor("Напряжение", matrixA.karmicTail[0].number, matrixB.karmicTail[0].number, "похожие уязвимости легче заметить и не обесценить.", "триггеры различаются — важнее пауза и уточнение, чем догадки."),
      practice: "В споре сначала назовите чувство и просьбу, а не объяснение, кто виноват.",
    },
    {
      id: "year",
      label: "Аркан года",
      numberA: matrixA.yearArcana.number,
      numberB: matrixB.yearArcana.number,
      titleA: matrixA.yearArcana.arcanaName,
      titleB: matrixB.yearArcana.arcanaName,
      score: pairScore(matrixA.yearArcana.number, matrixB.yearArcana.number),
      note: noteFor(
        "Год",
        matrixA.yearArcana.number,
        matrixB.yearArcana.number,
        "год звучит в похожей тональности — легче планировать вместе.",
        "разные акценты года — синхронизируйте крупные решения заранее."
      ),
      practice:
        "Выберите один общий фокус на квартал и один личный фокус у каждого — без конкуренции.",
    },
  ];
  const pairComfort = reduceToArcanaNumber(matrixA.comfort.number + matrixB.comfort.number);
  const pairYear = reduceToArcanaNumber(matrixA.yearArcana.number + matrixB.yearArcana.number);
  keys.push({
    id: "pairYear",
    label: "Аркан пары на год",
    numberA: pairYear,
    numberB: pairYear,
    titleA: titleOf(pairYear),
    titleB: titleOf(pairYear),
    score: 80,
    note: `Общий аркан пары: ${pairYear} (${titleOf(pairYear)}) — фон решений и договорённостей на этот год.`,
    practice: "Выберите одну общую тему года и возвращайтесь к ней перед крупными решениями.",
  });

  const score = Math.round(
    keys.reduce((sum, k) => sum + k.score, 0) / keys.length
  );
  const strengths = keys.filter((k) => k.score >= 75).map((k) => k.note);
  const risks = keys.filter((k) => k.score < 60).map((k) => k.note);
  const summary =
    score >= 78
      ? "Пара звучит опорно: много точек резонанса. Берегите ясность договорённостей — сила не отменяет границы."
      : score >= 62
        ? "Рабочая совместимость: есть и тепло, и учебные узлы. Главное — не спорить о «кто прав», а договариваться о ритме."
        : "Сочетание учебное: разный темп и язык потребностей. Можно быть рядом, если уважать разницу и не чинить друг друга.";

  return {
    score: Math.min(100, Math.max(0, score)),
    matrixA,
    matrixB,
    keys,
    summary,
    strengths: strengths.length ? strengths : [keys[0]!.note],
    risks: risks.length ? risks : ["Следите, чтобы разный ритм не превращался в молчаливую обиду."],
    pairComfort,
    pairYear,
    personA: {
      methodologyId: matrixA.methodologyId,
      calculationVersion: matrixA.calculationVersion,
    },
    personB: {
      methodologyId: matrixB.methodologyId,
      calculationVersion: matrixB.calculationVersion,
    },
    compatibility: {
      methodologyId: MATRIX_METHODOLOGY_ID,
      calculationVersion: MATRIX_CALCULATION_VERSION,
    },
  };
}

/** Prompt / engine block for paid or chat matrix-compat readings. */
export function buildMatrixCompatibilityPromptBlock(
  dateA: string,
  dateB: string,
  nameA?: string,
  nameB?: string
): string | null {
  const result = matrixCompatibility(dateA, dateB);
  if (!result) return null;
  const a = nameA?.trim() || "Вы";
  const b = nameB?.trim() || "Партнёр";
  return [
    `СОВМЕСТИМОСТЬ МАТРИЦ СУДЬБЫ (${MATRIX_CALCULATION_VERSION}, авторская аналитика Zovus):`,
    `${a} × ${b}. Оценка Zovus: ${result.score}/100 — не классическая и не научная метрика.`,
    result.summary,
    ...result.keys.map(
      (k) =>
        `${k.label}: ${k.numberA} (${k.titleA}) × ${k.numberB} (${k.titleB}) · ${k.score}/100. ${k.note} Практика: ${k.practice}`
    ),
    "Сильные стороны:",
    ...result.strengths.map((s) => `• ${s}`),
    "Точки роста:",
    ...result.risks.map((s) => `• ${s}`),
    `Комфорт пары: ${result.pairComfort} (${titleOf(result.pairComfort)}). Аркан пары на год: ${result.pairYear} (${titleOf(result.pairYear)}).`,
    "Структура ответа: 2–3 предложения вступления → ключи (каждый со своей практикой) → общий совет на 30 дней. Только «ты»/«вы двое». Без markdown. Не пересчитывай арканы.",
  ].join("\n");
}
