import { createHash, randomBytes } from "node:crypto";
import { query, queryClient, type PoolClient } from "@/lib/db";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { refundRunes } from "@/lib/rune-service";
import {
  calculateHdChart,
  HD_CONNECTION_RELATIONS,
  HD_ENGINE_VERSION,
  HD_MIN_BIRTH_YEAR,
  type HdActivation,
  type HdCalcInput,
  type HdChart,
  type HdConnectionRelation,
  type HdPublicActivation,
  type HdPublicChart,
} from "@/lib/human-design";
import {
  hdFingerprint,
  normalizeHdTimezone,
  type HdChartIdentity,
} from "@/lib/human-design/fingerprint";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  normalizeUserGender,
  type BinaryGender,
} from "@/lib/russian-name-gender";

const HD_RELATION_IDS = new Set<string>(HD_CONNECTION_RELATIONS.map((r) => r.id));

export function mapHdRelationToSelf(
  raw: string | null | undefined
): HdConnectionRelation | null {
  if (typeof raw === "string" && HD_RELATION_IDS.has(raw)) {
    return raw as HdConnectionRelation;
  }
  return null;
}

/** Persist only binary gender; anything else → null. */
export function mapHdGender(raw: string | null | undefined): BinaryGender | null {
  return normalizeUserGender(raw);
}

/** owner_key for rows in the shared guest pool (migration 097 generated column). */
const GUEST_OWNER_KEY = "00000000-0000-0000-0000-000000000000";

/**
 * Claim tokens are stored as SHA-256 hashes (same standard as the tarot
 * receipt hash-only rule): a DB/log/backup leak must not hand out claim
 * capabilities. Legacy plaintext 48-hex rows were one-shot hashed by
 * migration 109; claim matches hash-only. Raw tokens are 48 hex chars,
 * hashes 64 — they cannot collide.
 */
export function hashHdClaimToken(rawToken: string): string {
  return createHash("sha256").update(`hd-claim:v1:${rawToken}`).digest("hex");
}

/** A pending report older than this is considered crashed and recoverable. */
const STALE_PENDING_MS = 10 * 60 * 1000;

export interface HdChartRow {
  id: string;
  userId: string | null;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  timezone: string;
  placeName: string;
  lat: number;
  lon: number;
  fingerprint: string;
  chart: HdChart;
  engineVersion: string;
  subjectKind: "self" | "other";
  subjectName: string | null;
  /** How this other-person chart relates to the owner; null for self charts. */
  relationToSelf: HdConnectionRelation | null;
  /** Binary gender for other-person charts (LLM address); null for self / unknown. */
  gender: BinaryGender | null;
  createdAt: string;
}

export interface HdSubject {
  kind: "self" | "other";
  name: string | null;
  /** Required for other charts when creating/updating relation context. */
  relationToSelf?: HdConnectionRelation | null;
  /** Optional binary gender for other-person charts. */
  gender?: BinaryGender | null;
}

export type HdReportToneId = "personal" | "child" | "work";

export type HdReportStatus = "pending" | "done" | "error" | "needs_regeneration";

export interface HdReportRow {
  id: string;
  chartId: string;
  userId: string;
  status: HdReportStatus;
  reportText: string | null;
  model: string | null;
  transactionId: string | null;
  error: string | null;
  qualityFindings: unknown | null;
  packageId: "depth" | "max";
  includedAsksRemaining: number;
  reportTone: HdReportToneId;
  createdAt: string;
}

/** Public wire shape: strips owner id, billing internals and model metadata. */
export function toPublicHdReport(row: HdReportRow) {
  const hideText = row.status === "needs_regeneration" || row.status === "pending";
  return {
    id: row.id,
    chartId: row.chartId,
    status: row.status,
    reportText: hideText ? null : row.reportText,
    packageId: row.packageId,
    includedAsksRemaining: row.includedAsksRemaining,
    reportTone: row.reportTone,
    createdAt: row.createdAt,
    /** True when a charge is still attached — retry resumes without re-billing. */
    resumeFree:
      Boolean(row.transactionId) &&
      (row.status === "pending" ||
        row.status === "error" ||
        row.status === "needs_regeneration"),
  };
}

interface HdChartDbRow {
  id: string;
  user_id: string | null;
  birth_date: string | Date;
  birth_time: string | null;
  time_unknown: boolean;
  timezone: string;
  place_name: string;
  lat: number;
  lon: number;
  fingerprint: string;
  chart: HdChart;
  engine_version: string;
  subject_kind: string | null;
  subject_name: string | null;
  relation_to_self?: string | null;
  gender?: string | null;
  claim_token?: string | null;
  created_at: string | Date;
}

interface HdReportDbRow {
  id: string;
  chart_id: string;
  user_id: string;
  status: HdReportStatus;
  report_text: string | null;
  model: string | null;
  transaction_id: string | null;
  error: string | null;
  quality_findings?: unknown | null;
  package_id?: string | null;
  included_asks_remaining?: number | null;
  report_tone?: string | null;
  created_at: string | Date;
}

function mapReportTone(raw: string | null | undefined): HdReportToneId {
  if (raw === "child" || raw === "work") return raw;
  return "personal";
}

function mapReportPackageId(raw: string | null | undefined): "depth" | "max" {
  return raw === "depth" ? "depth" : "max";
}

function toIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapChartRow(row: HdChartDbRow): HdChartRow {
  return {
    id: row.id,
    userId: row.user_id,
    birthDate: toIsoDate(row.birth_date),
    birthTime: row.birth_time,
    timeUnknown: row.time_unknown,
    timezone: row.timezone,
    placeName: row.place_name,
    lat: row.lat,
    lon: row.lon,
    fingerprint: row.fingerprint,
    chart: row.chart,
    engineVersion: row.engine_version,
    subjectKind: row.subject_kind === "other" ? "other" : "self",
    subjectName: row.subject_name,
    relationToSelf:
      row.subject_kind === "other" ? mapHdRelationToSelf(row.relation_to_self) : null,
    gender: row.subject_kind === "other" ? mapHdGender(row.gender) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapReportRow(row: HdReportDbRow): HdReportRow {
  const status: HdReportStatus =
    row.status === "needs_regeneration" ||
    row.status === "done" ||
    row.status === "error" ||
    row.status === "pending"
      ? row.status
      : "error";
  return {
    id: row.id,
    chartId: row.chart_id,
    userId: row.user_id,
    status,
    reportText: row.report_text,
    model: row.model,
    transactionId: row.transaction_id,
    error: row.error,
    qualityFindings: row.quality_findings ?? null,
    packageId: mapReportPackageId(row.package_id),
    includedAsksRemaining: Math.max(0, Number(row.included_asks_remaining) || 0),
    reportTone: mapReportTone(row.report_tone),
    createdAt: toIso(row.created_at),
  };
}

export class HdInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HdInputError";
  }
}

/** Thrown when a global (not per-IP) pool guard rejects the request → 429. */
export class HdRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HdRateLimitError";
  }
}

