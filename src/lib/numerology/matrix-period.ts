/**
 * Period / focus helpers for full destiny matrix (matrix-v2).
 * Numbers come from destinyMatrix(); this module only formats the living cycle.
 */
import {
  destinyMatrix,
  type DestinyMatrixOptions,
  type DestinyMatrixResult,
} from "./destiny-matrix";
import { getMatrixArcanaEntry } from "./matrix-arcana-map";

export type MatrixPeriodSnapshot = {
  yearArcana: { number: number; title: string; shortMeaning: string };
  monthArcana: { number: number; title: string; shortMeaning: string };
  focusKey: string;
  focusLabel: string;
  focusNumber: number;
  focusTitle: string;
  practiceSeed: string;
  teaser: string;
};

/** Arcana number behind the matrix's focusKey — single source of truth for «Узел периода». */
export function focusNumber(m: DestinyMatrixResult): number {
  switch (m.focusKey) {
    case "karma":
      return m.karmicTail[0].number;
    case "karmicMid":
      return m.karmicTail[1].number;
    case "karmicTip":
      return m.karmicTail[2].number;
    case "money":
      return m.money.number;
    case "relationships":
      return m.relationships.number;
    case "ageCurrent":
      return m.ageCurrent.number;
    case "purpose":
      // pickFocus still keys the center as "purpose"; the number is comfort/X.
      return m.comfort.number;
    case "yearArcana":
      return m.yearArcana.number;
    case "monthArcana":
      return m.monthArcana.number;
    default:
      return m.purpose.number;
  }
}

export function buildMatrixPeriodSnapshot(
  birthDate: string,
  options?: DestinyMatrixOptions
): MatrixPeriodSnapshot | null {
  const m = destinyMatrix(birthDate, options);
  if (!m) return null;
  return periodFromMatrix(m);
}

export function periodFromMatrix(m: DestinyMatrixResult): MatrixPeriodSnapshot {
  const focusN = focusNumber(m);
  const focusEntry = getMatrixArcanaEntry(focusN, m.calculationVersion);
  const yearEntry = getMatrixArcanaEntry(m.yearArcana.number, m.calculationVersion);
  const monthEntry = getMatrixArcanaEntry(m.monthArcana.number, m.calculationVersion);
  const practice =
    focusEntry?.advice?.trim() ||
    "Одно маленькое действие по этой зоне в ближайшие 7 дней — без героизма.";

  // Short: label + arcana + practice. No second shortMeaning (it duplicates title line).
  const teaser = [
    `${m.focusLabel}: ${focusEntry?.title ?? `аркан ${focusN}`} (${focusN}).`,
    `Практика на 7 дней: ${practice}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    yearArcana: {
      number: m.yearArcana.number,
      title: yearEntry?.title ?? m.yearArcana.arcanaName,
      shortMeaning: yearEntry?.shortMeaning ?? m.yearArcana.arcanaMeaning,
    },
    monthArcana: {
      number: m.monthArcana.number,
      title: monthEntry?.title ?? m.monthArcana.arcanaName,
      shortMeaning: monthEntry?.shortMeaning ?? m.monthArcana.arcanaMeaning,
    },
    focusKey: m.focusKey,
    focusLabel: m.focusLabel,
    focusNumber: focusN,
    focusTitle: focusEntry?.title ?? `Аркан ${focusN}`,
    practiceSeed: practice,
    teaser: teaser.slice(0, 500),
  };
}
