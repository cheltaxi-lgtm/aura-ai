import { createHash, randomBytes } from "node:crypto";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
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
  canonicalHdTimeOccurrence,
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
  generationRevision: string;
  adminRewriteStartedAt: string | null;
  chartSnapshot: HdChartRow | null;
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

/** A paid report stays readable while an administrator prepares a replacement. */
export function isHdReportRewriteInProgress(row: HdReportRow): boolean {
  return row.status === "pending" &&
    Boolean(row.adminRewriteStartedAt) &&
    Boolean(row.reportText?.trim());
}

/** Paid text is readable while done and throughout an atomic admin rewrite. */
export function isHdReportReadable(row: HdReportRow): row is HdReportRow & { reportText: string } {
  return Boolean(row.reportText?.trim()) &&
    (row.status === "done" || isHdReportRewriteInProgress(row));
}

/** Public wire shape: strips owner id, billing internals and model metadata. */
export function toPublicHdReport(row: HdReportRow) {
  const rewriteInProgress = isHdReportRewriteInProgress(row);
  const hideText = !isHdReportReadable(row);
  return {
    id: row.id,
    chartId: row.chartId,
    // The replacement is an internal workflow. Clients keep the last paid
    // version as a complete report until the new text commits atomically.
    status: rewriteInProgress ? "done" as const : row.status,
    reportText: hideText ? null : row.reportText,
    refreshing: rewriteInProgress,
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
  generation_revision: string;
  admin_rewrite_started_at?: string | Date | null;
  chart_snapshot?: HdChartRow | null;
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
    generationRevision: row.generation_revision,
    adminRewriteStartedAt: row.admin_rewrite_started_at
      ? toIso(row.admin_rewrite_started_at)
      : null,
    id: row.id,
    chartId: row.chart_id,
    chartSnapshot: row.chart_snapshot ?? null,
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
const TIME_RE = /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

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
  if (identity.birthTimeOccurrence !== undefined && identity.birthTimeOccurrence !== "earlier" && identity.birthTimeOccurrence !== "later") {
    throw new HdInputError("Выберите первое или второе наступление времени рождения.");
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
    birthTimeOccurrence: identity.birthTimeOccurrence,
  };
  try {
    return calculateHdChart(calcInput);
  } catch (error) {
    if (error instanceof Error && error.message === "AMBIGUOUS_BIRTH_TIME") {
      throw new HdInputError("Это время повторялось при переводе часов. Выберите первое или второе наступление времени.");
    }
    if (error instanceof Error && error.message === "NONEXISTENT_BIRTH_TIME") {
      throw new HdInputError("Такого местного времени не было из-за перевода часов. Проверьте время и место рождения.");
    }
    if (error instanceof Error && error.message === "HD_NONEXISTENT_BIRTH_DATE") {
      throw new HdInputError("Такой местной даты не было из-за смены часового пояса. Проверьте дату и место рождения.");
    }
    if (error instanceof Error && error.message.startsWith("HD_")) {
      throw new HdInputError("Проверьте дату, время и часовой пояс рождения.");
    }
    throw error;
  }
}


// Every owned-chart mutation uses the same user-first erasure fence. Memory
// cleanup runs after commit so it cannot wait on a user row held here.
type HdChartWriteContext = { client: PoolClient; forget: { userId: string; chartId: string }[] };
function chartQuery<T extends import("pg").QueryResultRow = import("pg").QueryResultRow>(ctx: HdChartWriteContext | undefined, sql: string, params?: unknown[]) {
  return ctx ? queryClient<T>(ctx.client, sql, params) : query<T>(sql, params);
}
async function withActiveChartUser<T>(userId: string, fn: (ctx: HdChartWriteContext) => Promise<T>): Promise<T> {
  const forget: HdChartWriteContext["forget"] = [];
  const result = await withTransaction(async client => {
    const user = (await queryClient<{erasure_requested_at:unknown}>(client,"SELECT erasure_requested_at FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if (!user || user.erasure_requested_at) throw new HdInputError("Аккаунт недоступен.");
    return fn({ client, forget });
  });
  if (forget.length) {
    const { forgetHdChartFact } = await import("@/lib/human-design/memory");
    for (const item of forget) await forgetHdChartFact(item.userId,item.chartId);
  }
  return result;
}

/** Recompute in place when the stored chart predates the current engine. */
async function refreshChartIfEngineStale(row: HdChartDbRow, ctx?: HdChartWriteContext): Promise<HdChartDbRow> {
  if (row.engine_version === HD_ENGINE_VERSION) return row;
  if (row.user_id && !ctx) return withActiveChartUser(row.user_id, c => refreshChartIfEngineStale(row,c));
  try {
    const timezone = normalizeHdTimezone(row.timezone);
    const chart = calculateHdChart({
      birthDate: toIsoDate(row.birth_date),
      birthTime: row.birth_time,
      timezone,
      birthTimeOccurrence: row.chart.birth?.timeOccurrence,
    });
    const updated = await chartQuery<HdChartDbRow>(ctx,
      `UPDATE hd_charts
       SET chart = $2, engine_version = $3, timezone = $4, updated_at = now()
       WHERE id = $1 AND engine_version = $5 AND user_id IS NOT DISTINCT FROM $6::uuid RETURNING *`,
      [row.id, JSON.stringify(chart), HD_ENGINE_VERSION, timezone, row.engine_version, row.user_id]
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
  keepChartId: string,
  ctx?: HdChartWriteContext
): Promise<void> {
  const { rows } = await chartQuery<{ id: string }>(ctx,
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
  if (ctx) {
    await queryClient(ctx.client,"INSERT INTO user_memory_source_suppressions(user_id,source_entity_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING",[userId,rows.map(r=>r.id)]);
    ctx.forget.push(...rows.map(r=>({userId,chartId:r.id})));
    return;
  }
  const { forgetHdChartFact } = await import("@/lib/human-design/memory");
  for (const row of rows) {
    await forgetHdChartFact(userId, row.id);
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
  gender?: BinaryGender | null,
  ctx?: HdChartWriteContext
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

  await chartQuery(ctx,
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
  row: HdChartDbRow,
  ctx?: HdChartWriteContext
): Promise<HdChartDbRow> {
  if (row.subject_kind === "other") return row;
  await demoteOtherSelfCharts(userId, row.id, ctx);
  return row;
}
/**
 * Get-or-compute scoped to the owner: every user gets their own row for a
 * given fingerprint; guests share the anonymous pool row. A logged-in caller
 * holding the pool row's claim token adopts it instead of duplicating.
 */
export async function getOrComputeHdChart(identity: HdChartIdentity,userId: string | null,subject?: HdSubject,claimToken?: string | null): Promise<HdChartComputeResult> {
  return userId ? withActiveChartUser(userId,ctx=>getOrComputeHdChartLocked(identity,userId,subject,claimToken,ctx)) : getOrComputeHdChartLocked(identity,userId,subject,claimToken);
}
async function getOrComputeHdChartLocked(
  identity: HdChartIdentity,
  userId: string | null,
  subject?: HdSubject,
  claimToken?: string | null,
  ctx?: HdChartWriteContext
): Promise<HdChartComputeResult> {
  validateHdInput(identity);
  identity = {...identity,birthTimeOccurrence:canonicalHdTimeOccurrence(identity)};
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

  const own = await chartQuery<HdChartDbRow>(ctx,
    "SELECT * FROM hd_charts WHERE fingerprint = $1 AND owner_key = $2",
    [fingerprint, ownerKey]
  );
  if (own.rows[0]) {
    let row = await refreshChartIfEngineStale(own.rows[0],ctx);
    if (userId && subject) {
      row = await relabelOwnedChart(row, subjectKind, subjectName, relationToSelf, gender, ctx);
    }
    if (userId) row = await finalizeOwnedSelfChart(userId, row, ctx);
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
      if (ctx) await queryClient(ctx.client,"SAVEPOINT hd_adopt");
      const adopted = await chartQuery<HdChartDbRow>(ctx,
        `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
         WHERE fingerprint = $1 AND user_id IS NULL
           AND claim_token = $3
         RETURNING *`,
        [fingerprint, userId, claimTokenHash]
      );
      adoptedRows = adopted.rows;
      if (ctx) await queryClient(ctx.client,"RELEASE SAVEPOINT hd_adopt");
    } catch (error) {
      // Adopt flips owner_key (generated from user_id): a concurrent own-row
      // insert for the same fingerprint makes this UPDATE hit the unique
      // index. The own row now exists — fall through and read it.
      if ((error as { code?: string })?.code !== "23505") throw error;
      if (ctx) await queryClient(ctx.client,"ROLLBACK TO SAVEPOINT hd_adopt");
      const own2 = await chartQuery<HdChartDbRow>(ctx,
        "SELECT * FROM hd_charts WHERE fingerprint = $1 AND owner_key = $2",
        [fingerprint, ownerKey]
      );
      if (own2.rows[0]) {
        let row = await refreshChartIfEngineStale(own2.rows[0],ctx);
        if (subject) {
          row = await relabelOwnedChart(
            row,
            subjectKind,
            subjectName,
            relationToSelf,
            gender,
            ctx
          );
        }
        row = await finalizeOwnedSelfChart(userId, row, ctx);
        return { row: mapChartRow(row), claimToken: null };
      }
      throw error;
    }
    if (adoptedRows[0]) {
      let row = await refreshChartIfEngineStale(adoptedRows[0],ctx);
      if (subject) {
        row = await relabelOwnedChart(
          row,
          subjectKind,
          subjectName,
          relationToSelf,
          gender,
          ctx
        );
      }
      row = await finalizeOwnedSelfChart(userId, row, ctx);
      return { row: mapChartRow(row), claimToken: null };
    }
  }

  // The chart is deterministic: reuse a sibling row's JSON when the engine
  // matches instead of recomputing identical ephemerides.
  let chart: HdChart | null = null;
  const sibling = await chartQuery<{ chart: HdChart; engine_version: string }>(ctx,
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
  const inserted = await chartQuery<HdChartDbRow>(ctx,
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
      gender,
      ctx
    );
  }
  if (userId) row = await finalizeOwnedSelfChart(userId, row, ctx);
  const mapped = mapChartRow(row);
  return {
    row: !userId ? { ...mapped, subjectKind, subjectName, relationToSelf, gender: gender ?? null } : mapped,
    claimToken: granted ? newClaimToken : null,
  };
}

/** Owner / creator wire shape: birth inputs needed to restore form + chips. */
export function toOwnerHdChartPayload(row: HdChartRow) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    placeName: row.placeName,
    birthDate: row.birthDate,
    birthTime: row.birthTime,
    birthTimeOccurrence: row.chart.birth?.timeOccurrence,
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
async function updateHdChartMetaLocked(
  chartId: string,
  userId: string,
  patch: {
    relationToSelf?: HdConnectionRelation | null;
    gender?: BinaryGender | null;
  },
  ctx: HdChartWriteContext
): Promise<HdChartRow | null> {
  if (!HD_UUID_RE.test(chartId)) return null;
  const hasRelation = patch.relationToSelf !== undefined;
  const hasGender = patch.gender !== undefined;
  if (!hasRelation && !hasGender) return null;

  const relation = hasRelation ? mapHdRelationToSelf(patch.relationToSelf) : null;
  if (hasRelation && !relation) return null;
  const gender = hasGender ? mapHdGender(patch.gender) : null;

  if (hasRelation && hasGender) {
    const { rows } = await chartQuery<HdChartDbRow>(ctx,
      `UPDATE hd_charts
       SET relation_to_self = $3, gender = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
       RETURNING *`,
      [chartId, userId, relation, gender]
    );
    return rows[0] ? mapChartRow(rows[0]) : null;
  }
  if (hasRelation) {
    const { rows } = await chartQuery<HdChartDbRow>(ctx,
      `UPDATE hd_charts
       SET relation_to_self = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
       RETURNING *`,
      [chartId, userId, relation]
    );
    return rows[0] ? mapChartRow(rows[0]) : null;
  }
  const { rows } = await chartQuery<HdChartDbRow>(ctx,
    `UPDATE hd_charts
     SET gender = $3, updated_at = now()
     WHERE id = $1 AND user_id = $2 AND subject_kind = 'other'
     RETURNING *`,
    [chartId, userId, gender]
  );
  return rows[0] ? mapChartRow(rows[0]) : null;
}


export async function updateHdChartMetaForUser(chartId:string,userId:string,patch:{relationToSelf?:HdConnectionRelation|null;gender?:BinaryGender|null}):Promise<HdChartRow|null> {
  return withActiveChartUser(userId,ctx=>updateHdChartMetaLocked(chartId,userId,patch,ctx));
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

/** Read a persisted chart for an existing report without recalculating or writing. */
export async function getStoredHdChartById(id: string): Promise<HdChartRow | null> {
  const { rows } = await query<HdChartDbRow>("SELECT * FROM hd_charts WHERE id = $1", [id]);
  return rows[0] ? mapChartRow(rows[0]) : null;
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
async function healDemotedSelfHdChart(userId: string, ctx: HdChartWriteContext): Promise<void> {
  const hasSelf = await chartQuery<{ id: string }>(ctx,
    `SELECT id FROM hd_charts
     WHERE user_id = $1 AND COALESCE(subject_kind, 'self') <> 'other'
     LIMIT 1`,
    [userId]
  );
  if (hasSelf.rows[0]) return;

  const profile = await chartQuery<{ birth_date: string }>(ctx,
    `SELECT birth_date::text AS birth_date FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const birthDate = profile.rows[0]?.birth_date?.slice(0, 10);
  if (!birthDate) return;

  // Prefer the oldest matching chart — usually the original personal one.
  const candidate = await chartQuery<{ id: string }>(ctx,
    `SELECT id FROM hd_charts
     WHERE user_id = $1 AND subject_kind = 'other' AND birth_date::text = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId, birthDate]
  );
  if (!candidate.rows[0]) return;

  await chartQuery(ctx,
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
async function healMultiSelfHdChart(userId: string, ctx: HdChartWriteContext): Promise<void> {
  const selfs = await chartQuery<{ id: string; birth_date: string }>(ctx,
    `SELECT id, birth_date::text AS birth_date
     FROM hd_charts
     WHERE user_id = $1 AND COALESCE(subject_kind, 'self') <> 'other'
     ORDER BY created_at ASC`,
    [userId]
  );
  if (selfs.rows.length <= 1) return;

  const profile = await chartQuery<{ birth_date: string }>(ctx,
    `SELECT birth_date::text AS birth_date FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const birthDate = profile.rows[0]?.birth_date?.slice(0, 10) ?? null;
  const keep =
    (birthDate
      ? selfs.rows.find((r) => r.birth_date.slice(0, 10) === birthDate)
      : null) ?? selfs.rows[0]!;
  await demoteOtherSelfCharts(userId, keep.id,ctx);
}

export async function listHdChartsForUser(userId: string): Promise<HdChartRow[]> {
  return withActiveChartUser(userId,async ctx=>{
  await healDemotedSelfHdChart(userId,ctx);
  await healMultiSelfHdChart(userId,ctx);
  const { rows } = await chartQuery<HdChartDbRow>(ctx,
    "SELECT * FROM hd_charts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [userId]
  );
  const refreshed: HdChartRow[] = [];
  for (const row of rows) {
    refreshed.push(mapChartRow(await refreshChartIfEngineStale(row,ctx)));
  }
  return refreshed;
  });
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
  const { deleteHdChartAndReceipts } = await import("./hd-receipt-recovery");
  if (!(await deleteHdChartAndReceipts(row.id,userId))) return null;
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
  return withActiveChartUser(userId,async ctx=>{
  const own = await chartQuery(ctx,
    "SELECT 1 FROM hd_charts WHERE fingerprint = $1 AND user_id = $2 LIMIT 1",
    [fingerprint, userId]
  );
  if (own.rows[0]) return true;
  if (!claimToken || !/^[0-9a-f]{48}$/.test(claimToken)) return false;
  const claimTokenHash = hashHdClaimToken(claimToken);
  try {
    await queryClient(ctx.client,"SAVEPOINT hd_claim");
    const result = await chartQuery(ctx,
      `UPDATE hd_charts SET user_id = $2, claim_token = NULL, updated_at = now()
       WHERE fingerprint = $1 AND user_id IS NULL
         AND claim_token = $3`,
      [fingerprint, userId, claimTokenHash]
    );
    await queryClient(ctx.client,"RELEASE SAVEPOINT hd_claim");
    if ((result.rowCount ?? 0) > 0) {
      // Guest rows are usually `self`; claiming must not leave two personal charts.
      await healMultiSelfHdChart(userId,ctx);
      return true;
    }
    return false;
  } catch (error) {
    // Concurrent own-row insert for the same fingerprint can trip unique
    // (fingerprint, owner_key) when this UPDATE flips the generated owner_key.
    if ((error as { code?: string })?.code !== "23505") throw error;
    await queryClient(ctx.client,"ROLLBACK TO SAVEPOINT hd_claim");
    const again = await chartQuery(ctx,
      "SELECT 1 FROM hd_charts WHERE fingerprint = $1 AND user_id = $2 LIMIT 1",
      [fingerprint, userId]
    );
    if (again.rows[0]) {
      await healMultiSelfHdChart(userId,ctx);
      return true;
    }
    throw error;
  }
  });
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
  userId: string,
  client?: PoolClient
): Promise<HdReportRow | null> {
  const sql = "SELECT * FROM hd_reports WHERE id = $1 AND user_id = $2";
  const { rows } = client ? await queryClient<HdReportDbRow>(client,sql,[reportId,userId]) : await query<HdReportDbRow>(sql,[reportId,userId]);
  return rows[0] ? mapReportRow(rows[0]) : null;
}

export async function getHdCompositeReportById(
  reportId: string,
  userId: string,
  client?: PoolClient
): Promise<HdCompositeReportRow | null> {
  const sql = "SELECT * FROM hd_composite_reports WHERE id=$1 AND user_id=$2";
  const { rows } = client ? await queryClient<HdCompositeReportDbRow>(client,sql,[reportId,userId]) : await query<HdCompositeReportDbRow>(sql,[reportId,userId]);
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
  generationRevision: string;
  baseSnapshot: HdChartRow | null;
  partnerSnapshot: HdChartRow | null;
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
  generation_revision: string;
  base_snapshot?: HdChartRow | null;
  partner_snapshot?: HdChartRow | null;
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
    generationRevision: r.generation_revision,
    id: r.id,
    baseChartId: r.base_chart_id,
    baseSnapshot: r.base_snapshot ?? null,
    partnerSnapshot: r.partner_snapshot ?? null,
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
    `SELECT *
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

export function isStalePendingComposite(report: HdCompositeReportRow): boolean {
  return (
    report.status === "pending" &&
    Date.now() - new Date(report.createdAt).getTime() > STALE_PENDING_MS
  );
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

/**
 * Reconciler for crashed purchases: rows stuck pending/error with a charge
 * attached and no refund recorded. Refunds the original amount (read from
 * the spend transaction — refundRunes is idempotent per source transaction)
 * and terminalizes the row. Rows younger than 1 h are left alone: generation
 * may still be in flight or the user may be about to resume.
 */
export async function reconcileHdReportCharges(limit = 50): Promise<number> {
  const { reconcileHdReceipts } = await import("./hd-receipt-recovery");
  return reconcileHdReceipts(limit);
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
  center: string, client?:PoolClient
): Promise<HdCenterInsightRow | null> {
  const sql=`SELECT id, chart_id, center, insight_text, created_at FROM hd_center_insights WHERE chart_id=$1 AND user_id=$2 AND center=$3`;
  const params=[chartId,userId,center];
  const {rows}=client?await queryClient<HdCenterInsightDbRow>(client,sql,params):await query<HdCenterInsightDbRow>(sql,params);
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
