import { getMatrixArcanaEntry } from "./matrix-arcana-map";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  type DestinyMatrixOptions,
  type DestinyMatrixResult,
} from "./destiny-matrix";
import { periodFromMatrix, type MatrixPeriodSnapshot } from "./matrix-period";

export type MatrixFreeSummary = {
  version: typeof MATRIX_CALCULATION_VERSION;
  matrix: DestinyMatrixResult;
  keyArcana: Array<{ role: string; number: number; title: string; shortMeaning: string }>;
  portrait: string;
  moneyInsight: string;
  loveInsight: string;
  yearInsight: string;
  comfortInsight: string;
  karmicInsight: string;
  ageInsight: string;
  period: MatrixPeriodSnapshot;
  /** Dense teaser body (zones + period), without pay CTA. */
  denseTeaser: string;
};

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 24 ? cut.slice(0, sp) : cut).trim()}…`;
}

function arc(
  n: number,
  calculationVersion?: string
): { title: string; short: string; money: string; love: string; light: string } {
  const e = getMatrixArcanaEntry(n, calculationVersion);
  return {
    title: e?.title ?? `Аркан ${n}`,
    short: e?.shortMeaning ?? "",
    money: e?.money ?? "",
    love: e?.love ?? "",
    light: e?.light ?? e?.shortMeaning ?? "",
  };
}

function lineFor(
  role: string,
  n: number,
  sphere: "purpose" | "money" | "love" | "short",
  calculationVersion?: string
): string {
  const entry = getMatrixArcanaEntry(n, calculationVersion);
  if (!entry) return `${role}: аркан ${n}.`;
  const text =
    sphere === "money"
      ? entry.money
      : sphere === "love"
        ? entry.love
        : sphere === "purpose"
          ? entry.purpose
          : entry.shortMeaning;
  return `${role}: ${entry.title} (${n}) — ${text}`;
}

/** Compact card for Telegram / SEO preview — one fact per line, no repeats. */
export function formatMatrixDenseTeaser(
  summary: MatrixFreeSummary,
  opts?: {
    name?: string | null;
    birthDate?: string | null;
    cost?: number;
    runeBalance?: number | null;
    /** Include pay CTA footer (bot). Default true. */
    withCta?: boolean;
  }
): string {
  const m = summary.matrix;
  const p = summary.period;
  const ver = m.calculationVersion;
  const body = arc(m.body.number, ver);
  const energy = arc(m.energy.number, ver);
  const comfort = arc(m.comfort.number, ver);
  const talents = arc(m.talents.number, ver);
  const money = arc(m.money.number, ver);
  const love = arc(m.relationships.number, ver);
  const year = arc(m.yearArcana.number, ver);
  const month = arc(m.monthArcana.number, ver);
  const age = arc(m.ageCurrent.number, ver);
  const tail = m.karmicTail.map((x) => x.number).join("→");
  const root = arc(m.karmicTail[0].number, ver);

  const name = (opts?.name || "").trim();
  const birth = (opts?.birthDate || "").trim().slice(0, 10);
  const who = [name || null, birth || null].filter(Boolean).join(" · ");

  const practice = clip(p.practiceSeed, 90);
  const focusHook = clip(arc(p.focusNumber, ver).short || p.focusTitle, 56);

  const lines = [
    who ? `🌌 Полная матрица Zovus · ${who}` : "🌌 Полная матрица Zovus",
    `🜁 ${m.body.number} ${body.title} — ${clip(body.light || body.short, 52)}`,
    `⚡ ${m.energy.number} ${energy.title} — ${clip(energy.short, 52)}`,
    `✨ ${m.comfort.number} ${comfort.title} — ${clip(comfort.short, 52)}`,
    `💎 ${m.talents.number} ${talents.title} — ${clip(talents.short, 52)}`,
    `♻️ Хвост ${tail} · корень ${root.title}`,
    `🪴 ${m.chronologicalAge} лет · период ${m.ageCurrent.age}–${m.ageModel?.periodEnd ?? m.ageCurrent.age + 5} · ${m.ageCurrent.number} ${age.title}`,
    `💰 ${m.money.number} ${money.title} — ${clip(money.money || money.short, 52)}`,
    `💞 ${m.relationships.number} ${love.title} — ${clip(love.love || love.short, 52)}`,
    `📅 Год ${m.yearArcana.number} ${year.title} · месяц ${m.monthArcana.number} ${month.title}`,
    `🎯 Узел · ${p.focusLabel}: ${p.focusNumber} ${p.focusTitle} — ${focusHook}`,
    practice ? `Практика 7д: ${practice}` : "",
  ].filter(Boolean);

  if (opts?.withCta === false) {
    return lines.join("\n");
  }

  const cost = opts?.cost ?? 20;
  const bal =
    typeof opts?.runeBalance === "number" ? ` · баланс ${opts.runeBalance}ᚢ` : "";
  lines.push("———");
  lines.push(`Полный разбор Эвелины · ${cost}ᚢ${bal}`);
  lines.push("Кнопка ниже — открыть полный текст по зонам.");
  return lines.join("\n");
}

export function buildMatrixFreeSummary(
  birthDate: string,
  options?: DestinyMatrixOptions & { name?: string }
): MatrixFreeSummary | null {
  const matrix = destinyMatrix(birthDate, options);
  if (!matrix) return null;

  const comfort = getMatrixArcanaEntry(matrix.comfort.number, matrix.calculationVersion);
  const body = getMatrixArcanaEntry(matrix.body.number, matrix.calculationVersion);
  const name = options?.name?.trim();
  const who = name ? `${name}, ` : "";
  const period = periodFromMatrix(matrix);
  const tail = matrix.karmicTail.map((p) => `${p.number}`).join(" → ");
  const rootEntry = getMatrixArcanaEntry(matrix.karmicTail[0].number, matrix.calculationVersion);

  const portrait = `${who}${body?.title ?? matrix.body.arcanaName} (${matrix.body.number}) — ${clip(body?.light ?? body?.shortMeaning ?? matrix.body.arcanaMeaning, 80)}. Комфорт: ${comfort?.title ?? matrix.comfort.arcanaName} (${matrix.comfort.number}).`;

  const summary: MatrixFreeSummary = {
    version: MATRIX_CALCULATION_VERSION,
    matrix,
    keyArcana: [
      {
        role: "Зона комфорта",
        number: matrix.comfort.number,
        title: comfort?.title ?? matrix.comfort.arcanaName,
        shortMeaning: comfort?.shortMeaning ?? matrix.comfort.arcanaMeaning,
      },
      {
        role: "Кармический хвост",
        number: matrix.karmicTail[0].number,
        title: rootEntry?.title ?? matrix.karmicTail[0].arcanaName,
        shortMeaning: tail,
      },
      {
        role: "Узел периода",
        number: period.focusNumber,
        title: period.focusTitle,
        shortMeaning: period.focusLabel,
      },
    ],
    portrait,
    moneyInsight: lineFor("Денежный канал", matrix.money.number, "money", matrix.calculationVersion),
    loveInsight: lineFor("Отношения", matrix.relationships.number, "love", matrix.calculationVersion),
    yearInsight: lineFor("Аркан года", matrix.yearArcana.number, "short", matrix.calculationVersion),
    comfortInsight: `${comfort?.title ?? matrix.comfort.arcanaName} (${matrix.comfort.number}) — ${comfort?.shortMeaning ?? matrix.comfort.arcanaMeaning}`,
    karmicInsight: `${tail} · корень ${rootEntry?.title ?? matrix.karmicTail[0].arcanaName} (${matrix.karmicTail[0].number})`,
    ageInsight: `${matrix.ageCurrent.age}: ${matrix.ageCurrent.number} — ${matrix.ageCurrent.arcanaName}`,
    period,
    denseTeaser: "",
  };

  summary.denseTeaser = formatMatrixDenseTeaser(summary, {
    name: options?.name,
    birthDate,
    withCta: false,
  });

  return summary;
}