/** All id path/body params must pass this before touching UUID columns (22P02 → 500 otherwise). */
export const HD_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateHdInput(identity: HdChartIdentity): void {
  if (!DATE_RE.test(identity.birthDate)) {
    throw new HdInputError("Некорректная дата рождения.");
  }
  const year = Number(identity.birthDate.slice(0, 4));
  // Births can't be in the future — "today" is evaluated IN THE BIRTH
  // TIMEZONE, not server-local: a server already past midnight must not
  // accept tomorrow's date for a birth in UTC-10, nor reject a legitimate
  // "today" birth in UTC+13. The engine's own 2050 cap is a sanity bound
  // for direct calculateHdChart callers.
  let todayIso = "";
  try {
    // en-CA yields YYYY-MM-DD; formatToParts guards against locale-data drift.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: identity.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    todayIso = `${get("year")}-${get("month")}-${get("day")}`;
    if (!DATE_RE.test(todayIso)) todayIso = "";
  } catch {
    todayIso = "";
  }
  if (!todayIso) {
    // Invalid timezone — the engine rejects it later with HD_INVALID_TIMEZONE;
    // fall back to the server date so the range check still runs.
    const now = new Date();
    todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  if (year < HD_MIN_BIRTH_YEAR || identity.birthDate > todayIso) {
    throw new HdInputError("Дата рождения вне поддерживаемого диапазона.");
  }
  if (identity.birthTime !== null && !TIME_RE.test(identity.birthTime)) {
    throw new HdInputError("Некорректное время рождения.");
  }
  if (!identity.placeName.trim() || identity.placeName.length > 200) {
    throw new HdInputError("Укажите место рождения.");
  }
  if (
    !Number.isFinite(identity.lat) ||
    !Number.isFinite(identity.lon) ||
    Math.abs(identity.lat) > 90 ||
    Math.abs(identity.lon) > 180
  ) {
    throw new HdInputError("Некорректные координаты места рождения.");
  }
}

export interface HdChartComputeResult {
  row: HdChartRow;
  /**
   * Claim capability, present ONLY for a freshly inserted guest chart.
   * The creating browser stores it and later proves ownership via /claim.
   */
  claimToken: string | null;
}

function computeChartOrThrow(identity: HdChartIdentity): HdChart {
  const calcInput: HdCalcInput = {
    birthDate: identity.birthDate,
    birthTime: identity.birthTime,
    timezone: identity.timezone,
  };
  try {
    return calculateHdChart(calcInput);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("HD_")) {
      throw new HdInputError("Проверьте дату, время и часовой пояс рождения.");
    }
    throw error;
  }
}

