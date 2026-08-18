import {
  destinyMatrix,
  matrixOptionsForTimestamp,
  matrixToStructuredData,
  type DestinyMatrixAgePoint,
  type DestinyMatrixChannel,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "./destiny-matrix";
import {
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  MATRIX_V3_CALCULATION_VERSION,
  MATRIX_V3_METHODOLOGY_ID,
  matrixBaseVersion,
  methodologyIdForCalculationVersion,
} from "./matrix-result";

function asPoint(value: unknown): DestinyMatrixPoint | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { number?: unknown; arcanaName?: unknown; arcanaMeaning?: unknown };
  if (typeof row.number !== "number" || !Number.isInteger(row.number) || row.number < 1 || row.number > 22) {
    return null;
  }
  return {
    number: row.number,
    arcanaName: typeof row.arcanaName === "string" ? row.arcanaName : `Аркан ${row.number}`,
    arcanaMeaning: typeof row.arcanaMeaning === "string" ? row.arcanaMeaning : "",
  };
}

function asAge(value: unknown): DestinyMatrixAgePoint | null {
  const point = asPoint(value);
  if (!point || !value || typeof value !== "object") return null;
  const age = (value as { age?: unknown }).age;
  if (typeof age !== "number" || !Number.isFinite(age)) return null;
  return { ...point, age };
}

function asOfFromData(data: Record<string, unknown> | null | undefined): DestinyMatrixResult["asOf"] | null {
  const asOf = data?.asOf;
  if (!asOf || typeof asOf !== "object") return null;
  const row = asOf as { year?: unknown; month?: unknown; date?: unknown };
  if (typeof row.year !== "number" || typeof row.month !== "number" || typeof row.date !== "string") {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  return { year: row.year, month: row.month, date: row.date };
}

const REQUIRED_POINTS = [
  "body",
  "energy",
  "roots",
  "comfort",
  "relationships",
  "money",
  "karma",
  "talents",
  "paternal",
  "maternal",
  "yearArcana",
  "monthArcana",
  "skySpirit",
  "earthTask",
] as const;

export function hydrateDestinyMatrixFromSnapshot(
  data: Record<string, unknown> | null | undefined
): DestinyMatrixResult | null {
  if (!data || typeof data !== "object") return null;
  const points: Partial<Record<(typeof REQUIRED_POINTS)[number], DestinyMatrixPoint>> = {};
  for (const key of REQUIRED_POINTS) {
    const point = asPoint(data[key]);
    if (!point) return null;
    points[key] = point;
  }
  const tailRaw = Array.isArray(data.karmicTail) ? data.karmicTail.map(asPoint) : [];
  if (tailRaw.length !== 3 || tailRaw.some((p) => !p)) return null;
  const ageCurrent = asAge(data.ageCurrent);
  if (!ageCurrent) return null;
  const ageNext = data.ageNext == null ? null : asAge(data.ageNext);
  const agePointsRaw = Array.isArray(data.agePoints) ? data.agePoints.map(asAge) : [];
  if (agePointsRaw.some((p) => !p)) return null;
  const asOf = asOfFromData(data);
  if (!asOf) return null;
  const channelsRaw = Array.isArray(data.channels) ? data.channels : [];
  const channels: DestinyMatrixChannel[] = [];
  for (const ch of channelsRaw) {
    if (!ch || typeof ch !== "object") return null;
    const row = ch as { id?: unknown; label?: unknown; points?: unknown };
    if (typeof row.id !== "string" || typeof row.label !== "string" || !Array.isArray(row.points)) {
      return null;
    }
    const chPoints = row.points.map(asPoint);
    if (chPoints.some((p) => !p)) return null;
    channels.push({
      id: row.id as DestinyMatrixChannel["id"],
      label: row.label,
      points: chPoints as DestinyMatrixPoint[],
    });
  }
  const version =
    (typeof data.calculationVersion === "string" && data.calculationVersion) ||
    (typeof data.version === "string" && data.version) ||
    MATRIX_CALCULATION_VERSION;
  const comfort = points.comfort!;
  return {
    methodologyId: methodologyIdForCalculationVersion(version),
    calculationVersion: version,
    rendererVersion:
      typeof data.rendererVersion === "string" ? data.rendererVersion : MATRIX_RENDERER_VERSION,
    body: points.body!,
    energy: points.energy!,
    roots: points.roots!,
    purpose: asPoint(data.purpose) ?? comfort,
    relationships: points.relationships!,
    money: points.money!,
    karma: points.karma!,
    talents: points.talents!,
    paternal: points.paternal!,
    maternal: points.maternal!,
    yearArcana: points.yearArcana!,
    monthArcana: points.monthArcana!,
    comfort,
    karmicTail: tailRaw as [DestinyMatrixPoint, DestinyMatrixPoint, DestinyMatrixPoint],
    skySpirit: points.skySpirit!,
    earthTask: points.earthTask!,
    agePoints: agePointsRaw as DestinyMatrixAgePoint[],
    ageCurrent,
    ageNext,
    chronologicalAge:
      typeof data.chronologicalAge === "number" ? data.chronologicalAge : ageCurrent.age,
    channels,
    focusKey: typeof data.focusKey === "string" ? data.focusKey : "purpose",
    focusLabel: typeof data.focusLabel === "string" ? data.focusLabel : "Зона комфорта",
    asOf,
  };
}

export function resolveMatrixForDisplay(input: {
  birthDate: string;
  structuredData?: Record<string, unknown> | null;
  calculationVersion?: string | null;
  createdAt?: string | null;
}): DestinyMatrixResult | null {
  const hydrated = hydrateDestinyMatrixFromSnapshot(input.structuredData ?? null);
  if (hydrated) return hydrated;
  const asOf =
    asOfFromData(input.structuredData) ??
    matrixOptionsForTimestamp(input.createdAt) ??
    undefined;
  const version = matrixBaseVersion(input.calculationVersion);
  if (version === "matrix-v1" || version === "matrix-v2") {
    return null;
  }
  if (version === MATRIX_V3_CALCULATION_VERSION) {
    return destinyMatrix(input.birthDate, { ...asOf, calculationVersion: MATRIX_V3_CALCULATION_VERSION });
  }
  return destinyMatrix(input.birthDate, { ...asOf, calculationVersion: MATRIX_CALCULATION_VERSION });
}

export function snapshotHasCoreNumbers(data: Record<string, unknown> | null | undefined): boolean {
  return hydrateDestinyMatrixFromSnapshot(data) != null;
}

export { matrixToStructuredData, MATRIX_METHODOLOGY_ID, MATRIX_V3_METHODOLOGY_ID };
