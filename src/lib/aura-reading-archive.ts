import { ensureDb, query, withTransaction } from "@/lib/db";
import { alignAuraSnapshotColors, type AuraSnapshot } from "@/lib/aura-constants";

/**
 * Aura archive — the user's aura readings from BOTH sources:
 *  - paid full reports (history rows, type aura_reading);
 *  - claimed snapshots without a report yet (aura_guest_snapshots).
 * Claimed snapshots are never swept, so the archive is stable over time.
 * Photos are never stored — only the structured snapshot + report text.
 */
export interface AuraArchiveEntry {
  /** Snapshot id (aura_guest_snapshots). Null only for legacy history rows without a link. */
  snapshotId: string | null;
  /** History row id when a paid report exists. */
  historyId: string | null;
  paid: boolean;
  /** When the snapshot was taken (history date for legacy rows). */
  createdAt: string;
  /** When the paid report finished. */
  reportAt: string | null;
  snapshot: AuraSnapshot;
  report: string | null;
  subjectId: string | null;
  subjectKind: "self" | "other" | null;
  subjectName: string | null;
}

function asAuraSnapshot(value: unknown): AuraSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AuraSnapshot>;
  if (
    !candidate.dominantColor ||
    typeof candidate.dominantColor !== "object" ||
    !Array.isArray(candidate.layers) ||
    !Array.isArray(candidate.chakras)
  ) {
    return null;
  }
  return alignAuraSnapshotColors(candidate as AuraSnapshot);
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asSubjectKind(value: unknown): "self" | "other" | null {
  return value === "other" ? "other" : value === "self" ? "self" : null;
}