/** Recompute in place when the stored chart predates the current engine. */
async function refreshChartIfEngineStale(row: HdChartDbRow): Promise<HdChartDbRow> {
  if (row.engine_version === HD_ENGINE_VERSION) return row;
  try {
    const timezone = normalizeHdTimezone(row.timezone);
    const chart = calculateHdChart({
      birthDate: toIsoDate(row.birth_date),
      birthTime: row.birth_time,
      timezone,
    });
    const updated = await query<HdChartDbRow>(
      `UPDATE hd_charts
       SET chart = $2, engine_version = $3, timezone = $4, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [row.id, JSON.stringify(chart), HD_ENGINE_VERSION, timezone]
    );
    return updated.rows[0] ?? row;
  } catch {
    return row;
  }
}

/**
 * Invariant: at most one `self` chart per user.
 * Demotes every other personal chart to `other` (named by birth date) and
 * drops their memory facts so the cabinet / bot never hide the real self.
 */
async function demoteOtherSelfCharts(
  userId: string,
  keepChartId: string
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `UPDATE hd_charts
     SET subject_kind = 'other',
         subject_name = COALESCE(
           NULLIF(BTRIM(COALESCE(subject_name, '')), ''),
           to_char(birth_date, 'DD.MM.YYYY')
         ),
         relation_to_self = COALESCE(relation_to_self, 'partner'),
         updated_at = now()
     WHERE user_id = $1
       AND id <> $2
       AND COALESCE(subject_kind, 'self') <> 'other'
     RETURNING id`,
    [userId, keepChartId]
  );
  if (rows.length === 0) return;
  const { forgetHdChartFact } = await import("@/lib/human-design/memory");
  for (const row of rows) {
    forgetHdChartFact(userId, row.id);
  }
}
/**
 * Update subject label on an owned chart.
 * Never demote `self` → `other` on the *same* fingerprint: recalculating
 * “for someone else” with identical birth data must not hide the user’s
 * personal chart. A *different* fingerprint becoming `self` demotes siblings
 * via {@link demoteOtherSelfCharts}.
 */
async function relabelOwnedChart(
  row: HdChartDbRow,
  subjectKind: "self" | "other",
  subjectName: string | null,
  relationToSelf?: HdConnectionRelation | null,
  gender?: BinaryGender | null
): Promise<HdChartDbRow> {
  const currentKind = row.subject_kind === "other" ? "other" : "self";
  let nextKind = subjectKind;
  let nextName = subjectName;

  if (currentKind === "self" && subjectKind === "other") {
    // Keep personal ownership; optionally keep an existing empty name.
    nextKind = "self";
    nextName = null;
  }

  const prevRelation = mapHdRelationToSelf(row.relation_to_self);
  const prevGender = mapHdGender(row.gender);
  let nextRelation: HdConnectionRelation | null = null;
  let nextGender: BinaryGender | null = null;
  if (nextKind === "other") {
    const fromCaller = mapHdRelationToSelf(relationToSelf);
    nextRelation = fromCaller ?? prevRelation;
    // Explicit null from caller clears; undefined keeps previous.
    nextGender = gender !== undefined ? gender : prevGender;
  }

  if (
    currentKind === nextKind &&
    (row.subject_name ?? null) === (nextName ?? null) &&
    prevRelation === nextRelation &&
    prevGender === nextGender
  ) {
    return row;
  }

  await query(
    `UPDATE hd_charts
     SET subject_kind = $2, subject_name = $3, relation_to_self = $4, gender = $5, updated_at = now()
     WHERE id = $1`,
    [row.id, nextKind, nextName, nextRelation, nextGender]
  );
  return {
    ...row,
    subject_kind: nextKind,
    subject_name: nextName,
    relation_to_self: nextRelation,
    gender: nextGender,
  };
}

/** After any path that yields an owned `self` row, enforce the single-self invariant. */
async function finalizeOwnedSelfChart(
  userId: string,
  row: HdChartDbRow
): Promise<HdChartDbRow> {
  if (row.subject_kind === "other") return row;
  await demoteOtherSelfCharts(userId, row.id);
  return row;
}
/**
 * Get-or-compute scoped to the owner: every user gets their own row for a
 * given fingerprint; guests share the anonymous pool row. A logged-in caller
 * holding the pool row's claim token adopts it instead of duplicating.
 */
export async function getOrComputeHdChart(
  identity: HdChartIdentity,
  userId: string | null,
  subject?: HdSubject,
  claimToken?: string | null
): Promise<HdChartComputeResult> {
  validateHdInput(identity);
  const fingerprint = hdFingerprint(identity);
  const subjectKind = subject?.kind === "other" ? "other" : "self";
  // Normalize at the storage boundary: first name only, no symbols — the value
  // is later interpolated into LLM prompts and shown on public share pages.
  const subjectName =
    subjectKind === "other"
      ? normalizePersonDisplayName(subject?.name).slice(0, 60) || null
      : null;
  const relationToSelf =
    subjectKind === "other" ? mapHdRelationToSelf(subject?.relationToSelf) : null;
  // Only overwrite stored gender when the caller explicitly sent the field.
  const gender: BinaryGender | null | undefined =
    subjectKind === "other" && subject && Object.prototype.hasOwnProperty.call(subject, "gender")
      ? mapHdGender(subject.gender ?? null)
      : undefined;
  const ownerKey = userId ?? GUEST_OWNER_KEY;

  const own = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE fingerprint = $1 AND owner_key = $2",
    [fingerprint, ownerKey]
  );
  if (own.rows[0]) {
    let row = await refreshChartIfEngineStale(own.rows[0]);
    if (userId && subject) {
      row = await relabelOwnedChart(row, subjectKind, subjectName, relationToSelf, gender);
    }
    if (userId) row = await finalizeOwnedSelfChart(userId, row);
    if (!userId && subject) {
      // Shared guest pool: the stored subject may belong to ANOTHER visitor.
      // Never persist or echo it — answer with the caller's own request only.
      const mapped = mapChartRow(row);
      return {
        row: {
          ...mapped,
          subjectKind,
          subjectName,
          relationToSelf,
          gender: gender ?? null,
        },
        claimToken: null,
      };
    }
    return { row: mapChartRow(row), claimToken: null };
  }

  if (userId && claimToken && /^[0-9a-f]{48}$/.test(claimToken)) {
    const claimTokenHash = hashHdClaimToken(claimToken);
    let adoptedRows: HdChartDbRow[] = [];
    try {
      const adopted = await query<HdChartDbRow>(
        `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
         WHERE fingerprint = $1 AND user_id IS NULL
           AND claim_token = $3
         RETURNING *`,
        [fingerprint, userId, claimTokenHash]
      );
      adoptedRows = adopted.rows;
    } catch (error) {
      // Adopt flips owner_key (generated from user_id): a concurrent own-row
      // insert for the same fingerprint makes this UPDATE hit the unique
      // index. The own row now exists — fall through and read it.
      if ((error as { code?: string })?.code !== "23505") throw error;
      const own2 = await query<HdChartDbRow>(
        "SELECT * FROM hd_charts WHERE fingerprint = $1 AND owner_key = $2",
        [fingerprint, ownerKey]
      );
      if (own2.rows[0]) {
        let row = await refreshChartIfEngineStale(own2.rows[0]);
        if (subject) {
          row = await relabelOwnedChart(
            row,
            subjectKind,
            subjectName,
            relationToSelf,
            gender
          );
        }
        row = await finalizeOwnedSelfChart(userId, row);
        return { row: mapChartRow(row), claimToken: null };
      }
      throw error;
    }
    if (adoptedRows[0]) {
      let row = await refreshChartIfEngineStale(adoptedRows[0]);
      if (subject) {
        row = await relabelOwnedChart(
          row,
          subjectKind,
          subjectName,
          relationToSelf,
          gender
        );
      }
      row = await finalizeOwnedSelfChart(userId, row);
      return { row: mapChartRow(row), claimToken: null };
    }
  }

  // The chart is deterministic: reuse a sibling row's JSON when the engine
  // matches instead of recomputing identical ephemerides.
  let chart: HdChart | null = null;
  const sibling = await query<{ chart: HdChart; engine_version: string }>(
    "SELECT chart, engine_version FROM hd_charts WHERE fingerprint = $1 LIMIT 1",
    [fingerprint]
  );
  if (sibling.rows[0] && sibling.rows[0].engine_version === HD_ENGINE_VERSION) {
    chart = sibling.rows[0].chart;
  }
  if (!chart) {
    chart = computeChartOrThrow(identity);
  }

  // Global daily ceiling on guest-pool inserts: per-IP limits alone let a
  // distributed flood grow the pool unboundedly (sweep runs nightly). Cache
  // hits and owned rows never reach this — only actual new guest rows.
  if (!userId) {
    const { allowed } = await checkRateLimit(
      rateLimitKey("hd_guest_pool_day", "global"),
      4000,
      86_400_000
    );
    if (!allowed) {
      throw new HdRateLimitError(
        "Сервис перегружен. Войдите в аккаунт или попробуйте завтра."
      );
    }
  }

  const newClaimToken = userId ? null : randomBytes(24).toString("hex");
  const newClaimTokenHash = newClaimToken ? hashHdClaimToken(newClaimToken) : null;
  const inserted = await query<HdChartDbRow>(
    `INSERT INTO hd_charts (
       user_id, birth_date, birth_time, time_unknown, timezone,
       place_name, lat, lon, fingerprint, chart, engine_version,
       subject_kind, subject_name, relation_to_self, gender, claim_token
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (fingerprint, owner_key) DO UPDATE SET updated_at = hd_charts.updated_at
     RETURNING *`,
    [
      userId,
      identity.birthDate,
      identity.birthTime,
      identity.birthTime === null,
      normalizeHdTimezone(identity.timezone),
      identity.placeName.trim(),
      identity.lat,
      identity.lon,
      fingerprint,
      JSON.stringify(chart),
      HD_ENGINE_VERSION,
      subjectKind,
      subjectName,
      relationToSelf,
      gender ?? null,
      newClaimTokenHash,
    ]
  );
  let row = inserted.rows[0]!;
  // A concurrent insert won the race → the returned row carries THEIR token,
  // which must never leak to us.
  const granted =
    newClaimTokenHash !== null && row.claim_token === newClaimTokenHash;
  // Owned conflict path may return an older label — apply the caller's subject.
  // Guest pool is shared: never overwrite another visitor's subject/relation.
  if (userId && subject) {
    row = await relabelOwnedChart(
      row,
      subjectKind,
      subjectName,
      relationToSelf,
      gender
    );
  }
  if (userId) row = await finalizeOwnedSelfChart(userId, row);
  return { row: mapChartRow(row), claimToken: granted ? newClaimToken : null };
}

/** Owner / creator wire shape: birth inputs needed to restore form + chips. */
export function toOwnerHdChartPayload(row: HdChartRow) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    placeName: row.placeName,
    birthDate: row.birthDate,
    birthTime: row.birthTime,
    timeUnknown: row.timeUnknown,
    subjectKind: row.subjectKind,
    subjectName: row.subjectName,
    relationToSelf: row.relationToSelf,
    gender: row.gender,
    chart: row.chart,
  };
}

/**
 * Update relation / gender on an owned other-person chart.
 * Callers: chart PATCH (relation and/or gender).
 */
export async function updateHdChartMetaForUser(
  chartId: string,
  userId: string,
  patch: {
    relationToSelf?: HdConnectionRelation | null;
    gender?: BinaryGender | null;
  }
): Promise<HdChartRow | null> {
  if (!HD_UUID_RE.test(chartId)) return null;
  const hasRelation = patch.relationToSelf !== undefined;
  const hasGender = patch.gender !== undefined;
  if (!hasRelation && !hasGender) return null;

  const relation = hasRelation ? mapHdRelationToSelf(patch.relationToSelf) : null;
  if (hasRelation && !relation) return null;
  const gender = hasGender ? mapHdGender(patch.gender) : null;

  if (hasRelation && hasGender) {
    const { rows } = await query<HdChartDbRow>(
      `UPDATE hd_charts
       SET relation_to_self = $3, gender = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
       RETURNING *`,
      [chartId, userId, relation, gender]
    );
    return rows[0] ? mapChartRow(rows[0]) : null;
  }
  if (hasRelation) {
    const { rows } = await query<HdChartDbRow>(
      `UPDATE hd_charts
       SET relation_to_self = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
       RETURNING *`,
      [chartId, userId, relation]
    );
    return rows[0] ? mapChartRow(rows[0]) : null;
  }
  const { rows } = await query<HdChartDbRow>(
    `UPDATE hd_charts
     SET gender = $3, updated_at = now()
     WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
     RETURNING *`,
    [chartId, userId, gender]
  );
  return rows[0] ? mapChartRow(rows[0]) : null;
}

/** @deprecated Prefer {@link updateHdChartMetaForUser}. */
export async function updateHdChartRelationForUser(
  chartId: string,
  userId: string,
  relationToSelf: HdConnectionRelation
): Promise<HdChartRow | null> {
  return updateHdChartMetaForUser(chartId, userId, { relationToSelf });
}

/**
 * Public share / fingerprint capability: chart mechanics only.
 * Never exposes owner, birth date/time, place, coordinates, timezone or
 * tokens. Nested `chart.birth` / `chart.timezone` are stripped (JSONB leak),
 * and so are `chart.design`, raw longitudes, and color/tone/base: the design
 * moment is a deterministic function of the birth instant (birth − 88° of
 * solar arc); arcsecond longitude or ~0.005° sub-structure cells recover the
 * birth moment tightly enough to break the "no birth date" share promise.
 */
export function toPublicHdChartPayload(row: HdChartRow): {
  id: string;
  fingerprint: string;
  timeUnknown: boolean;
  chart: HdPublicChart;
} {
  const {
    birth: _birth,
    timezone: _timezone,
    design: _design,
    personality,
    designActivations,
    ...mechanics
  } = row.chart;
  const strip = (a: HdActivation): HdPublicActivation => {
    const {
      longitude: _lon,
      color: _color,
      tone: _tone,
      base: _base,
      ...rest
    } = a;
    return rest;
  };
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    timeUnknown: row.timeUnknown,
    chart: {
      ...mechanics,
      personality: personality.map(strip),
      designActivations: designActivations.map(strip),
    },
  };
}

export async function getHdChartByFingerprint(fingerprint: string): Promise<HdChartRow | null> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return null;
  // Guest-pool row first: it is the shareable/public one and never carries a
  // private subject label set by a specific owner.
  const { rows } = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE fingerprint = $1 ORDER BY (user_id IS NULL) DESC",
    [fingerprint]
  );
  if (!rows[0]) return null;
  return mapChartRow(await refreshChartIfEngineStale(rows[0]));
}

export async function getHdChartById(id: string): Promise<HdChartRow | null> {
  const { rows } = await query<HdChartDbRow>("SELECT * FROM hd_charts WHERE id = $1", [id]);
  if (!rows[0]) return null;
  return mapChartRow(await refreshChartIfEngineStale(rows[0]));
}

/**
 * If the user has no `self` chart but has an `other` row matching their
 * profile birth date (common after a destructive relabel), restore the
 * personal label. Idempotent.
 */
async function healDemotedSelfHdChart(userId: string): Promise<void> {
  const hasSelf = await query<{ id: string }>(
    `SELECT id FROM hd_charts
     WHERE user_id = $1 AND COALESCE(subject_kind, 'self') <> 'other'
     LIMIT 1`,
    [userId]
  );
  if (hasSelf.rows[0]) return;

  const profile = await query<{ birth_date: string }>(
    `SELECT birth_date::text AS birth_date FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const birthDate = profile.rows[0]?.birth_date?.slice(0, 10);
  if (!birthDate) return;

  // Prefer the oldest matching chart — usually the original personal one.
  const candidate = await query<{ id: string }>(
    `SELECT id FROM hd_charts
     WHERE user_id = $1 AND subject_kind = 'other' AND birth_date::text = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId, birthDate]
  );
  if (!candidate.rows[0]) return;

  await query(
    `UPDATE hd_charts
     SET subject_kind = 'self', subject_name = NULL, relation_to_self = NULL,
         gender = NULL, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [candidate.rows[0].id, userId]
  );
}

/**
 * Collapse multiple `self` rows: keep the chart matching profile birth date
 * (else the oldest personal chart), demote the rest to `other`.
 */
async function healMultiSelfHdChart(userId: string): Promise<void> {
  const selfs = await query<{ id: string; birth_date: string }>(
    `SELECT id, birth_date::text AS birth_date
     FROM hd_charts
     WHERE user_id = $1 AND COALESCE(subject_kind, 'self') <> 'other'
     ORDER BY created_at ASC`,
    [userId]
  );
  if (selfs.rows.length <= 1) return;

  const profile = await query<{ birth_date: string }>(
    `SELECT birth_date::text AS birth_date FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const birthDate = profile.rows[0]?.birth_date?.slice(0, 10) ?? null;
  const keep =
    (birthDate
      ? selfs.rows.find((r) => r.birth_date.slice(0, 10) === birthDate)
      : null) ?? selfs.rows[0]!;
  await demoteOtherSelfCharts(userId, keep.id);
}

export async function listHdChartsForUser(userId: string): Promise<HdChartRow[]> {
  await healDemotedSelfHdChart(userId);
  await healMultiSelfHdChart(userId);
  const { rows } = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [userId]
  );
  const refreshed: HdChartRow[] = [];
  for (const row of rows) {
    refreshed.push(mapChartRow(await refreshChartIfEngineStale(row)));
  }
  return refreshed;
}
/** Attach a guest chart to a freshly registered/logged-in account. */
/**
 * Delete a chart owned by the user. Accepts a chart id or a report id
 * (cabinet history rows reference the report). Cascades to hd_reports and
 * hd_report_messages via FK. Returns the deleted row for memory cleanup.
 */
export async function deleteHdChartForUser(
  id: string,
  userId: string
): Promise<HdChartRow | null> {
  const found = await query<HdChartDbRow>(
    `SELECT c.* FROM hd_charts c
     LEFT JOIN hd_reports r ON r.chart_id = c.id
     WHERE (c.id = $1 OR r.id = $1) AND c.user_id = $2
     LIMIT 1`,
    [id, userId]
  );
  const row = found.rows[0];
  if (!row) return null;
  await query("DELETE FROM hd_charts WHERE id = $1 AND user_id = $2", [row.id, userId]);
  return mapChartRow(row);
}

/**
 * Attach a guest-pool chart to an account. Requires the claim token issued to
 * the browser that created the chart — a bare fingerprint is public (share
 * links) and must NOT be a claim capability. Idempotent: already owning a row
 * with this fingerprint counts as success.
 */
export async function claimHdChart(
  fingerprint: string,
  userId: string,
  claimToken?: string | null
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return false;
  const own = await query(
    "SELECT 1 FROM hd_charts WHERE fingerprint = $1 AND user_id = $2 LIMIT 1",
    [fingerprint, userId]
  );
  if (own.rows[0]) return true;
  if (!claimToken || !/^[0-9a-f]{48}$/.test(claimToken)) return false;
  const claimTokenHash = hashHdClaimToken(claimToken);
  try {
    const result = await query(
      `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
       WHERE fingerprint = $1 AND user_id IS NULL
         AND claim_token = $3`,
      [fingerprint, userId, claimTokenHash]
    );
    if ((result.rowCount ?? 0) > 0) {
      // Guest rows are usually `self`; claiming must not leave two personal charts.
      await healMultiSelfHdChart(userId);
      return true;
    }
    return false;
  } catch (error) {
    // Concurrent own-row insert for the same fingerprint can trip unique
    // (fingerprint, owner_key) when this UPDATE flips the generated owner_key.
    if ((error as { code?: string })?.code !== "23505") throw error;
    const again = await query(
      "SELECT 1 FROM hd_charts WHERE fingerprint = $1 AND user_id = $2 LIMIT 1",
      [fingerprint, userId]
    );
    if (again.rows[0]) {
      await healMultiSelfHdChart(userId);
      return true;
    }
    throw error;
  }
}

export async function getHdReportForChart(
  chartId: string,
  userId: string
): Promise<HdReportRow | null> {
  const { rows } = await query<HdReportDbRow>(
    "SELECT * FROM hd_reports WHERE chart_id = $1 AND user_id = $2",
    [chartId, userId]
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
}

export async function getHdReportById(
  reportId: string,
  userId: string
): Promise<HdReportRow | null> {
  const { rows } = await query<HdReportDbRow>(
    "SELECT * FROM hd_reports WHERE id = $1 AND user_id = $2",
    [reportId, userId]
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
}

/**
 * Insert the pending report row. The unique chart_id index is the idempotency
 * key: returns null when a report already exists (caller must not charge).
 */
export async function createPendingHdReport(
  params: {
    chartId: string;
    userId: string;
    transactionId: string | null;
    packageId?: "depth" | "max";
    includedAsksRemaining?: number;
    reportTone?: HdReportToneId;
  },
  client?: PoolClient
): Promise<HdReportRow | null> {
  // Personal report is always the full SKU.
  const packageId = "max";
  const includedAsks = Math.max(
    5,
    Math.floor(params.includedAsksRemaining ?? 5)
  );
  const reportTone = mapReportTone(params.reportTone);
  const sql = `INSERT INTO hd_reports (
       chart_id, user_id, status, transaction_id, package_id, included_asks_remaining, report_tone
     ) VALUES ($1, $2, 'pending', $3, $4, $5, $6)
     ON CONFLICT (chart_id) DO NOTHING
     RETURNING *`;
  const params_ = [
    params.chartId,
    params.userId,
    params.transactionId,
    packageId,
    includedAsks,
    reportTone,
  ];
  const { rows } = client
    ? await queryClient<HdReportDbRow>(client, sql, params_)
    : await query<HdReportDbRow>(sql, params_);
  return rows[0] ? mapReportRow(rows[0]) : null;
}

export async function updateHdReportTone(
  reportId: string,
  tone: HdReportToneId
): Promise<void> {
  await query(
    `UPDATE hd_reports SET report_tone = $2, updated_at = now() WHERE id = $1`,
    [reportId, mapReportTone(tone)]
  );
}

export async function getHdCompositeReportById(
  reportId: string,
  userId: string
): Promise<HdCompositeReportRow | null> {
  const { rows } = await query<HdCompositeReportDbRow>(
    `SELECT id, base_chart_id, partner_chart_id, status, report_text, transaction_id, created_at
     FROM hd_composite_reports
     WHERE id = $1 AND user_id = $2`,
    [reportId, userId]
  );
  return rows[0] ? mapCompositeRow(rows[0]) : null;
}

/**
 * Atomically consume one included ask. Returns remaining count, or null if none left.
 */
export async function consumeHdReportIncludedAsk(
  reportId: string,
  client?: PoolClient
): Promise<number | null> {
  const sql = `UPDATE hd_reports
     SET included_asks_remaining = included_asks_remaining - 1, updated_at = now()
     WHERE id = $1 AND included_asks_remaining > 0
     RETURNING included_asks_remaining`;
  const { rows } = client
    ? await queryClient<{ included_asks_remaining: number }>(client, sql, [reportId])
    : await query<{ included_asks_remaining: number }>(sql, [reportId]);
  if (!rows[0]) return null;
  return Math.max(0, Number(rows[0].included_asks_remaining) || 0);
}

/**
 * Recovery for stuck purchases:
 * - fresh pending → still generating, caller must 409;
 * - stale pending WITH a transaction → crashed after a successful charge,
 *   caller resumes generation on the same row WITHOUT charging again;
 * - stale pending WITHOUT a transaction or status=error → charge was rolled
 *   back / never happened, caller deletes the row and starts over.
 */
export function isStalePendingReport(report: HdReportRow): boolean {
  return (
    report.status === "pending" &&
    Date.now() - new Date(report.createdAt).getTime() > STALE_PENDING_MS
  );
}

/**
 * Double-billing guard: the SAME mechanics (birth date + time + timezone)
 * entered as a separate chart row must not be sold twice. Reports bake the
 * subject name into the text, so a dedupe hit also requires the same
 * subject kind and (case-insensitive) name. Returns the newest matching
 * done report; the caller serves it cached WITHOUT charging again.
 */
export async function findDuplicateDoneHdReport(params: {
  userId: string;
  excludeChartId: string;
  birthDate: string;
  birthTime: string;
  timezone: string;
  subjectKind: "self" | "other";
  subjectName: string | null;
}): Promise<HdReportRow | null> {
  const timezone = normalizeHdTimezone(params.timezone);
  const { rows } = await query<HdReportDbRow>(
    `SELECT r.id, r.chart_id, r.user_id, r.status, r.report_text, r.model,
            r.transaction_id, r.error, r.package_id, r.included_asks_remaining,
            r.report_tone, r.created_at
     FROM hd_reports r
     JOIN hd_charts c ON c.id = r.chart_id
     WHERE r.user_id = $1
       AND r.status = 'done'
       AND r.report_text IS NOT NULL
       AND r.chart_id <> $2
       AND c.chart->'birth'->>'date' = $3
       AND c.chart->'birth'->>'time' = $4
       AND lower(c.chart->>'timezone') = lower($5)
       AND c.subject_kind = $6
       AND lower(COALESCE(c.subject_name, '')) = lower(COALESCE($7, ''))
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [
      params.userId,
      params.excludeChartId,
      params.birthDate,
      params.birthTime,
      timezone,
      params.subjectKind,
      params.subjectName,
    ]
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
}

export async function deleteHdReportRow(reportId: string): Promise<void> {
  await query("DELETE FROM hd_reports WHERE id = $1", [reportId]);
}

export async function attachHdReportTransaction(
  reportId: string,
  transactionId: string | null,
  client?: PoolClient
): Promise<void> {
  const run = client ? queryClient.bind(null, client) : query;
  await run("UPDATE hd_reports SET transaction_id = $2, updated_at = now() WHERE id = $1", [
    reportId,
    transactionId,
  ]);
}

/**
 * CAS-lock a stale pending report for resume: resets its age so a concurrent
 * request sees a fresh pending and backs off with 409. Returns false when the
 * row was already resumed/completed by someone else.
 */
export async function lockStalePendingReportForResume(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_reports SET created_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'
       AND created_at < now() - make_interval(secs => $2)`,
    [reportId, STALE_PENDING_MS / 1000]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Worker requeue takeover: claim a pending row even if it is still "fresh".
 * Client path must keep using lockStalePendingReportForResume (age gate).
 */
export async function lockPendingReportForWorkerResume(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_reports SET created_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [reportId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Returns false when the row is gone (e.g. deleted by a watchdog requeue race). */
export async function completeHdReport(
  reportId: string,
  reportText: string,
  model: string,
  meta?: {
    costRub?: number | null;
    llmCalls?: number | null;
    tokenUsage?: unknown;
    qualityFindings?: unknown;
  }
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE hd_reports
     SET status = 'done',
         report_text = $2,
         model = $3,
         cost_rub = COALESCE($4, cost_rub),
         llm_calls = COALESCE($5, llm_calls),
         token_usage = COALESCE($6::jsonb, token_usage),
         quality_findings = COALESCE($7::jsonb, quality_findings),
         error = NULL,
         updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'needs_regeneration', 'error')`,
    [
      reportId,
      reportText,
      model,
      meta?.costRub ?? null,
      meta?.llmCalls ?? null,
      meta?.tokenUsage != null ? JSON.stringify(meta.tokenUsage) : null,
      meta?.qualityFindings != null ? JSON.stringify(meta.qualityFindings) : null,
    ]
  );
  return (rowCount ?? 0) > 0;
}

/** Free rewrite of an already-paid done report (keeps text until success). */
export async function beginHdReportRewrite(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_reports
     SET status = 'pending',
         package_id = 'max',
         included_asks_remaining = GREATEST(included_asks_remaining, 5),
         updated_at = now(),
         created_at = now()
     WHERE id = $1 AND status = 'done'`,
    [reportId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Restore a failed rewrite back to done (keeps previous report_text). */
export async function restoreHdReportDone(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_reports
     SET status = 'done',
         error = NULL,
         updated_at = now()
     WHERE id = $1
       AND status IN ('pending', 'error')
       AND report_text IS NOT NULL`,
    [reportId]
  );
}

/** @deprecated use beginHdReportRewrite */
export const beginHdReportUpgrade = beginHdReportRewrite;
/** @deprecated use restoreHdReportDone */
export const restoreHdReportDepthAfterFailedUpgrade = restoreHdReportDone;

export async function failHdReport(reportId: string, error: string): Promise<void> {
  await query(
    `UPDATE hd_reports SET status = 'error', error = $2, updated_at = now() WHERE id = $1`,
    [reportId, error.slice(0, 500)]
  );
}

/** Quality gate failed after retries — keep charge, hide from client until approve/regen. */
export async function markHdReportNeedsRegeneration(
  reportId: string,
  draftText: string,
  findings: unknown
): Promise<void> {
  await query(
    `UPDATE hd_reports
     SET status = 'needs_regeneration',
         report_text = $2,
         error = 'needs_regeneration',
         quality_findings = $3::jsonb,
         quality_updated_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [reportId, draftText, JSON.stringify(findings ?? [])]
  );
}

export async function approveHdReportManually(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_reports
     SET status = 'done',
         error = NULL,
         quality_findings = NULL,
         quality_updated_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'needs_regeneration' AND report_text IS NOT NULL`,
    [reportId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Relock a needs_regeneration / error row for free resume (no new charge). */
export async function beginHdReportQualityResume(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_reports
     SET status = 'pending',
         created_at = now(),
         updated_at = now()
     WHERE id = $1
       AND status IN ('needs_regeneration', 'error')
       AND transaction_id IS NOT NULL`,
    [reportId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listHdReportsForAdminQa(limit = 50): Promise<
  Array<{
    id: string;
    chartId: string;
    userId: string;
    status: HdReportStatus;
    error: string | null;
    qualityFindings: unknown;
    reportTextPreview: string | null;
    createdAt: string;
    transactionId: string | null;
  }>
> {
  const { rows } = await query<HdReportDbRow & { preview?: string }>(
    `SELECT id, chart_id, user_id, status, error, quality_findings, transaction_id, created_at,
            LEFT(report_text, 400) AS preview
     FROM hd_reports
     ORDER BY
       CASE status
         WHEN 'needs_regeneration' THEN 0
         WHEN 'error' THEN 1
         WHEN 'pending' THEN 2
         ELSE 3
       END,
       created_at DESC
     LIMIT $1`,
    [Math.min(200, Math.max(1, limit))]
  );
  return rows.map((r) => ({
    id: r.id,
    chartId: r.chart_id,
    userId: r.user_id,
    status: mapReportRow(r).status,
    error: r.error,
    qualityFindings: r.quality_findings ?? null,
    reportTextPreview: (r as { preview?: string }).preview ?? null,
    createdAt: toIso(r.created_at),
    transactionId: r.transaction_id,
  }));
}

export async function getHdReportAdminDetail(reportId: string): Promise<HdReportRow | null> {
  const { rows } = await query<HdReportDbRow>(
    `SELECT * FROM hd_reports WHERE id = $1 LIMIT 1`,
    [reportId]
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
}

export interface HdCompositeReportRow {
  id: string;
  baseChartId: string;
  partnerChartId: string;
  status: "pending" | "done" | "error";
  reportText: string | null;
  transactionId: string | null;
  createdAt: string;
}

/** Public wire shape: strips billing internals. */
export function toPublicHdCompositeReport(row: HdCompositeReportRow) {
  return {
    id: row.id,
    status: row.status,
    reportText: row.reportText,
    createdAt: row.createdAt,
    /** True when a charge is still attached — retry resumes without re-billing. */
    resumeFree: Boolean(row.transactionId) && (row.status === "pending" || row.status === "error"),
  };
}

interface HdCompositeReportDbRow {
  id: string;
  base_chart_id: string;
  partner_chart_id: string;
  status: "pending" | "done" | "error";
  report_text: string | null;
  transaction_id: string | null;
  created_at: string;
}

function mapCompositeRow(r: HdCompositeReportDbRow): HdCompositeReportRow {
  return {
    id: r.id,
    baseChartId: r.base_chart_id,
    partnerChartId: r.partner_chart_id,
    status: r.status,
    reportText: r.report_text,
    transactionId: r.transaction_id,
    createdAt: r.created_at,
  };
}

/** Canonical storage order so A↔B and B↔A share one paid composite row. */
export function normalizeCompositePair(
  baseChartId: string,
  partnerChartId: string
): [string, string] {
  return baseChartId < partnerChartId
    ? [baseChartId, partnerChartId]
    : [partnerChartId, baseChartId];
}

/**
 * Double-billing guard for connection reports: a pair whose BOTH sides have
 * the same mechanics (date + time + timezone) as an already-paid pair is the
 * same product — serve the existing text cached instead of charging again.
 * Pair storage is canonically sorted, so matching is direction-independent.
 * Subject names are baked into the text → compared per side like for
 * personal reports.
 */
export async function findDuplicateDoneCompositeReport(params: {
  userId: string;
  excludeBaseChartId: string;
  excludePartnerChartId: string;
  base: { birthDate: string; birthTime: string; timezone: string; subjectName: string | null };
  partner: { birthDate: string; birthTime: string; timezone: string; subjectName: string | null };
}): Promise<HdCompositeReportRow | null> {
  const baseTz = normalizeHdTimezone(params.base.timezone);
  const partnerTz = normalizeHdTimezone(params.partner.timezone);
  const { rows } = await query<HdCompositeReportDbRow>(
    `SELECT r.id, r.base_chart_id, r.partner_chart_id, r.status, r.report_text,
            r.transaction_id, r.created_at
     FROM hd_composite_reports r
     JOIN hd_charts cb ON cb.id = r.base_chart_id
     JOIN hd_charts cp ON cp.id = r.partner_chart_id
     WHERE r.user_id = $1
       AND r.status = 'done'
       AND r.report_text IS NOT NULL
       AND NOT (r.base_chart_id = $2 AND r.partner_chart_id = $3)
       AND (
         (
           cb.chart->'birth'->>'date' = $4 AND cb.chart->'birth'->>'time' = $5
           AND lower(cb.chart->>'timezone') = lower($6)
           AND lower(COALESCE(cb.subject_name, '')) = lower(COALESCE($7, ''))
           AND cp.chart->'birth'->>'date' = $8 AND cp.chart->'birth'->>'time' = $9
           AND lower(cp.chart->>'timezone') = lower($10)
           AND lower(COALESCE(cp.subject_name, '')) = lower(COALESCE($11, ''))
         ) OR (
           cb.chart->'birth'->>'date' = $8 AND cb.chart->'birth'->>'time' = $9
           AND lower(cb.chart->>'timezone') = lower($10)
           AND lower(COALESCE(cb.subject_name, '')) = lower(COALESCE($11, ''))
           AND cp.chart->'birth'->>'date' = $4 AND cp.chart->'birth'->>'time' = $5
           AND lower(cp.chart->>'timezone') = lower($6)
           AND lower(COALESCE(cp.subject_name, '')) = lower(COALESCE($7, ''))
         )
       )
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [
      params.userId,
      params.excludeBaseChartId,
      params.excludePartnerChartId,
      params.base.birthDate,
      params.base.birthTime,
      baseTz,
      params.base.subjectName,
      params.partner.birthDate,
      params.partner.birthTime,
      partnerTz,
      params.partner.subjectName,
    ]
  );
  return rows[0] ? mapCompositeRow(rows[0]) : null;
}

export async function getHdCompositeReport(
  baseChartId: string,
  partnerChartId: string,
  userId: string
): Promise<HdCompositeReportRow | null> {
  // Match either orientation — legacy rows may predate canonical ordering.
  const { rows } = await query<HdCompositeReportDbRow>(
    `SELECT id, base_chart_id, partner_chart_id, status, report_text, transaction_id, created_at
     FROM hd_composite_reports
     WHERE user_id = $3
       AND (
         (base_chart_id = $1 AND partner_chart_id = $2)
         OR (base_chart_id = $2 AND partner_chart_id = $1)
       )
     ORDER BY created_at ASC
     LIMIT 1`,
    [baseChartId, partnerChartId, userId]
  );
  return rows[0] ? mapCompositeRow(rows[0]) : null;
}

/** Idempotency via UNIQUE(base_chart_id, partner_chart_id, user_id): null = already exists. */
export async function createPendingCompositeReport(
  params: {
    baseChartId: string;
    partnerChartId: string;
    userId: string;
    transactionId: string | null;
  },
  client?: PoolClient
): Promise<HdCompositeReportRow | null> {
  const [baseChartId, partnerChartId] = normalizeCompositePair(
    params.baseChartId,
    params.partnerChartId
  );
  const sql = `INSERT INTO hd_composite_reports (base_chart_id, partner_chart_id, user_id, status, transaction_id)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (base_chart_id, partner_chart_id, user_id) DO NOTHING
     RETURNING id, base_chart_id, partner_chart_id, status, report_text, transaction_id, created_at`;
  const params_ = [baseChartId, partnerChartId, params.userId, params.transactionId];
  const { rows } = client
    ? await queryClient<HdCompositeReportDbRow>(client, sql, params_)
    : await query<HdCompositeReportDbRow>(sql, params_);
  return rows[0] ? mapCompositeRow(rows[0]) : null;
}

export function isStalePendingComposite(report: HdCompositeReportRow): boolean {
  return (
    report.status === "pending" &&
    Date.now() - new Date(report.createdAt).getTime() > STALE_PENDING_MS
  );
}

export async function deleteCompositeReportRow(reportId: string): Promise<void> {
  await query("DELETE FROM hd_composite_reports WHERE id = $1", [reportId]);
}

export async function attachCompositeReportTransaction(
  reportId: string,
  transactionId: string | null,
  client?: PoolClient
): Promise<void> {
  const run = client ? queryClient.bind(null, client) : query;
  await run(
    "UPDATE hd_composite_reports SET transaction_id = $2, updated_at = now() WHERE id = $1",
    [reportId, transactionId]
  );
}

/** CAS-lock a stale pending composite for resume (see lockStalePendingReportForResume). */
export async function lockStalePendingCompositeForResume(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_composite_reports SET created_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'
       AND created_at < now() - make_interval(secs => $2)`,
    [reportId, STALE_PENDING_MS / 1000]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Guest-pool hygiene: unclaimed guest charts (and their claim tokens) expire
 * after `olderThanDays`. Owned charts are never touched; FK cascades clean up
 * dependent rows. Drains in batches — a fixed LIMIT would fall behind any
 * sustained flood (20/min/IP creates up to ~28k rows/day). The loop stops
 * when a batch comes back partial. Safety ceiling: 250 × 2000 = 500k/run.
 */
export async function sweepGuestPoolHdCharts(
  olderThanDays = 30,
  batchSize = 2000
): Promise<number> {
  let total = 0;
  for (let i = 0; i < 250; i++) {
    const result = await query(
      `DELETE FROM hd_charts
       WHERE id IN (
         SELECT id FROM hd_charts
         WHERE user_id IS NULL AND created_at < now() - make_interval(days => $1)
         LIMIT $2
       )`,
      [olderThanDays, batchSize]
    );
    const n = result.rowCount ?? 0;
    total += n;
    if (n < batchSize) break;
  }
  return total;
}

export async function completeCompositeReport(
  reportId: string,
  reportText: string,
  model: string
): Promise<void> {
  await query(
    `UPDATE hd_composite_reports SET status = 'done', report_text = $2, model = $3, updated_at = now()
     WHERE id = $1`,
    [reportId, reportText, model]
  );
}

/** Mark a done composite as pending rewrite without wiping the previous text. */
export async function beginCompositeReportRewrite(reportId: string): Promise<boolean> {
  const result = await query(
    `UPDATE hd_composite_reports SET status = 'pending', updated_at = now(), created_at = now()
     WHERE id = $1 AND status = 'done'`,
    [reportId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Restore a failed rewrite back to done (keeps the previous report_text). */
export async function restoreCompositeReportDone(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_composite_reports SET status = 'done', error = NULL, updated_at = now()
     WHERE id = $1 AND status = 'pending' AND report_text IS NOT NULL`,
    [reportId]
  );
}

export async function failCompositeReport(reportId: string, error: string): Promise<void> {
  await query(
    `UPDATE hd_composite_reports SET status = 'error', error = $2, updated_at = now() WHERE id = $1`,
    [reportId, error.slice(0, 500)]
  );
}

export interface HdReportMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export async function listHdReportMessages(
  reportId: string,
  limit = 40
): Promise<HdReportMessage[]> {
  const { rows } = await query<{ role: "user" | "assistant"; content: string; created_at: string | Date }>(
    `SELECT role, content, created_at FROM hd_report_messages
     WHERE report_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [reportId, limit]
  );
  return rows
    .map((row) => ({ role: row.role, content: row.content, createdAt: toIso(row.created_at) }))
    .reverse();
}

export async function appendHdReportMessage(
  reportId: string,
  role: "user" | "assistant",
  content: string,
  client?: PoolClient
): Promise<void> {
  const run = client ? queryClient.bind(null, client) : query;
  await run(
    "INSERT INTO hd_report_messages (report_id, role, content) VALUES ($1, $2, $3)",
    [reportId, role, content]
  );
}

/* ------------------------------------------------------------------ *
 * Charge/refund invariant helpers
 *
 * INVARIANT: a row in status 'pending' with transaction_id ≠ NULL means
 * "the charge is still held" and may be resumed for free. A refunded charge
 * must therefore ALWAYS terminalize the row (status='error', tx=NULL) —
 * otherwise the next request after STALE_PENDING_MS gets a free generation.
 * ------------------------------------------------------------------ */

/** True when a refund row already exists for the given spend transaction. */
export async function hasRuneRefundForTransaction(transactionId: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM rune_transactions
     WHERE type = 'refund' AND refund_of_transaction_id = $1
     LIMIT 1`,
    [transactionId]
  );
  return rows.length > 0;
}

/** Refund landed → the pending row must never be resumable again. */
export async function markHdReportChargeRefunded(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_reports
     SET status = 'error', error = 'charge_refunded', transaction_id = NULL, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [reportId]
  );
}

export async function markCompositeReportChargeRefunded(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_composite_reports
     SET status = 'error', error = 'charge_refunded', transaction_id = NULL, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [reportId]
  );
}

/**
 * Undo the CAS-lock age reset after a failed resume so the user can retry
 * immediately instead of waiting out a fresh 10-minute stale window.
 */
export async function releaseStalePendingReportLock(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_reports SET created_at = now() - make_interval(secs => $2), updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [reportId, STALE_PENDING_MS / 1000 + 1]
  );
}

