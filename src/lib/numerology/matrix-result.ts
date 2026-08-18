export const MATRIX_METHODOLOGY_ID = "zovus-matrix-22-v1" as const;
export const MATRIX_CALCULATION_VERSION = "matrix-v4" as const;
export const MATRIX_RENDERER_VERSION = "matrix-svg-v5" as const;

export const MATRIX_V3_CALCULATION_VERSION = "matrix-v3" as const;
export const MATRIX_V3_METHODOLOGY_ID = "zovus-matrix-subtract22-v3" as const;
export const MATRIX_LEGACY_METHODOLOGY_ID = "zovus-matrix-legacy" as const;

export const MATRIX_LEGACY_CALCULATION_VERSIONS = ["matrix-v1", "matrix-v2"] as const;

export type MatrixMethodologyId =
  | typeof MATRIX_METHODOLOGY_ID
  | typeof MATRIX_V3_METHODOLOGY_ID
  | typeof MATRIX_LEGACY_METHODOLOGY_ID;

export type MatrixEngineVersion = "matrix-v3" | "matrix-v4";

export interface DestinyMatrixPoint {
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

export interface DestinyMatrixAgePoint {
  age: number;
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

export type DestinyMatrixChannelId =
  | "money"
  | "love"
  | "male"
  | "female"
  | "skyEarth";

export interface DestinyMatrixChannel {
  id: DestinyMatrixChannelId;
  label: string;
  points: DestinyMatrixPoint[];
}

export interface DestinyMatrixResult {
  methodologyId: MatrixMethodologyId;
  calculationVersion: string;
  rendererVersion: string;
  body: DestinyMatrixPoint;
  energy: DestinyMatrixPoint;
  roots: DestinyMatrixPoint;
  purpose: DestinyMatrixPoint;
  relationships: DestinyMatrixPoint;
  money: DestinyMatrixPoint;
  karma: DestinyMatrixPoint;
  talents: DestinyMatrixPoint;
  paternal: DestinyMatrixPoint;
  maternal: DestinyMatrixPoint;
  yearArcana: DestinyMatrixPoint;
  comfort: DestinyMatrixPoint;
  karmicTail: [DestinyMatrixPoint, DestinyMatrixPoint, DestinyMatrixPoint];
  skySpirit: DestinyMatrixPoint;
  earthTask: DestinyMatrixPoint;
  monthArcana: DestinyMatrixPoint;
  agePoints: DestinyMatrixAgePoint[];
  ageCurrent: DestinyMatrixAgePoint;
  ageNext: DestinyMatrixAgePoint | null;
  chronologicalAge: number;
  channels: DestinyMatrixChannel[];
  /** Zovus-derived period accent — not a Destiny Matrix point. */
  focusKey: string;
  focusLabel: string;
  asOf: { year: number; month: number; date: string };
}

export const DESTINY_MATRIX_POINT_KEYS = [
  "body",
  "energy",
  "roots",
  "purpose",
  "relationships",
  "money",
  "karma",
  "talents",
  "paternal",
  "maternal",
  "yearArcana",
] as const satisfies readonly (keyof DestinyMatrixResult)[];

export type DestinyMatrixOptions = {
  asOfYear?: number;
  asOfMonth?: number;
  asOfDate?: string;
  calculationVersion?: string;
};

export function matrixBaseVersion(version: string | null | undefined): string {
  return String(version ?? "").split("@")[0]?.trim() || "";
}

export function methodologyIdForCalculationVersion(
  version: string | null | undefined
): MatrixMethodologyId {
  const base = matrixBaseVersion(version);
  if (base === "matrix-v4") return MATRIX_METHODOLOGY_ID;
  if (base === "matrix-v3") return MATRIX_V3_METHODOLOGY_ID;
  return MATRIX_LEGACY_METHODOLOGY_ID;
}

/** True only for pre-v3 rows that cannot be recomputed by a frozen engine. */
export function isLegacyMatrixCalculationVersion(
  version: string | null | undefined
): boolean {
  const base = matrixBaseVersion(version);
  return (MATRIX_LEGACY_CALCULATION_VERSIONS as readonly string[]).includes(base);
}

export function isFrozenReplayVersion(version: string | null | undefined): boolean {
  return matrixBaseVersion(version) === MATRIX_V3_CALCULATION_VERSION;
}
