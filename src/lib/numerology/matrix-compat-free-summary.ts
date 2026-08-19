/**
 * Free public preview for Matrix pair compatibility (methodology Zovus).
 * Uses existing matrixCompatibility() — does not reimplement scoring.
 */
import { MATRIX_CALCULATION_VERSION } from "./destiny-matrix";
import { MATRIX_LABELS } from "./matrix-labels";
import { matrixCompatibility, type MatrixCompatKey } from "./matrix-compatibility";

export type MatrixCompatZonePreview = {
  id: "love" | "money" | "comfort";
  label: string;
  score: number;
  note: string;
  numberA: number;
  numberB: number;
  titleA: string;
  titleB: string;
};

export type MatrixCompatFreeSummary = {
  version: string;
  /** Methodology label — not a universal official metric. */
  methodology: "zovus";
  score: number;
  summary: string;
  strengths: string[];
  tensions: string[];
  zones: MatrixCompatZonePreview[];
  pairComfort: number;
  pairYear: number;
  disclaimer: string;
};

function zoneFromKey(
  key: MatrixCompatKey | undefined,
  id: MatrixCompatZonePreview["id"],
  label: string
): MatrixCompatZonePreview | null {
  if (!key) return null;
  return {
    id,
    label,
    score: key.score,
    note: key.note,
    numberA: key.numberA,
    numberB: key.numberB,
    titleA: key.titleA,
    titleB: key.titleB,
  };
}

/** Compact free preview from existing engine (no formula changes). */
export function buildMatrixCompatFreeSummary(
  dateA: string,
  dateB: string
): MatrixCompatFreeSummary | null {
  const result = matrixCompatibility(dateA, dateB);
  if (!result) return null;

  const love = zoneFromKey(
    result.keys.find((k) => k.id === "love"),
    "love",
    "Любовь"
  );
  const money = zoneFromKey(
    result.keys.find((k) => k.id === "money"),
    "money",
    "Деньги"
  );
  const comfort = zoneFromKey(
    result.keys.find((k) => k.id === "comfort"),
    "comfort",
    "Комфорт"
  );
  const zones = [love, money, comfort].filter(Boolean) as MatrixCompatZonePreview[];

  return {
    version: MATRIX_CALCULATION_VERSION,
    methodology: "zovus",
    score: result.score,
    summary: result.summary,
    strengths: result.strengths.slice(0, 5),
    tensions: result.risks.slice(0, 3),
    zones,
    pairComfort: result.pairComfort,
    pairYear: result.pairYear,
    disclaimer: MATRIX_LABELS.pairScoreDisclaimer,
  };
}

/** Persistable snapshot (same free preview fields + key scores for continuity). */
export function matrixCompatSnapshotForPending(
  summary: MatrixCompatFreeSummary
): Record<string, unknown> {
  return {
    version: summary.version,
    methodology: summary.methodology,
    score: summary.score,
    summary: summary.summary,
    strengths: summary.strengths,
    tensions: summary.tensions,
    zones: summary.zones,
    pairComfort: summary.pairComfort,
    pairYear: summary.pairYear,
    disclaimer: summary.disclaimer,
  };
}
