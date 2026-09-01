import { ensureDb, query, withTransaction } from "@/lib/db";
import { alignPalmSnapshot, type PalmSnapshot } from "@/lib/palm-constants";

export interface PalmArchiveEntry {
  snapshotId: string | null;
  historyId: string | null;
  paid: boolean;
  createdAt: string;
  reportAt: string | null;
  snapshot: PalmSnapshot;
  report: string | null;
}

function asPalmSnapshot(value: unknown): PalmSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PalmSnapshot>;
  if (candidate.handDetected !== true || !candidate.handShape || !candidate.whichHand) {
    return null;
  }
  return alignPalmSnapshot(candidate as PalmSnapshot);
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listPalmArchive(userId: string): Promise<PalmArchiveEntry[]> {
  if (!(await ensureDb())) return [];

  const [paid, pending] = await Promise.all([
    query<{
      id: string;
      created_at: Date | string;
      report_created_at: Date | string;
      context_data: Record<string, unknown>;
    }>(
      `SELECT h.id,
              COALESCE(s.created_at, h.created_at) AS created_at,
              h.created_at AS report_created_at,
              h.context_data
       FROM history h
       LEFT JOIN palm_guest_snapshots s
         ON s.id::text = h.context_data->>'palmSnapshotId'
       WHERE h.user_id = $1 AND h.context_data->>'type' = 'palm_reading'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    ),
    query<{
      id: string;
      created_at: Date | string;
      snapshot: unknown;
    }>(
      `SELECT s.id, s.created_at, s.snapshot
       FROM palm_guest_snapshots s
       WHERE s.claimed_user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM history h
           WHERE h.user_id = $1
             AND h.context_data->>'type' = 'palm_reading'
             AND h.context_data->>'palmSnapshotId' = s.id::text
         )
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [userId]
    ),
  ]);

  const entries: PalmArchiveEntry[] = [];

  for (const row of paid.rows) {
    const ctx = row.context_data ?? {};
    const snapshot = asPalmSnapshot(ctx.snapshot);
    if (!snapshot) continue;
    const report = typeof ctx.report === "string" && ctx.report.trim() ? ctx.report : null;
    entries.push({
      snapshotId: typeof ctx.palmSnapshotId === "string" ? ctx.palmSnapshotId : null,
      historyId: row.id,
      paid: true,
      createdAt: isoOf(row.created_at),
      reportAt: report ? isoOf(row.report_created_at) : null,
      snapshot,
      report,
    });
  }

  for (const row of pending.rows) {
    const snapshot = asPalmSnapshot(row.snapshot);
    if (!snapshot) continue;
    entries.push({
      snapshotId: row.id,
      historyId: null,
      paid: false,
      createdAt: isoOf(row.created_at),
      reportAt: null,
      snapshot,
      report: null,
    });
  }

  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return entries.slice(0, 50);
}

export async function getPalmArchiveEntry(
  userId: string,
  id: string
): Promise<PalmArchiveEntry | null> {
  if (!(await ensureDb()) || !UUID_RE.test(id)) return null;

  const historyHit = await query<{
    id: string;
    created_at: Date | string;
    report_created_at: Date | string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT h.id,
            COALESCE(s.created_at, h.created_at) AS created_at,
            h.created_at AS report_created_at,
            h.context_data
     FROM history h
     LEFT JOIN palm_guest_snapshots s
       ON s.id::text = h.context_data->>'palmSnapshotId'
     WHERE h.id = $1 AND h.user_id = $2 AND h.context_data->>'type' = 'palm_reading'
     LIMIT 1`,
    [id, userId]
  );
  const historyRow = historyHit.rows[0];
  if (historyRow) {
    const ctx = historyRow.context_data ?? {};
    const snapshot = asPalmSnapshot(ctx.snapshot);
    if (!snapshot) return null;
    const report = typeof ctx.report === "string" && ctx.report.trim() ? ctx.report : null;
    return {
      snapshotId: typeof ctx.palmSnapshotId === "string" ? ctx.palmSnapshotId : null,
      historyId: historyRow.id,
      paid: true,
      createdAt: isoOf(historyRow.created_at),
      reportAt: report ? isoOf(historyRow.report_created_at) : null,
      snapshot,
      report,
    };
  }

  const snapshotHit = await query<{
    id: string;
    created_at: Date | string;
    snapshot: unknown;
    history_id: string | null;
    report: string | null;
    report_at: Date | string | null;
  }>(
    `SELECT s.id, s.created_at, s.snapshot,
            h.id AS history_id,
            h.context_data->>'report' AS report,
            h.created_at AS report_at
     FROM palm_guest_snapshots s
     LEFT JOIN LATERAL (
       SELECT h.id, h.context_data, h.created_at
       FROM history h
       WHERE h.user_id = $2
         AND h.context_data->>'type' = 'palm_reading'
         AND h.context_data->>'palmSnapshotId' = s.id::text
       ORDER BY h.created_at DESC
       LIMIT 1
     ) h ON TRUE
     WHERE s.id = $1 AND s.claimed_user_id = $2
     LIMIT 1`,
    [id, userId]
  );
  const snapshotRow = snapshotHit.rows[0];
  if (!snapshotRow) return null;
  const snapshot = asPalmSnapshot(snapshotRow.snapshot);
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
  };
}

export async function deletePalmArchiveEntry(
  userId: string,
  id: string
): Promise<{ ok: boolean }> {
  if (!(await ensureDb()) || !UUID_RE.test(id)) return { ok: false };

  return withTransaction(async (client) => {
    const historyDel = await client.query<{ context_data: Record<string, unknown> }>(
      `DELETE FROM history
       WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'palm_reading'
       RETURNING context_data`,
      [id, userId]
    );
    const linkedSnapshotId = historyDel.rows[0]?.context_data?.palmSnapshotId;
    if (typeof linkedSnapshotId === "string" && UUID_RE.test(linkedSnapshotId)) {
      await client.query(
        `DELETE FROM palm_guest_snapshots
         WHERE id = $1 AND claimed_user_id = $2`,
        [linkedSnapshotId, userId]
      );
    }

    const snapshotDel = await client.query(
      `DELETE FROM palm_guest_snapshots
       WHERE id = $1 AND claimed_user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if ((snapshotDel.rowCount ?? 0) > 0) {
      await client.query(
        `DELETE FROM history
         WHERE user_id = $1
           AND context_data->>'type' = 'palm_reading'
           AND context_data->>'palmSnapshotId' = $2`,
        [userId, id]
      );
    }

    return { ok: (historyDel.rowCount ?? 0) + (snapshotDel.rowCount ?? 0) > 0 };
  });
}
