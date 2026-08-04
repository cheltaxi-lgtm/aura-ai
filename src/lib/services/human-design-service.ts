import { randomBytes } from "node:crypto";
import { query, queryClient, type PoolClient } from "@/lib/db";
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
  createdAt: string;
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
    createdAt: toIso(row.created_at),
  };
}

export class HdInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HdInputError";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateHdInput(identity: HdChartIdentity): void {
  if (!DATE_RE.test(identity.birthDate)) {
    throw new HdInputError("Некорректная дата рождения.");
  }
  const year = Number(identity.birthDate.slice(0, 4));
  // Births can't be in the future; the engine itself allows up to 2050 for transits.
  if (year < HD_MIN_BIRTH_YEAR || year > new Date().getFullYear()) {
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

async function relabelOwnedChart(
  row: HdChartDbRow,
  subjectKind: "self" | "other",
  subjectName: string | null
): Promise<HdChartDbRow> {
  await query(
    "UPDATE hd_charts SET subject_kind = $2, subject_name = $3, updated_at = now() WHERE id = $1",
    [row.id, subjectKind, subjectName]
  );
  return { ...row, subject_kind: subjectKind, subject_name: subjectName };
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
    return { row: mapChartRow(row), claimToken: null };
  }

  if (userId && claimToken && /^[0-9a-f]{48}$/.test(claimToken)) {
    const adopted = await query<HdChartDbRow>(
      `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
       WHERE fingerprint = $1 AND user_id IS NULL AND claim_token = $3
       RETURNING *`,
      [fingerprint, userId, claimToken]
    );
    if (adopted.rows[0]) {
      let row = await refreshChartIfEngineStale(adopted.rows[0]);
      if (subject) {
        row = await relabelOwnedChart(row, subjectKind, subjectName);
      }
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
  const row = inserted.rows[0]!;
  // A concurrent insert won the race → the returned row carries THEIR token,
  // which must never leak to us.
  const granted = newClaimToken !== null && row.claim_token === newClaimToken;
  return { row: mapChartRow(row), claimToken: granted ? newClaimToken : null };
}

/** Public wire shape: never exposes owner, coordinates, timezone or tokens. */
export function toPublicHdChartPayload(row: HdChartRow) {
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

export async function listHdChartsForUser(userId: string): Promise<HdChartRow[]> {
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
  const result = await query(
    `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
     WHERE fingerprint = $1 AND user_id IS NULL AND claim_token = $3`,
    [fingerprint, userId, claimToken]
  );
  return (result.rowCount ?? 0) > 0;
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
  },
  client?: PoolClient
): Promise<HdReportRow | null> {
  const sql = `INSERT INTO hd_reports (chart_id, user_id, status, transaction_id)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (chart_id) DO NOTHING
     RETURNING *`;
  const params_ = [params.chartId, params.userId, params.transactionId];
  const { rows } = client
    ? await queryClient<HdReportDbRow>(client, sql, params_)
    : await query<HdReportDbRow>(sql, params_);
  return rows[0] ? mapReportRow(rows[0]) : null;
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

export async function getHdCompositeReport(
  baseChartId: string,
  partnerChartId: string,
  userId: string
): Promise<HdCompositeReportRow | null> {
  const { rows } = await query<HdCompositeReportDbRow>(
    `SELECT id, base_chart_id, partner_chart_id, status, report_text, transaction_id, created_at
     FROM hd_composite_reports
     WHERE base_chart_id = $1 AND partner_chart_id = $2 AND user_id = $3`,
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
  const sql = `INSERT INTO hd_composite_reports (base_chart_id, partner_chart_id, user_id, status, transaction_id)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (base_chart_id, partner_chart_id, user_id) DO NOTHING
     RETURNING id, base_chart_id, partner_chart_id, status, report_text, transaction_id, created_at`;
  const params_ = [params.baseChartId, params.partnerChartId, params.userId, params.transactionId];
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
