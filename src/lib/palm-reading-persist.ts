import { ensureDb, query } from "@/lib/db";
import { withReadingLock } from "@/lib/reading-lock";
import { createHistoryEntry } from "@/lib/users";
import { alignPalmSnapshot, type PalmHand, type PalmSnapshot } from "@/lib/palm-constants";
import { PALM_DAY_TIMEZONE } from "@/lib/services/palm-guest-service";
import { palmSpendKeyBelongsToSnapshot } from "@/lib/palm-reading-billing";

const PALM_TODAY_SQL = `(created_at AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date`;

export function palmCalendarDayKey(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PALM_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type TodaysPaidPalmReport = {
  historyId: string;
  snapshotId: string | null;
  snapshot: PalmSnapshot | null;
  report: string;
  firstPalmDiscount: boolean;
};

export async function findTodaysPaidPalmReport(
  userId: string,
  whichHand?: PalmHand
): Promise<TodaysPaidPalmReport | null> {
  if (!(await ensureDb())) return null;
  const { rows } = await query<{
    id: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT id, context_data
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'palm_reading'
       AND coalesce(context_data->>'report', '') <> ''
       AND ${PALM_TODAY_SQL}
       AND ($2::text IS NULL OR context_data->'snapshot'->>'whichHand' = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, whichHand ?? null]
  );
  const row = rows[0];
  if (!row) return null;
  const ctx = row.context_data;
  const report = typeof ctx.report === "string" ? ctx.report : "";
  if (!report.trim()) return null;
  const snapshot =
    ctx.snapshot && typeof ctx.snapshot === "object" && !Array.isArray(ctx.snapshot)
      ? alignPalmSnapshot(ctx.snapshot as PalmSnapshot)
      : null;
  const snapshotId =
    typeof ctx.palmSnapshotId === "string" && /^[0-9a-f-]{36}$/i.test(ctx.palmSnapshotId)
      ? ctx.palmSnapshotId
      : null;
  return {
    historyId: row.id,
    snapshotId,
    snapshot,
    report,
    firstPalmDiscount: ctx.firstPalmDiscount === true,
  };
}

export async function persistPalmReadingResult(params: {
  profileUserId: string;
  reportBody: string;
  snapshot: PalmSnapshot;
  snapshotId?: string;
  userName: string;
  isPaid: boolean;
  spentRunes: number;
  idempotencyKey?: string;
  firstPalmDiscount: boolean;
}): Promise<string | undefined> {
  if (!(await ensureDb())) return undefined;

  const snapshot = alignPalmSnapshot(params.snapshot);
  const entry = await createHistoryEntry({
    userId: params.profileUserId,
    characterName: "numerolog",
    contextData: {
      type: "palm_reading",
      report: params.reportBody,
      interpretation: params.reportBody,
      snapshot,
      whichHand: snapshot.whichHand,
      handShape: snapshot.handShape,
      verdict: snapshot.verdict,
      palmSnapshotId: params.snapshotId,
      userName: params.userName,
      idempotencyKey: params.idempotencyKey,
      firstPalmDiscount: params.firstPalmDiscount,
    },
    isPaid: params.isPaid || params.spentRunes > 0,
  });
  return entry?.id;
}

export async function findPalmReadingEntry(
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
       AND context_data->>'type' = 'palm_reading'
     ORDER BY created_at DESC
     LIMIT 40`,
    [userId]
  );

  return (
    rows.find((row) => {
      const ctx = row.context_data;
      const ctxSnapshot =
        typeof ctx.palmSnapshotId === "string" ? ctx.palmSnapshotId : undefined;
      if (snapshotId && ctxSnapshot && ctxSnapshot !== snapshotId) return false;
      if (snapshotId && ctxSnapshot === snapshotId) return true;
      const ctxKey = typeof ctx.idempotencyKey === "string" ? ctx.idempotencyKey : "";
      return Boolean(
        snapshotId &&
          !ctxSnapshot &&
          idempotencyKey &&
          ctxKey === idempotencyKey &&
          palmSpendKeyBelongsToSnapshot(ctxKey, snapshotId)
      );
    }) ?? null
  );
}

export async function withPalmReadingLock<T>(
  userId: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `palm-reading:${userId}:${key}`;
  return withReadingLock(lockKey, fn);
}
