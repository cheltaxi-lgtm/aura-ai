export const MATRIX_METHODOLOGY_ID = "zovus-matrix-22-v2" as const;
export const MATRIX_CALCULATION_VERSION = "matrix-v5" as const;
export const MATRIX_RENDERER_VERSION = "matrix-svg-v6" as const;

export const MATRIX_V5_CALCULATION_VERSION = MATRIX_CALCULATION_VERSION;
export const MATRIX_V5_METHODOLOGY_ID = MATRIX_METHODOLOGY_ID;
export const MATRIX_V5_RENDERER_VERSION = MATRIX_RENDERER_VERSION;
export const MATRIX_V5_ENGINE_FINGERPRINT =
  "zovus-matrix-22-v2:digit-sum:purpose=sky+earth|male+female:talents=B,B+X,B+(B+X):lineage=FH/GI";

export const MATRIX_V4_CALCULATION_VERSION = "matrix-v4" as const;
export const MATRIX_V4_METHODOLOGY_ID = "zovus-matrix-22-v1" as const;
export const MATRIX_V4_RENDERER_VERSION = "matrix-svg-v5" as const;

export const MATRIX_V3_CALCULATION_VERSION = "matrix-v3" as const;
export const MATRIX_V3_METHODOLOGY_ID = "zovus-matrix-subtract22-v3" as const;
export const MATRIX_V3_RENDERER_VERSION = "matrix-svg-v5" as const;

export const MATRIX_LEGACY_METHODOLOGY_ID = "zovus-matrix-legacy" as const;
export const MATRIX_LEGACY_CALCULATION_VERSIONS = ["matrix-v1", "matrix-v2"] as const;

export type MatrixMethodologyId =
  | typeof MATRIX_METHODOLOGY_ID
  | typeof MATRIX_V4_METHODOLOGY_ID
  | typeof MATRIX_V3_METHODOLOGY_ID
  | typeof MATRIX_LEGACY_METHODOLOGY_ID;

export type MatrixEngineVersion = "matrix-v3" | "matrix-v4" | "matrix-v5";

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

export interface DestinyMatrixPurposeBlock {
  personal: DestinyMatrixPoint;
  social: DestinyMatrixPoint;
  spiritual: DestinyMatrixPoint;
  skyLine: DestinyMatrixPoint;
  earthLine: DestinyMatrixPoint;
  maleChannel: DestinyMatrixPoint;
  femaleChannel: DestinyMatrixPoint;
}

export interface DestinyMatrixTalentChain {
  primary: DestinyMatrixPoint;
  secondary: DestinyMatrixPoint;
  tertiary: DestinyMatrixPoint;
}

export interface DestinyMatrixLineage {
  male: DestinyMatrixPoint[];
  female: DestinyMatrixPoint[];
}

export interface DestinyMatrixAgeModel {
  chronological: number;
  periodStart: number;
  periodEnd: number;
  energy: DestinyMatrixPoint;
  nextPeriod: DestinyMatrixAgePoint | null;
}

export interface DestinyMatrixResult {
  methodologyId: MatrixMethodologyId;
  calculationVersion: string;
  rendererVersion: string;
  body: DestinyMatrixPoint;
  energy: DestinyMatrixPoint;
  roots: DestinyMatrixPoint;
  /** v3/v4: alias of comfort. v5: personal purpose — never the center. */
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
  purposeBlock?: DestinyMatrixPurposeBlock;
  talentsChain?: DestinyMatrixTalentChain;
  lineage?: DestinyMatrixLineage;
  ageModel?: DestinyMatrixAgeModel;
  loveDeep?: DestinyMatrixPoint;
  moneyDeep?: DestinyMatrixPoint;
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

export type MatrixResolveError =
  | "unsupported_matrix_version"
  | "legacy_without_snapshot"
  | "invalid_birth_date";

export type MatrixDisplayResolution =
  | { ok: true; matrix: DestinyMatrixResult }
  | { ok: false; error: MatrixResolveError };

export function matrixBaseVersion(version: string | null | undefined): string {
  return String(version ?? "").split("@")[0]?.trim() || "";
}

export function methodologyIdForCalculationVersion(
  version: string | null | undefined
): MatrixMethodologyId {
  const base = matrixBaseVersion(version);
  if (base === "matrix-v5") return MATRIX_METHODOLOGY_ID;
  if (base === "matrix-v4") return MATRIX_V4_METHODOLOGY_ID;
  if (base === "matrix-v3") return MATRIX_V3_METHODOLOGY_ID;
  return MATRIX_LEGACY_METHODOLOGY_ID;
}

export function isKnownMatrixCalculationVersion(
  version: string | null | undefined
): version is MatrixEngineVersion | "matrix-v1" | "matrix-v2" {
  const base = matrixBaseVersion(version);
  return (
    base === "matrix-v5" ||
    base === "matrix-v4" ||
    base === "matrix-v3" ||
    base === "matrix-v1" ||
    base === "matrix-v2"
  );
}

/** True only for pre-v3 rows that cannot be recomputed by a frozen engine. */
export function isLegacyMatrixCalculationVersion(
  version: string | null | undefined
): boolean {
  const base = matrixBaseVersion(version);
  return (MATRIX_LEGACY_CALCULATION_VERSIONS as readonly string[]).includes(base);
}

export function isFrozenReplayVersion(version: string | null | undefined): boolean {
  const base = matrixBaseVersion(version);
  return base === MATRIX_V3_CALCULATION_VERSION || base === MATRIX_V4_CALCULATION_VERSION;
}

export function classifyMatrixReportVersion(input: {
  calculationVersion?: string | null;
  methodologyId?: string | null;
  rendererVersion?: string | null;
}): {
  calculationVersion: string;
  methodologyId: MatrixMethodologyId;
  rendererVersion: string;
  replayable: boolean;
  currentMethodology: boolean;
  outdatedMethodology: boolean;
  upgradeAvailable: boolean;
} {
  const calculationVersion = input.calculationVersion ?? "";
  const base = matrixBaseVersion(calculationVersion);
  const methodologyId =
    (input.methodologyId as MatrixMethodologyId | undefined) ??
    methodologyIdForCalculationVersion(calculationVersion);
  const currentMethodology = base === MATRIX_CALCULATION_VERSION;
  const replayable = base === "matrix-v3" || base === "matrix-v4" || base === "matrix-v5";
  return {
    calculationVersion,
    methodologyId,
    rendererVersion: input.rendererVersion ?? "",
    replayable,
    currentMethodology,
    outdatedMethodology: Boolean(base) && !currentMethodology,
    upgradeAvailable: Boolean(base) && !currentMethodology && replayable,
  };
}
