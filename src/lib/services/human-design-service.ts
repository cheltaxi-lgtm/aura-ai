import { randomBytes } from "node:crypto";
import { query, queryClient, type PoolClient } from "@/lib/db";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { refundRunes } from "@/lib/rune-service";
import {
  calculateHdChart,
  HD_ENGINE_VERSION,
  HD_MIN_BIRTH_YEAR,
  type HdCalcInput,
  type HdChart,
} from "@/lib/human-design";
import { hdFingerprint, type HdChartIdentity } from "@/lib/human-design/fingerprint";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

/** owner_key for rows in the shared guest pool (migration 097 generated column). */
const GUEST_OWNER_KEY = "00000000-0000-0000-0000-000000000000";

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
  createdAt: string;
}

export interface HdSubject {
  kind: "self" | "other";
  name: string | null;
}

export interface HdReportRow {
  id: string;
  chartId: string;
  userId: string;
  status: "pending" | "done" | "error";
  reportText: string | null;
  model: string | null;
  transactionId: string | null;
  error: string | null;
  packageId: "depth" | "max";
  includedAsksRemaining: number;
  createdAt: string;
}

/** Public wire shape: strips owner id, billing internals and model metadata. */
export function toPublicHdReport(row: HdReportRow) {
  return {
    id: row.id,
    chartId: row.chartId,
    status: row.status,
    reportText: row.reportText,
    packageId: row.packageId,
    includedAsksRemaining: row.includedAsksRemaining,
    createdAt: row.createdAt,
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
  claim_token?: string | null;
  created_at: string | Date;
}

interface HdReportDbRow {
  id: string;
  chart_id: string;
  user_id: string;
  status: "pending" | "done" | "error";
  report_text: string | null;
  model: string | null;
  transaction_id: string | null;
  error: string | null;
  package_id?: string | null;
  included_asks_remaining?: number | null;
  created_at: string | Date;
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
    createdAt: toIso(row.created_at),
  };
}

