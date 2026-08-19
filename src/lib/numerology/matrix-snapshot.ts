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
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  MATRIX_V3_METHODOLOGY_ID,
  MATRIX_V3_RENDERER_VERSION,
  MATRIX_V4_RENDERER_VERSION,
  MATRIX_V5_RENDERER_VERSION,
  isKnownMatrixCalculationVersion,
  matrixBaseVersion,
  methodologyIdForCalculationVersion,
  type DestinyMatrixAgeModel,
  type DestinyMatrixLineage,
  type DestinyMatrixPurposeBlock,
  type DestinyMatrixTalentChain,
  type MatrixDisplayResolution,
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
    "";
  const rendererFallback = (() => {
    const base = matrixBaseVersion(version);
    if (base === "matrix-v5") return MATRIX_V5_RENDERER_VERSION;
    if (base === "matrix-v4") return MATRIX_V4_RENDERER_VERSION;
    if (base === "matrix-v3") return MATRIX_V3_RENDERER_VERSION;
    return MATRIX_RENDERER_VERSION;
  })();
  const comfort = points.comfort!;
  const purposeBlock = asPurposeBlock(data.purposeBlock);
  const talentsChain = asTalentChain(data.talentsChain);
  const lineage = asLineage(data.lineage);
  const ageModel = asAgeModel(data.ageModel);
  return {
    methodologyId: methodologyIdForCalculationVersion(version),
    calculationVersion: version,
    rendererVersion:
      typeof data.rendererVersion === "string" ? data.rendererVersion : rendererFallback,
    body: points.body!,
    energy: points.energy!,
    roots: points.roots!,
    purpose: asPoint(data.purpose) ?? purposeBlock?.personal ?? comfort,
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
    ...(purposeBlock ? { purposeBlock } : {}),
    ...(talentsChain ? { talentsChain } : {}),
    ...(lineage ? { lineage } : {}),
    ...(ageModel ? { ageModel } : {}),
    ...(asPoint(data.loveDeep) ? { loveDeep: asPoint(data.loveDeep)! } : {}),
    ...(asPoint(data.moneyDeep) ? { moneyDeep: asPoint(data.moneyDeep)! } : {}),
  };
}

function asPurposeBlock(value: unknown): DestinyMatrixPurposeBlock | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const personal = asPoint(row.personal);
  const social = asPoint(row.social);
  const spiritual = asPoint(row.spiritual);
  const skyLine = asPoint(row.skyLine);
  const earthLine = asPoint(row.earthLine);
  const maleChannel = asPoint(row.maleChannel);
  const femaleChannel = asPoint(row.femaleChannel);
  if (!personal || !social || !spiritual || !skyLine || !earthLine || !maleChannel || !femaleChannel) {
    return null;
  }
  return { personal, social, spiritual, skyLine, earthLine, maleChannel, femaleChannel };
}

function asTalentChain(value: unknown): DestinyMatrixTalentChain | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const primary = asPoint(row.primary);
  const secondary = asPoint(row.secondary);
  const tertiary = asPoint(row.tertiary);
  if (!primary || !secondary || !tertiary) return null;
  return { primary, secondary, tertiary };
}

function asLineage(value: unknown): DestinyMatrixLineage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { male?: unknown; female?: unknown };
  if (!Array.isArray(row.male) || !Array.isArray(row.female)) return null;
  const male = row.male.map(asPoint);
  const female = row.female.map(asPoint);
  if (male.some((p) => !p) || female.some((p) => !p)) return null;
  return {
    male: male as DestinyMatrixPoint[],
    female: female as DestinyMatrixPoint[],
  };
}

function asAgeModel(value: unknown): DestinyMatrixAgeModel | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    chronological?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    energy?: unknown;
    nextPeriod?: unknown;
  };
  const energy = asPoint(row.energy);
  if (
    typeof row.chronological !== "number" ||
    typeof row.periodStart !== "number" ||
    typeof row.periodEnd !== "number" ||
    !energy
  ) {
    return null;
  }
  return {
    chronological: row.chronological,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    energy,
    nextPeriod: row.nextPeriod == null ? null : asAge(row.nextPeriod),
  };
}

export function resolveMatrixForDisplayDetailed(input: {
  birthDate: string;
  structuredData?: Record<string, unknown> | null;
  calculationVersion?: string | null;
  createdAt?: string | null;
}): MatrixDisplayResolution {
  const hydrated = hydrateDestinyMatrixFromSnapshot(input.structuredData ?? null);
  if (hydrated) return { ok: true, matrix: hydrated };
  const storedAsOf = asOfFromData(input.structuredData);
  const asOf = storedAsOf
    ? { asOfDate: storedAsOf.date, asOfYear: storedAsOf.year, asOfMonth: storedAsOf.month }
    : matrixOptionsForTimestamp(input.createdAt);
  const version = matrixBaseVersion(input.calculationVersion);
  if (!version) {
    const live = destinyMatrix(input.birthDate, asOf);
    return live ? { ok: true, matrix: live } : { ok: false, error: "invalid_birth_date" };
  }
  if (version === "matrix-v1" || version === "matrix-v2") {
    return { ok: false, error: "legacy_without_snapshot" };
  }
  if (!isKnownMatrixCalculationVersion(version)) {
    return { ok: false, error: "unsupported_matrix_version" };
  }
  const matrix = destinyMatrix(input.birthDate, { ...asOf, calculationVersion: version });
  if (!matrix) return { ok: false, error: "invalid_birth_date" };
  return { ok: true, matrix };
}

export function resolveMatrixForDisplay(input: {
  birthDate: string;
  structuredData?: Record<string, unknown> | null;
  calculationVersion?: string | null;
  createdAt?: string | null;
}): DestinyMatrixResult | null {
  const resolved = resolveMatrixForDisplayDetailed(input);
  return resolved.ok ? resolved.matrix : null;
}

export function snapshotHasCoreNumbers(data: Record<string, unknown> | null | undefined): boolean {
  return hydrateDestinyMatrixFromSnapshot(data) != null;
}

export { matrixToStructuredData, MATRIX_METHODOLOGY_ID, MATRIX_V3_METHODOLOGY_ID };
