import { parseBirthDate } from "./constants";
import { parseMatrixCalendarDay, pickAgeWindow, yearsBetween } from "./destiny-matrix-internal";
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
  if (typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 80 || age % 5 !== 0) return null;
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
  const parsed = parseMatrixCalendarDay(row.date);
  if (!parsed || parsed.year !== row.year || parsed.month !== row.month) return null;
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
  if (data.ageNext != null && !ageNext) return null;
  const agePointsRaw = Array.isArray(data.agePoints) ? data.agePoints.map(asAge) : [];
  if (agePointsRaw.length !== 17 || agePointsRaw.some((p, i) => !p || p.age !== i * 5)) return null;
  const chronologicalAge = typeof data.chronologicalAge === "number" ? data.chronologicalAge : ageCurrent.age;
  if (!Number.isInteger(chronologicalAge) || chronologicalAge < 0 || chronologicalAge > 200) return null;
  const expectedWindow = pickAgeWindow(agePointsRaw as DestinyMatrixAgePoint[], chronologicalAge);
  if (ageCurrent.age !== expectedWindow.ageCurrent.age || ageCurrent.number !== expectedWindow.ageCurrent.number ||
      (ageNext?.age ?? null) !== (expectedWindow.ageNext?.age ?? null) || (ageNext?.number ?? null) !== (expectedWindow.ageNext?.number ?? null)) return null;
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
    if (!["money", "love", "male", "female", "skyEarth"].includes(row.id) || (chPoints.length < 3 || chPoints.length > 5) || chPoints.some((p) => !p) || channels.some(ch => ch.id === row.id)) return null;
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
  if ((data.purposeBlock != null && !purposeBlock) || (data.talentsChain != null && !talentsChain) ||
      (data.lineage != null && !lineage) || (data.loveDeep != null && !asPoint(data.loveDeep)) ||
      (data.moneyDeep != null && !asPoint(data.moneyDeep))) return null;
  const purpose = asPoint(data.purpose);
  if (matrixBaseVersion(version) === "matrix-v5" && (!purpose || !purposeBlock || purpose.number !== purposeBlock.personal.number)) return null;
  if (data.ageModel != null && !ageModel) return null;
  if (ageModel && (ageModel.chronological !== chronologicalAge || ageModel.periodStart !== ageCurrent.age ||
      ageModel.energy.number !== ageCurrent.number || (ageModel.nextPeriod?.age ?? null) !== (ageNext?.age ?? null) ||
      (ageModel.nextPeriod?.number ?? null) !== (ageNext?.number ?? null) ||
      (ageNext ? ageModel.periodEnd !== ageNext.age : ![80, 85].includes(ageModel.periodEnd)))) return null;
  return {
    methodologyId: methodologyIdForCalculationVersion(version),
    calculationVersion: version,
    rendererVersion:
      typeof data.rendererVersion === "string" ? data.rendererVersion : rendererFallback,
    body: points.body!,
    energy: points.energy!,
    roots: points.roots!,
    purpose: purpose ?? purposeBlock?.personal ?? comfort,
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
    chronologicalAge,
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
  if (male.length !== 3 || female.length !== 3 || male.some((p) => !p) || female.some((p) => !p)) return null;
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
  if (!Number.isInteger(row.chronological) || row.chronological < 0 || row.chronological > 200 ||
      !Number.isInteger(row.periodStart) || row.periodStart < 0 || row.periodStart > 80 ||
      !Number.isInteger(row.periodEnd) || row.periodEnd < row.periodStart || row.periodEnd > 85 ||
      (row.nextPeriod != null && !asAge(row.nextPeriod))) return null;
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
  if (hydrated) {
    if (!snapshotMatchesBirth(hydrated, input.birthDate, input.structuredData)) {
      return { ok: false, error: "invalid_matrix_snapshot" };
    }
    return { ok: true, matrix: hydrated };
  }
  if (hasSnapshotPayload(input.structuredData)) return { ok: false, error: "invalid_matrix_snapshot" };
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
  if (
    (version === "matrix-v3" || version === "matrix-v4") &&
    !storedAsOf &&
    !asOf?.asOfDate
  ) {
    return { ok: false, error: "legacy_without_snapshot" };
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

function hasSnapshotPayload(data: Record<string, unknown> | null | undefined): boolean {
  return !!data && (REQUIRED_POINTS.some(key => key in data) || "agePoints" in data || "purposeBlock" in data);
}

/** Old snapshots lack birthDate: compare against the frozen engine, never today's engine. */
function snapshotMatchesBirth(matrix: DestinyMatrixResult, birthDate: string, data?: Record<string, unknown> | null): boolean {
  const birth = parseBirthDate(birthDate);
  if (!birth) return false;
  const recorded = data?.birthDate ?? data?.birthDateRaw;
  if (recorded != null) {
    if (typeof recorded !== "string") return false;
    const parsed = parseBirthDate(recorded);
    if (!parsed || parsed.year !== birth.year || parsed.month !== birth.month || parsed.day !== birth.day) return false;
  }
  const date = parseMatrixCalendarDay(matrix.asOf.date);
  if (!date || matrix.chronologicalAge !== yearsBetween(birth, new Date(date.year, date.month - 1, date.day))) return false;
  const version = matrixBaseVersion(matrix.calculationVersion);
  if (version === "matrix-v1" || version === "matrix-v2") return recorded != null;
  const expected = destinyMatrix(birthDate, { asOfDate: matrix.asOf.date, calculationVersion: version });
  if (!expected) return false;
  if (matrix.purposeBlock && (!expected.purposeBlock || Object.keys(matrix.purposeBlock).some(key => {
    const field = key as keyof DestinyMatrixPurposeBlock;
    return matrix.purposeBlock![field].number !== expected.purposeBlock![field].number;
  }))) return false;
  if (matrix.talentsChain && (!expected.talentsChain || Object.keys(matrix.talentsChain).some(key => {
    const field = key as keyof DestinyMatrixTalentChain;
    return matrix.talentsChain![field].number !== expected.talentsChain![field].number;
  }))) return false;
  if (matrix.lineage && (!expected.lineage || ["male", "female"].some(key => {
    const field = key as keyof DestinyMatrixLineage;
    return matrix.lineage![field].some((point, i) => point.number !== expected.lineage![field][i]?.number);
  }))) return false;
  if (matrix.channels.some(channel => {
    const expectedChannel = expected.channels.find(ch => ch.id === channel.id);
    return !expectedChannel || channel.points.length !== expectedChannel.points.length || channel.points.some((point, i) => point.number !== expectedChannel.points[i]?.number);
  })) return false;
  if ((matrix.loveDeep && matrix.loveDeep.number !== expected.loveDeep?.number) ||
      (matrix.moneyDeep && matrix.moneyDeep.number !== expected.moneyDeep?.number)) return false;
  return [...REQUIRED_POINTS, "purpose" as const].every(key => matrix[key].number === expected[key].number) &&
    matrix.karmicTail.every((point, i) => point.number === expected.karmicTail[i].number) &&
    matrix.agePoints.every((point, i) => point.number === expected.agePoints[i]?.number);
}

/**
 * Engine / report numbers come from the saved snapshot first.
 * Live calc is only a fallback when no immutable snapshot exists yet.
 */
export function resolveMatrixForEngine(input: {
  birthDate: string;
  snapshot?: Record<string, unknown> | null;
  asOfDate?: string | null;
}): DestinyMatrixResult | null {
  const hydrated = hydrateDestinyMatrixFromSnapshot(input.snapshot ?? null);
  if (hydrated) return snapshotMatchesBirth(hydrated, input.birthDate, input.snapshot) ? hydrated : null;
  if (hasSnapshotPayload(input.snapshot)) return null;
  const recordedVersion = input.snapshot?.calculationVersion ?? input.snapshot?.version;
  const recordedAsOf = (input.snapshot?.asOf as { date?: unknown } | undefined)?.date;
  const asOfDate = input.asOfDate ?? (typeof recordedAsOf === "string" ? recordedAsOf : undefined);
  const asOf =
    typeof asOfDate === "string"
      ? { asOfDate }
      : undefined;
  return destinyMatrix(input.birthDate, { ...asOf, ...(typeof recordedVersion === "string" ? { calculationVersion: recordedVersion } : {}) });
}

export { matrixToStructuredData, MATRIX_METHODOLOGY_ID, MATRIX_V3_METHODOLOGY_ID };
