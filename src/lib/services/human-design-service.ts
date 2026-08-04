import { query } from "@/lib/db";
import {
  calculateHdChart,
  HD_ENGINE_VERSION,
  type HdCalcInput,
  type HdChart,
} from "@/lib/human-design";
import { hdFingerprint, type HdChartIdentity } from "@/lib/human-design/fingerprint";

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
  if (year < 1900 || year > new Date().getFullYear()) {
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

/**
 * Get-or-compute by fingerprint. Deterministic charts are shared worldwide:
 * two people with identical birth data get the same row until one claims it.
 */
export async function getOrComputeHdChart(
  identity: HdChartIdentity,
  userId: string | null,
  subject?: HdSubject
): Promise<HdChartRow> {
  validateHdInput(identity);
  const fingerprint = hdFingerprint(identity);
  const subjectKind = subject?.kind === "other" ? "other" : "self";
  const subjectName =
    subjectKind === "other" && subject?.name?.trim()
      ? subject.name.trim().slice(0, 60)
      : null;

  const existing = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE fingerprint = $1",
    [fingerprint]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (userId && !row.user_id) {
      await query(
        "UPDATE hd_charts SET user_id = $2, updated_at = now() WHERE id = $1 AND user_id IS NULL",
        [row.id, userId]
      );
      row.user_id = userId;
    }
    // Owner re-labels their own chart (e.g. first computed as guest, now named).
    if (userId && row.user_id === userId && subject) {
      await query(
        "UPDATE hd_charts SET subject_kind = $2, subject_name = $3, updated_at = now() WHERE id = $1",
        [row.id, subjectKind, subjectName]
      );
      row.subject_kind = subjectKind;
      row.subject_name = subjectName;
    }
    return mapChartRow(row);
  }

  const calcInput: HdCalcInput = {
    birthDate: identity.birthDate,
    birthTime: identity.birthTime,
    timezone: identity.timezone,
  };
  let chart: HdChart;
  try {
    chart = calculateHdChart(calcInput);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("HD_")) {
      throw new HdInputError("Проверьте дату, время и часовой пояс рождения.");
    }
    throw error;
  }

  const inserted = await query<HdChartDbRow>(
    `INSERT INTO hd_charts (
       user_id, birth_date, birth_time, time_unknown, timezone,
       place_name, lat, lon, fingerprint, chart, engine_version,
       subject_kind, subject_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (fingerprint) DO UPDATE SET updated_at = hd_charts.updated_at
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
    ]
  );
  return mapChartRow(inserted.rows[0]!);
}

export async function getHdChartByFingerprint(fingerprint: string): Promise<HdChartRow | null> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return null;
  const { rows } = await query<HdChartDbRow>(
    "SELECT * FROM hd_charts WHERE fingerprint = $1",
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

export async function claimHdChart(fingerprint: string, userId: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return false;
  const result = await query(
    `UPDATE hd_charts SET user_id = $2, updated_at = now()
     WHERE fingerprint = $1 AND user_id IS NULL`,
    [fingerprint, userId]
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
export async function createPendingHdReport(params: {
  chartId: string;
  userId: string;
  transactionId: string | null;
}): Promise<HdReportRow | null> {
  const { rows } = await query<HdReportDbRow>(
    `INSERT INTO hd_reports (chart_id, user_id, status, transaction_id)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (chart_id) DO NOTHING
     RETURNING *`,
    [params.chartId, params.userId, params.transactionId]
  );
  return rows[0] ? mapReportRow(rows[0]) : null;
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
  content: string
): Promise<void> {
  await query(
    "INSERT INTO hd_report_messages (report_id, role, content) VALUES ($1, $2, $3)",
    [reportId, role, content]
  );
}
