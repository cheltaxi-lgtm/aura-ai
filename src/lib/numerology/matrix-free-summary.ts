import { getArcanaEntry } from "./arcana-dictionary";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  type DestinyMatrixOptions,
  type DestinyMatrixResult,
} from "./destiny-matrix";

export type MatrixFreeSummary = {
  version: typeof MATRIX_CALCULATION_VERSION;
  matrix: DestinyMatrixResult;
  keyArcana: Array<{ role: string; number: number; title: string; shortMeaning: string }>;
  portrait: string;
  moneyInsight: string;
  loveInsight: string;
  yearInsight: string;
};

function lineFor(role: string, n: number, sphere: "purpose" | "money" | "love" | "short"): string {
  const entry = getArcanaEntry(n);
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

export function buildMatrixFreeSummary(
  birthDate: string,
  options?: DestinyMatrixOptions & { name?: string }
): MatrixFreeSummary | null {
  const matrix = destinyMatrix(birthDate, options);
  if (!matrix) return null;

  const purpose = getArcanaEntry(matrix.purpose.number);
  const body = getArcanaEntry(matrix.body.number);
  const name = options?.name?.trim();
  const who = name ? `${name}, ` : "";

  const portrait = [
    `${who}в центре вашей матрицы — ${purpose?.title ?? matrix.purpose.arcanaName} (${matrix.purpose.number}): ${purpose?.shortMeaning ?? matrix.purpose.arcanaMeaning}.`,
    `Характер опирается на ${body?.title ?? matrix.body.arcanaName} (${matrix.body.number}): ${body?.light ?? body?.shortMeaning ?? matrix.body.arcanaMeaning}.`,
  ].join(" ");

  return {
    version: MATRIX_CALCULATION_VERSION,
    matrix,
    keyArcana: [
      {
        role: "Предназначение",
        number: matrix.purpose.number,
        title: purpose?.title ?? matrix.purpose.arcanaName,
        shortMeaning: purpose?.shortMeaning ?? matrix.purpose.arcanaMeaning,
      },
      {
        role: "Деньги",
        number: matrix.money.number,
        title: getArcanaEntry(matrix.money.number)?.title ?? matrix.money.arcanaName,
        shortMeaning: getArcanaEntry(matrix.money.number)?.shortMeaning ?? matrix.money.arcanaMeaning,
      },
      {
        role: "Отношения",
        number: matrix.relationships.number,
        title: getArcanaEntry(matrix.relationships.number)?.title ?? matrix.relationships.arcanaName,
        shortMeaning:
          getArcanaEntry(matrix.relationships.number)?.shortMeaning ?? matrix.relationships.arcanaMeaning,
      },
    ],
    portrait,
    moneyInsight: lineFor("Денежный канал", matrix.money.number, "money"),
    loveInsight: lineFor("Отношения", matrix.relationships.number, "love"),
    yearInsight: lineFor("Аркан года", matrix.yearArcana.number, "short"),
  };
}
