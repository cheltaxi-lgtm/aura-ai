import { getArcanaEntry, type ArcanaDictionaryEntry } from "./arcana-dictionary";
import type { DestinyMatrixResult } from "./destiny-matrix";

/** Matrix-v1 point roles — each needs a distinct prose angle even if arcana numbers match. */
export type MatrixPointRole =
  | "body"
  | "energy"
  | "roots"
  | "purpose"
  | "talents"
  | "money"
  | "love"
  | "paternal"
  | "maternal"
  | "karma"
  | "year";

export type MatrixPointPromptLine = {
  role: MatrixPointRole;
  label: string;
  number: number;
};

/** Role lens for the LLM — never reuse the same generic dictionary advice across points. */
export function matrixRoleLens(role: MatrixPointRole, entry: ArcanaDictionaryEntry): string {
  const title = entry.title;
  switch (role) {
    case "body":
      return `Угол характера/тела: как «${title}» проявляется в самоощущении и бытовых привычках. Опора: ${entry.resource}. Ловушка: ${entry.risk}. Практика: одна привычка на 7 дней под этот ресурс.`;
    case "energy":
      return `Угол энергии: откуда набирается и куда утекает сила «${title}». Опора: ${entry.light}. Ловушка: ${entry.shadow}. Практика: режим нагрузки/паузы на эту неделю.`;
    case "roots":
      return `Угол рода/корней: какой семейный сценарий «${title}» мог достаться по наследству. Опора: ${entry.resource}. Практика: отдели «моё» от «так принято в семье» — один пример.`;
    case "purpose":
      return `Угол предназначения: ${entry.purpose} Практика: одно решение на 30 дней строго в этом векторе — без чужих сценариев.`;
    case "talents":
      return `Угол талантов: где «${title}» становится навыком, полезным другим. Опора: ${entry.resource}. Практика: примени дар в одном конкретном деле/проекте.`;
    case "money":
      return `Угол денег: ${entry.money} Практика: один денежный шаг в этом канале за 7 дней (учёт, офер, продукт, переговоры).`;
    case "love":
      return `Угол отношений: ${entry.love} Практика: одна честная граница или разговор в близости — без давления и без молчания.`;
    case "paternal":
      return `Угол рода отца: что линия отца передала через архетип «${title}» — силу и урок. Практика: что взять как опору и что больше не тащить.`;
    case "maternal":
      return `Угол рода матери: что линия матери передала через архетип «${title}» — силу и урок. Практика: что взять как опору и что больше не тащить.`;
    case "karma":
      return `Угол кармической задачи: урок вокруг «${title}». Ловушка: ${entry.risk}. Практика: ${entry.advice}`;
    case "year":
      return `Угол аркана года: фон периода — ${entry.shortMeaning}. Свет: ${entry.light}. Тень: ${entry.shadow}. Практика: что усилить и что не форсировать до конца года.`;
  }
}

export function formatMatrixPointDictLine(
  point: MatrixPointPromptLine,
  entry: ArcanaDictionaryEntry | null
): string {
  if (!entry) return `${point.label}: ${point.number}.`;
  return `${point.label}: ${point.number} — ${entry.title}. Свет: ${entry.light} Тень: ${entry.shadow}. ${matrixRoleLens(point.role, entry)}`;
}

/** Call out repeated arcana so the model must vary wording by role. */
export function formatMatrixRepeatArcanaNote(points: MatrixPointPromptLine[]): string | null {
  const byNumber = new Map<number, string[]>();
  for (const p of points) {
    const list = byNumber.get(p.number) ?? [];
    list.push(p.label.replace(/^\d+\.\s*/, ""));
    byNumber.set(p.number, list);
  }
  const repeats = [...byNumber.entries()]
    .filter(([, labels]) => labels.length > 1)
    .map(([n, labels]) => `${n} → ${labels.join("; ")}`);
  if (!repeats.length) return null;
  return [
    "ПОВТОРЫ АРКАНОВ (обязательно разные углы и разные формулировки, без копипасты фраз):",
    ...repeats.map((line) => `- ${line}`),
    "Запрещено повторять одну и ту же практику/предложение на двух точках.",
  ].join("\n");
}

/** Compact keys for main reading + deterministic «Простыми словами». */
export function formatMatrixFinaleKeys(matrix: DestinyMatrixResult): string {
  const line = (role: string, n: number) => {
    const entry = getArcanaEntry(n);
    return `${role}: ${n} — ${entry?.title ?? `Аркан ${n}`}`;
  };
  return [
    "КЛЮЧИ ДЛЯ РЕЗЮМЕ (не путать точки!):",
    line("Опора характера (тело)", matrix.body.number),
    line("Предназначение (центр)", matrix.purpose.number),
    line("Деньги", matrix.money.number),
    line("Отношения", matrix.relationships.number),
    line("Аркан года", matrix.yearArcana.number),
    "В резюме аркан года — ТОЛЬКО строка «Аркан года». Не подменяй его Отшельником, Силой или другим арканом из соседних точек.",
  ].join("\n");
}

/** Deterministic plain-language finale — no LLM mix-ups on year/purpose. */
export function buildMatrixPlainFinale(name: string, matrix: DestinyMatrixResult): string {
  const body = getArcanaEntry(matrix.body.number);
  const purpose = getArcanaEntry(matrix.purpose.number);
  const money = getArcanaEntry(matrix.money.number);
  const year = getArcanaEntry(matrix.yearArcana.number);
  const who = name.trim() || "друг";

  return [
    `${who}, опора характера — ${body?.title ?? matrix.body.arcanaName} (${matrix.body.number}): ${
      body?.shortMeaning ?? matrix.body.arcanaMeaning
    }`,
    `Предназначение — ${purpose?.title ?? matrix.purpose.arcanaName} (${matrix.purpose.number}): ${
      purpose?.purpose ?? matrix.purpose.arcanaMeaning
    }`,
    `Деньги — через ${money?.title ?? matrix.money.arcanaName}: ${
      money?.money ?? matrix.money.arcanaMeaning
    }`,
    `Аркан этого года — ${year?.title ?? matrix.yearArcana.arcanaName} (${matrix.yearArcana.number}): ${
      year?.shortMeaning ?? matrix.yearArcana.arcanaMeaning
    } Это фон периода, а не замена другим точкам матрицы.`,
  ].join("\n");
}