function mapReportRow(row: HdReportDbRow): HdReportRow {
  return {
    id: row.id,
    chartId: row.chart_id,
    userId: row.user_id,
    status: row.status,
    reportText: row.report_text,
    model: row.model,
    transactionId: row.transaction_id,
    error: row.error,
    packageId: row.package_id === "max" ? "max" : "depth",
    includedAsksRemaining: Math.max(0, Number(row.included_asks_remaining) || 0),
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
    const chart = calculateHdChart({
      birthDate: toIsoDate(row.birth_date),
      birthTime: row.birth_time,
      timezone: row.timezone,
    });
    const updated = await query<HdChartDbRow>(
      "UPDATE hd_charts SET chart = $2, engine_version = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [row.id, JSON.stringify(chart), HD_ENGINE_VERSION]
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
  subjectName: string | null
): Promise<HdChartDbRow> {
  const currentKind = row.subject_kind === "other" ? "other" : "self";
  let nextKind = subjectKind;
  let nextName = subjectName;

  if (currentKind === "self" && subjectKind === "other") {
    // Keep personal ownership; optionally keep an existing empty name.
    nextKind = "self";
    nextName = null;
  }

  if (currentKind === nextKind && (row.subject_name ?? null) === (nextName ?? null)) {
    return row;
  }

  await query(
    "UPDATE hd_charts SET subject_kind = $2, subject_name = $3, updated_at = now() WHERE id = $1",
    [row.id, nextKind, nextName]
  );
  return { ...row, subject_kind: nextKind, subject_name: nextName };
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
  const ownerKey = userId ?? GUEST_OWNER_KEY;

  const own = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE fingerprint = $1 AND owner_key = $2",
    [fingerprint, ownerKey]
  );
  if (own.rows[0]) {
    let row = await refreshChartIfEngineStale(own.rows[0]);
    if (userId && subject) {
      row = await relabelOwnedChart(row, subjectKind, subjectName);
    }
    if (userId) row = await finalizeOwnedSelfChart(userId, row);
    return { row: mapChartRow(row), claimToken: null };
  }

  if (userId && claimToken && /^[0-9a-f]{48}$/.test(claimToken)) {
    let adoptedRows: HdChartDbRow[] = [];
    try {
      const adopted = await query<HdChartDbRow>(
        `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
         WHERE fingerprint = $1 AND user_id IS NULL AND claim_token = $3
         RETURNING *`,
        [fingerprint, userId, claimToken]
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
        if (subject) row = await relabelOwnedChart(row, subjectKind, subjectName);
        row = await finalizeOwnedSelfChart(userId, row);
        return { row: mapChartRow(row), claimToken: null };
      }
      throw error;
    }
    if (adoptedRows[0]) {
      let row = await refreshChartIfEngineStale(adoptedRows[0]);
      if (subject) {
        row = await relabelOwnedChart(row, subjectKind, subjectName);
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
  const inserted = await query<HdChartDbRow>(
    `INSERT INTO hd_charts (
       user_id, birth_date, birth_time, time_unknown, timezone,
       place_name, lat, lon, fingerprint, chart, engine_version,
       subject_kind, subject_name, claim_token
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (fingerprint, owner_key) DO UPDATE SET updated_at = hd_charts.updated_at
     RETURNING *`,
    [
      userId,
      identity.birthDate,
      identity.birthTime,
      identity.birthTime === null,
      identity.timezone,
      identity.placeName.trim(),
      identity.lat,
      identity.lon,
      fingerprint,
      JSON.stringify(chart),
      HD_ENGINE_VERSION,
      subjectKind,
      subjectName,
      newClaimToken,
    ]
  );
  let row = inserted.rows[0]!;
  // A concurrent insert won the race → the returned row carries THEIR token,
  // which must never leak to us.
  const granted = newClaimToken !== null && row.claim_token === newClaimToken;
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
    chart: row.chart,
  };
}

/**
 * Public share / fingerprint capability: chart mechanics only.
 * Never exposes owner, birth date/time, place, coordinates, timezone or tokens.
 * Nested `chart.birth` / `chart.timezone` are stripped too (JSONB leak).
 */
export function toPublicHdChartPayload(row: HdChartRow) {
  const { birth: _birth, timezone: _timezone, ...mechanics } = row.chart;
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    timeUnknown: row.timeUnknown,
    chart: mechanics,
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
  return rows[0] ? mapChartRow(rows[0]) : null;
}

export async function getHdChartById(id: string): Promise<HdChartRow | null> {
  const { rows } = await query<HdChartDbRow>("SELECT * FROM hd_charts WHERE id = $1", [id]);
  return rows[0] ? mapChartRow(rows[0]) : null;
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
     SET subject_kind = 'self', subject_name = NULL, updated_at = now()
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
  return rows.map(mapChartRow);
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
  try {
    const result = await query(
      `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
       WHERE fingerprint = $1 AND user_id IS NULL AND claim_token = $3`,
      [fingerprint, userId, claimToken]
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
  },
  client?: PoolClient
): Promise<HdReportRow | null> {
  // Personal report is always the full SKU.
  const packageId = "max";
  const includedAsks = Math.max(
    5,
    Math.floor(params.includedAsksRemaining ?? 5)
  );
  const sql = `INSERT INTO hd_reports (
       chart_id, user_id, status, transaction_id, package_id, included_asks_remaining
     ) VALUES ($1, $2, 'pending', $3, $4, $5)
     ON CONFLICT (chart_id) DO NOTHING
     RETURNING *`;
  const params_ = [params.chartId, params.userId, params.transactionId, packageId, includedAsks];
  const { rows } = client
    ? await queryClient<HdReportDbRow>(client, sql, params_)
    : await query<HdReportDbRow>(sql, params_);
  return rows[0] ? mapReportRow(rows[0]) : null;
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

export async function completeHdReport(
  reportId: string,
  reportText: string,
  model: string
): Promise<void> {
  await query(
    `UPDATE hd_reports SET status = 'done', report_text = $2, model = $3, updated_at = now()
     WHERE id = $1`,
    [reportId, reportText, model]
  );
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
          "HD_REPORT",
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
