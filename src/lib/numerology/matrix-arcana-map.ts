import { MAJOR_ARCANA } from "../tarot";
import { ARCANA_DICTIONARY, getArcanaEntry, type ArcanaDictionaryEntry } from "./arcana-dictionary";
import type { DestinyMatrixPoint } from "./matrix-result";
import { matrixBaseVersion } from "./matrix-result";

/**
 * Matrix-only Marseille map. Tarot deck stays Rider–Waite (8 Сила, 11 Справедливость).
 */
function swapEightEleven(entry: ArcanaDictionaryEntry): ArcanaDictionaryEntry {
  if (entry.id === 8) {
    const justice = ARCANA_DICTIONARY.find((item) => item.id === 11);
    return justice ? { ...justice, id: 8, title: "Справедливость" } : entry;
  }
  if (entry.id === 11) {
    const strength = ARCANA_DICTIONARY.find((item) => item.id === 8);
    return strength ? { ...strength, id: 11, title: "Сила" } : entry;
  }
  return entry;
}

export const MATRIX_ARCANA_DICTIONARY: ArcanaDictionaryEntry[] = ARCANA_DICTIONARY.map(swapEightEleven);

export function getMatrixArcanaEntry(
  id: number,
  calculationVersion?: string | null
): ArcanaDictionaryEntry | null {
  const base = matrixBaseVersion(calculationVersion);
  if (!base || base === "matrix-v4") {
    return MATRIX_ARCANA_DICTIONARY.find((entry) => entry.id === id) ?? null;
  }
  return getArcanaEntry(id);
}

export function arcanaForNumber(
  n: number,
  calculationVersion?: string | null
): DestinyMatrixPoint {
  const card = n === 22 ? MAJOR_ARCANA[0] : MAJOR_ARCANA[n];
  const entry = getMatrixArcanaEntry(n, calculationVersion);
  return {
    number: n,
    arcanaName: entry?.title ?? card?.name ?? `Аркан ${n}`,
    arcanaMeaning: entry?.shortMeaning ?? card?.meaning ?? "",
  };
}

export function matrixArcanaTitle(n: number, calculationVersion?: string | null): string {
  return getMatrixArcanaEntry(n, calculationVersion)?.title ?? `Аркан ${n}`;
}