function subjectFromCtx(ctx: Record<string, unknown>): {
  subjectId: string | null;
  subjectKind: "self" | "other" | null;
  subjectName: string | null;
} {
  const id = typeof ctx.subjectId === "string" ? ctx.subjectId : null;
  const name = typeof ctx.subjectName === "string" ? ctx.subjectName : null;
  return {
    subjectId: id,
    subjectKind: asSubjectKind(ctx.subjectKind),
    subjectName: name,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listAuraArchive(userId: string): Promise<AuraArchiveEntry[]> {
  if (!(await ensureDb())) return [];

  const [paid, pending] = await Promise.all([
    query<{
      id: string;
      created_at: Date | string;
      report_created_at: Date | string;
      context_data: Record<string, unknown>;
      subject_id: string | null;
      subject_kind: string | null;
      subject_name: string | null;
    }>(
      `SELECT h.id,
              COALESCE(s.created_at, h.created_at) AS created_at,
              h.created_at AS report_created_at,
              h.context_data,
              s.subject_id,
              s.subject_kind,
              COALESCE(s.subject_name, h.context_data->>'subjectName') AS subject_name
       FROM history h
       LEFT JOIN aura_guest_snapshots s
         ON s.id::text = h.context_data->>'auraSnapshotId'
       WHERE h.user_id = $1 AND h.context_data->>'type' = 'aura_reading'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    ),
    query<{
      id: string;
      created_at: Date | string;
      snapshot: unknown;
      subject_id: string | null;
      subject_kind: string | null;
      subject_name: string | null;
    }>(
      `SELECT s.id, s.created_at, s.snapshot, s.subject_id, s.subject_kind, s.subject_name
       FROM aura_guest_snapshots s
       WHERE s.claimed_user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM history h
           WHERE h.user_id = $1
             AND h.context_data->>'type' = 'aura_reading'
             AND h.context_data->>'auraSnapshotId' = s.id::text
         )
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [userId]
    ),
  ]);

  const entries: AuraArchiveEntry[] = [];

  for (const row of paid.rows) {
    const ctx = row.context_data ?? {};
    const snapshot = asAuraSnapshot(ctx.snapshot);
    if (!snapshot) continue;
    const report = typeof ctx.report === "string" && ctx.report.trim() ? ctx.report : null;
    const fromCtx = subjectFromCtx(ctx);
    entries.push({
      snapshotId: typeof ctx.auraSnapshotId === "string" ? ctx.auraSnapshotId : null,
      historyId: row.id,
      paid: true,
      createdAt: isoOf(row.created_at),
      reportAt: report ? isoOf(row.report_created_at) : null,
      snapshot,
      report,
      subjectId: row.subject_id ?? fromCtx.subjectId,
      subjectKind: asSubjectKind(row.subject_kind) ?? fromCtx.subjectKind,
      subjectName: row.subject_name ?? fromCtx.subjectName,
    });
  }

  for (const row of pending.rows) {
    const snapshot = asAuraSnapshot(row.snapshot);
    if (!snapshot) continue;
    entries.push({
      snapshotId: row.id,
      historyId: null,
      paid: false,
      createdAt: isoOf(row.created_at),
      reportAt: null,
      snapshot,
      report: null,
      subjectId: row.subject_id,
      subjectKind: asSubjectKind(row.subject_kind),
      subjectName: row.subject_name,
    });
  }

  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return entries.slice(0, 50);
}

/**
 * Load one archive entry by history id OR snapshot id — always ownership-scoped.
 * A snapshot id resolves its linked paid report when one exists.
 */
export async function getAuraArchiveEntry(
  userId: string,
  id: string
): Promise<AuraArchiveEntry | null> {
  if (!(await ensureDb()) || !UUID_RE.test(id)) return null;

  const historyHit = await query<{
    id: string;
    created_at: Date | string;
    report_created_at: Date | string;
    context_data: Record<string, unknown>;
    subject_id: string | null;
    subject_kind: string | null;
    subject_name: string | null;
  }>(
    `SELECT h.id,
            COALESCE(s.created_at, h.created_at) AS created_at,
            h.created_at AS report_created_at,
            h.context_data,
            s.subject_id,
            s.subject_kind,
            COALESCE(s.subject_name, h.context_data->>'subjectName') AS subject_name
     FROM history h
     LEFT JOIN aura_guest_snapshots s
       ON s.id::text = h.context_data->>'auraSnapshotId'
     WHERE h.id = $1 AND h.user_id = $2 AND h.context_data->>'type' = 'aura_reading'
     LIMIT 1`,
    [id, userId]
  );
  const historyRow = historyHit.rows[0];
  if (historyRow) {
    const ctx = historyRow.context_data ?? {};
    const snapshot = asAuraSnapshot(ctx.snapshot);
    if (!snapshot) return null;
    const report = typeof ctx.report === "string" && ctx.report.trim() ? ctx.report : null;
    const fromCtx = subjectFromCtx(ctx);
    return {
      snapshotId: typeof ctx.auraSnapshotId === "string" ? ctx.auraSnapshotId : null,
      historyId: historyRow.id,
      paid: true,
      createdAt: isoOf(historyRow.created_at),
      reportAt: report ? isoOf(historyRow.report_created_at) : null,
      snapshot,
      report,
      subjectId: historyRow.subject_id ?? fromCtx.subjectId,
      subjectKind: asSubjectKind(historyRow.subject_kind) ?? fromCtx.subjectKind,
      subjectName: historyRow.subject_name ?? fromCtx.subjectName,
    };
  }

  const snapshotHit = await query<{
    id: string;
    created_at: Date | string;
    snapshot: unknown;
    history_id: string | null;
    report: string | null;
    report_at: Date | string | null;
    subject_id: string | null;
    subject_kind: string | null;
    subject_name: string | null;
  }>(
    `SELECT s.id, s.created_at, s.snapshot,
            h.id AS history_id,
            h.context_data->>'report' AS report,
            h.created_at AS report_at,
            s.subject_id, s.subject_kind, s.subject_name
     FROM aura_guest_snapshots s
     LEFT JOIN LATERAL (
       SELECT h.id, h.context_data, h.created_at
       FROM history h
       WHERE h.user_id = $2
         AND h.context_data->>'type' = 'aura_reading'
         AND h.context_data->>'auraSnapshotId' = s.id::text
       ORDER BY h.created_at DESC
       LIMIT 1
     ) h ON TRUE
     WHERE s.id = $1 AND s.claimed_user_id = $2
     LIMIT 1`,
    [id, userId]
  );
  const snapshotRow = snapshotHit.rows[0];
  if (!snapshotRow) return null;
  const snapshot = asAuraSnapshot(snapshotRow.snapshot);
  if (!snapshot) return null;
  const report =
    typeof snapshotRow.report === "string" && snapshotRow.report.trim()
      ? snapshotRow.report
      : null;
  return {
    snapshotId: snapshotRow.id,
    historyId: snapshotRow.history_id,
    paid: Boolean(snapshotRow.history_id && report),
    createdAt: isoOf(snapshotRow.created_at),
    reportAt: snapshotRow.report_at ? isoOf(snapshotRow.report_at) : null,
    snapshot,
    report,
    subjectId: snapshotRow.subject_id,
    subjectKind: asSubjectKind(snapshotRow.subject_kind),
    subjectName: snapshotRow.subject_name,
  };
}

/**
 * Delete an archive entry by history id OR snapshot id (ownership-scoped).
 * Deleting a snapshot also removes its linked history report; deleting a
 * history row keeps the snapshot (it falls back to an unpaid archive entry).
 */
export async function deleteAuraArchiveEntry(
  userId: string,
  id: string
): Promise<{ ok: boolean }> {
  if (!(await ensureDb()) || !UUID_RE.test(id)) return { ok: false };

  return withTransaction(async (client) => {
    const historyDel = await client.query(
      `DELETE FROM history
       WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'aura_reading'`,
      [id, userId]
    );

    const snapshotDel = await client.query(
      `DELETE FROM aura_guest_snapshots
       WHERE id = $1 AND claimed_user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if ((snapshotDel.rowCount ?? 0) > 0) {
      await client.query(
        `DELETE FROM history
         WHERE user_id = $1
           AND context_data->>'type' = 'aura_reading'
           AND context_data->>'auraSnapshotId' = $2`,
        [userId, id]
      );
    }

    return { ok: (historyDel.rowCount ?? 0) + (snapshotDel.rowCount ?? 0) > 0 };
  });
}
