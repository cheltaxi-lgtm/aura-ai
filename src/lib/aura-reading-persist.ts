import { ensureDb, query } from "@/lib/db";
import { createHistoryEntry } from "@/lib/users";
import type { AuraSnapshot } from "@/lib/aura-constants";
import { AURA_DAY_TIMEZONE } from "@/lib/services/aura-guest-service";

const AURA_TODAY_SQL = `(created_at AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date`;

export function auraCalendarDayKey(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AURA_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type TodaysPaidAuraReport = {
  historyId: string;
  snapshotId: string | null;
  snapshot: AuraSnapshot | null;
  report: string;
  firstAuraDiscount: boolean;
};

/** Finished paid/full report written today (Moscow day) — any snapshot. */
export async function findTodaysPaidAuraReport(
  userId: string
): Promise<TodaysPaidAuraReport | null> {
  if (!(await ensureDb())) return null;
  const { rows } = await query<{
    id: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT id, context_data
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'aura_reading'
       AND coalesce(context_data->>'report', '') <> ''
       AND ${AURA_TODAY_SQL}
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  const ctx = row.context_data;
  const report = typeof ctx.report === "string" ? ctx.report : "";
  if (!report.trim()) return null;
  const snapshot =
    ctx.snapshot && typeof ctx.snapshot === "object" && !Array.isArray(ctx.snapshot)
      ? (ctx.snapshot as AuraSnapshot)
      : null;
  const snapshotId =
    typeof ctx.auraSnapshotId === "string" && /^[0-9a-f-]{36}$/i.test(ctx.auraSnapshotId)
      ? ctx.auraSnapshotId
      : null;
  return {
    historyId: row.id,
    snapshotId,
    snapshot,
    report,
    firstAuraDiscount: ctx.firstAuraDiscount === true,
  };
}

export async function persistAuraReadingResult(params: {
  profileUserId: string;
  reportBody: string;
  snapshot: AuraSnapshot;
  snapshotId?: string;
  userName: string;
  isPaid: boolean;
  spentRunes: number;
  idempotencyKey?: string;
  firstAuraDiscount: boolean;
}): Promise<string | undefined> {
  if (!(await ensureDb())) return undefined;

  const entry = await createHistoryEntry({
    userId: params.profileUserId,
    characterName: "numerolog",
    contextData: {
      type: "aura_reading",
      report: params.reportBody,
      // Dual-write: cabinet/history readers historically expect `interpretation`.
      interpretation: params.reportBody,
      snapshot: params.snapshot,
      dominantColor: params.snapshot.dominantColor,
      secondaryColors: params.snapshot.secondaryColors,
      verdict: params.snapshot.verdict,
      auraSnapshotId: params.snapshotId,
      userName: params.userName,
      idempotencyKey: params.idempotencyKey,
      firstAuraDiscount: params.firstAuraDiscount,
    },
    isPaid: params.isPaid || params.spentRunes > 0,
  });
  return entry?.id;
}

/** Find an existing finished report for the same snapshot (dedupe under lock). */
export async function findAuraReadingEntry(
  userId: string,
  snapshotId: string | undefined,
  idempotencyKey?: string
): Promise<{ id: string; context_data: Record<string, unknown> } | null> {
  if (!(await ensureDb())) return null;
  const { rows } = await query<{
    id: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT id, context_data
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'aura_reading'
     ORDER BY created_at DESC
     LIMIT 40`,
    [userId]
  );

  return (
    rows.find((row) => {
      const ctx = row.context_data;
      const ctxSnapshot =
        typeof ctx.auraSnapshotId === "string" ? ctx.auraSnapshotId : undefined;
      // A different snapshot never matches — a reused client key must not
      // return snapshot A's report against snapshot B.
      if (snapshotId && ctxSnapshot && ctxSnapshot !== snapshotId) return false;
      if (snapshotId && ctxSnapshot === snapshotId) return true;
      return Boolean(idempotencyKey && ctx.idempotencyKey === idempotencyKey);
    }) ?? null
  );
}

function auraReadingLockKey(userId: string, key: string): string {
  return `aura-reading:${userId}:${key}`;
}

/** Serialize report generation per user + snapshot (prevents duplicate charges). */
export async function withAuraReadingLock<T>(
  userId: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = auraReadingLockKey(userId, key);
  await query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
  try {
    return await fn();
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {});
  }
}
