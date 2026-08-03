import { getArcanaEntry, type ArcanaDictionaryEntry } from "./arcana-dictionary";
import type { DestinyMatrixResult } from "./destiny-matrix";
import { focusNumber } from "./matrix-period";

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
  | "karmicMid"
  | "karmicTip"
  | "age"
  | "year"
  | "month"
  | "sky"
  | "period";

export type MatrixPointPromptLine = {
  role: MatrixPointRole;
  label: string;
  number: number;
};

function d(s: string): string {
  return (s || "").trim().replace(/[.!?…]+$/u, "");
}

/** Role lens for the LLM — never reuse the same generic dictionary advice across points. */
export function matrixRoleLens(role: MatrixPointRole, entry: ArcanaDictionaryEntry): string {
  const title = entry.title;
  switch (role) {
    case "body":
      return `Угол характера/тела: как «${title}» проявляется в самоощущении и бытовых привычках. Опора: ${d(entry.resource)}. Ловушка: ${d(entry.risk)}. Практика: одна привычка на 7 дней под этот ресурс.`;
    case "energy":
      return `Угол энергии: откуда набирается и куда утекает сила «${title}». Опора: ${d(entry.light)}. Ловушка: ${d(entry.shadow)}. Практика: режим нагрузки/паузы на эту неделю.`;
    case "roots":
      return `Угол рода/корней: какой семейный сценарий «${title}» мог достаться по наследству. Опора: ${d(entry.resource)}. Практика: отдели «моё» от «так принято в семье» — один пример.`;
    case "purpose":
      return `Угол предназначения: ${d(entry.purpose)}. Практика: одно решение на 30 дней строго в этом векторе — без чужих сценариев.`;
    case "talents":
      return `Угол талантов: где «${title}» становится навыком, полезным другим. Опора: ${d(entry.resource)}. Практика: примени дар в одном конкретном деле/проекте.`;
    case "money":
      return `Угол денег: ${d(entry.money)}. Практика: один денежный шаг в этом канале за 7 дней (учёт, офер, продукт, переговоры).`;
    case "love":
      return `Угол отношений: ${d(entry.love)}. Практика: одна честная граница или разговор в близости — без давления и без молчания.`;
    case "paternal":
      return `Угол рода отца: через «${title}» линия отца даёт опору «${d(entry.resource)}» и урок «${d(entry.risk)}». Практика: одно отцовское качество оставить, одно отпустить.`;
    case "maternal":
      return `Угол рода матери: через «${title}» линия матери даёт опору «${d(entry.light)}» и урок «${d(entry.shadow)}». Практика: одно материнское качество оставить, одно отпустить.`;
    case "karma":
      return `Угол кармического хвоста (корень): урок вокруг «${title}». Ловушка: ${d(entry.risk)}. Практика: ${d(entry.advice)}.`;
    case "karmicMid":
      return `Угол кармического хвоста (середина): как «${title}» проявляется в повторяющихся сценариях. Ловушка: ${d(entry.shadow)}. Практика: один разрыв привычного автоматизма.`;
    case "karmicTip":
      return `Угол кармического хвоста (остриё): куда «${title}» толкает, если урок не взят. Опора: ${d(entry.resource)}. Практика: ${d(entry.advice)}.`;
    case "age":
      return `Угол точки возраста: тема текущего возрастного пояса через «${title}». Свет: ${d(entry.light)}. Тень: ${d(entry.shadow)}. Практика: один шаг «в возраст», а не в старый сценарий.`;
    case "year":
      return `Угол аркана года: фон периода — ${d(entry.shortMeaning)}. Свет: ${d(entry.light)}. Тень: ${d(entry.shadow)}. Практика: что усилить и что не форсировать до конца года.`;
    case "month":
      return `Угол аркана месяца: ближайший ритм через «${title}». Практика: одно действие на эти 2–3 недели.`;
    case "sky":
      return `Угол духовного полюса (небо): как «${title}» питает смысл и верхнюю линию. Практика: ${d(entry.advice)}.`;
    case "period":
      return `Угол узла периода: фокус сейчас — «${title}». Свяжи с практикой на 7 дней: ${d(entry.advice)}.`;
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
    line("Опора характера", matrix.body.number),
    line("Зона комфорта (центр)", matrix.comfort.number),
    line("Кармический хвост", matrix.karmicTail[0].number),
    line("Деньги", matrix.money.number),
    line("Отношения", matrix.relationships.number),
    line("Аркан года", matrix.yearArcana.number),
    line("Аркан месяца", matrix.monthArcana.number),
    line("Узел периода", focusNumber(matrix)),
    `Фокус сейчас: ${matrix.focusLabel}.`,
    "В резюме аркан года — ТОЛЬКО строка «Аркан года». Не подменяй его соседними точками.",
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
    `Зона комфорта — ${purpose?.title ?? matrix.comfort.arcanaName} (${matrix.comfort.number}): ${
      purpose?.purpose ?? matrix.comfort.arcanaMeaning
    }`,
    `Кармический хвост — ${matrix.karmicTail.map((p) => `${p.number} ${p.arcanaName}`).join(" → ")}.`,
    `Деньги — через ${money?.title ?? matrix.money.arcanaName}: ${
      money?.money ?? matrix.money.arcanaMeaning
    }`,
    `Узел периода — ${matrix.focusLabel}.`,
    `Аркан этого года — ${year?.title ?? matrix.yearArcana.arcanaName} (${matrix.yearArcana.number}): ${
      year?.shortMeaning ?? matrix.yearArcana.arcanaMeaning
    } Это фон периода, а не замена другим точкам матрицы.`,
  ].join("\n");
}