export async function releaseStalePendingCompositeLock(reportId: string): Promise<void> {
  await query(
    `UPDATE hd_composite_reports SET created_at = now() - make_interval(secs => $2), updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [reportId, STALE_PENDING_MS / 1000 + 1]
  );
}

/**
 * Reconciler for crashed purchases: rows stuck pending/error with a charge
 * attached and no refund recorded. Refunds the original amount (read from
 * the spend transaction — refundRunes is idempotent per source transaction)
 * and terminalizes the row. Rows younger than 1 h are left alone: generation
 * may still be in flight or the user may be about to resume.
 */
export async function reconcileHdReportCharges(limit = 50): Promise<number> {
  let refunded = 0;
  for (const table of ["hd_reports", "hd_composite_reports"] as const) {
    // Identical shape in both tables; the table name cannot be parameterized.
    // transaction_id is UUID in hd_reports but TEXT in hd_composite_reports —
    // compare as text to keep one code path (and never throw on a bad cast).
    const { rows } = await query<{
      id: string;
      user_id: string;
      transaction_id: string;
      amount: number;
    }>(
      `SELECT r.id, r.user_id, r.transaction_id, ABS(t.amount) AS amount
       FROM ${table} r
       JOIN rune_transactions t ON t.id::text = r.transaction_id::text AND t.type = 'spend'
       WHERE r.status IN ('pending', 'error')
         AND r.transaction_id IS NOT NULL
         AND r.updated_at < now() - interval '1 hour'
         AND NOT EXISTS (
           SELECT 1 FROM rune_transactions rf
           WHERE rf.type = 'refund' AND rf.refund_of_transaction_id::text = r.transaction_id::text
         )
       ORDER BY r.updated_at
       LIMIT $1`,
      [limit]
    );
    for (const row of rows) {
      try {
        await refundRunes(
          row.user_id,
          row.amount,
          "Возврат: разбор не был создан",
          table === "hd_reports" ? "HD_REPORT" : "HD_COMPOSITE_REPORT",
          row.transaction_id
        );
        await query(
          `UPDATE ${table}
           SET status = 'error', error = 'charge_refunded_reconcile', transaction_id = NULL, updated_at = now()
           WHERE id = $1`,
          [row.id]
        );
        refunded += 1;
      } catch (error) {
        console.warn(`[human-design] reconcile failed for ${table}:${row.id}`, error);
      }
    }
  }
  return refunded;
}

/* ------------------------------------------------------------------ *
 * Center insights: persisted per (chart, user, center) — a repeat purchase
 * returns the cached text instead of charging again, and a crash between
 * charge and response can never lose a paid insight.
 * ------------------------------------------------------------------ */

export interface HdCenterInsightRow {
  id: string;
  chartId: string;
  center: string;
  insightText: string;
  createdAt: string;
}

interface HdCenterInsightDbRow {
  id: string;
  chart_id: string;
  center: string;
  insight_text: string;
  created_at: string | Date;
}

function mapInsightRow(row: HdCenterInsightDbRow): HdCenterInsightRow {
  return {
    id: row.id,
    chartId: row.chart_id,
    center: row.center,
    insightText: row.insight_text,
    createdAt: toIso(row.created_at),
  };
}

export async function getHdCenterInsight(
  chartId: string,
  userId: string,
  center: string
): Promise<HdCenterInsightRow | null> {
  const { rows } = await query<HdCenterInsightDbRow>(
    `SELECT id, chart_id, center, insight_text, created_at
     FROM hd_center_insights
     WHERE chart_id = $1 AND user_id = $2 AND center = $3`,
    [chartId, userId, center]
  );
  return rows[0] ? mapInsightRow(rows[0]) : null;
}

/**
 * Insert the insight; returns null when a concurrent request already stored
 * one (caller must roll back its charge and serve the existing row).
 */
export async function insertHdCenterInsight(
  params: { chartId: string; userId: string; center: string; insightText: string; transactionId: string | null },
  client?: PoolClient
): Promise<HdCenterInsightRow | null> {
  const sql = `INSERT INTO hd_center_insights (chart_id, user_id, center, insight_text, transaction_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chart_id, user_id, center) DO NOTHING
     RETURNING id, chart_id, center, insight_text, created_at`;
  const params_ = [params.chartId, params.userId, params.center, params.insightText, params.transactionId];
  const { rows } = client
    ? await queryClient<HdCenterInsightDbRow>(client, sql, params_)
    : await query<HdCenterInsightDbRow>(sql, params_);
  return rows[0] ? mapInsightRow(rows[0]) : null;
}
