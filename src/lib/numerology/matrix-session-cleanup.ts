/**
 * Shared cleanup for destiny-matrix sessions + report history.
 * Site cabinet / chat delete and Telegram bot must use the same rules.
 */
import { query } from "@/lib/db";
import { deleteConsultationSession } from "@/lib/session";
import {
  deleteOwnedMatrixReportsForBirth,
  deleteUserMatrixReport,
  MATRIX_REPORT_TOOL_ID,
  toIsoBirthDate,
} from "@/lib/services/numerology-report-service";
import { decodeNumerologSpreadId } from "@/lib/numerology/tools";

/** SQL predicate: session row is a destiny-matrix consultation. */
export function sqlIsDestinyMatrixSession(alias = "s"): string {
  return `(
    COALESCE(${alias}.spread_id, '') IN ('destiny_matrix', 'numerolog:destiny_matrix')
    OR COALESCE(${alias}.spread_id, '') LIKE 'numerolog:destiny_matrix%'
    OR COALESCE(${alias}.intention, '') = 'destiny_matrix'
  )`;
}

export function isDestinyMatrixSession(session: {
  spread_id?: string | null;
  intention?: string | null;
  spreadId?: string | null;
}): boolean {
  const spreadId = session.spread_id ?? session.spreadId ?? "";
  const intention = session.intention ?? "";
  if (intention === "destiny_matrix") return true;
  if (spreadId === "destiny_matrix" || spreadId === "numerolog:destiny_matrix") {
    return true;
  }
  if (spreadId.startsWith("numerolog:destiny_matrix")) return true;
  return decodeNumerologSpreadId(spreadId) === "destiny_matrix";
}

/** Delete leftover matrix chat sessions after report wipe. */
export async function purgeMatrixConsultationSessions(
  profileUserId: string,
  sessionIds: string[] = []
): Promise<number> {
  const wanted = new Set(sessionIds.filter((id) => Boolean(id?.trim())));

  // Orphan = matrix chat not linked to any remaining owned report for this user.
  // Scoped by session_id so wiping birth date A does not keep stale chats when
  // the user still owns a report for birth date B.
  const { rows: orphans } = await query<{ id: string }>(
    `SELECT s.id
     FROM sessions s
     WHERE s.user_id = $1
       AND ${sqlIsDestinyMatrixSession("s")}
       AND NOT EXISTS (
         SELECT 1
         FROM numerology_report_history n
         WHERE n.user_id = s.user_id
           AND n.tool_id = $2
           AND length(trim(n.content)) > 0
           AND n.session_id = s.id
       )`,
    [profileUserId, MATRIX_REPORT_TOOL_ID]
  );
  for (const row of orphans) wanted.add(row.id);

  let removed = 0;
  await Promise.all(
    [...wanted].map(async (id) => {
      try {
        const ok = await deleteConsultationSession(id, profileUserId);
        if (ok) removed += 1;
      } catch (err) {
        console.warn("[matrix-cleanup] session purge failed", id, err);
      }
    })
  );
  return removed;
}

export type WipeMatrixResult = {
  deletedReports: number;
  purgedSessions: number;
  birthDates: string[];
};

/**
 * Full user-initiated matrix wipe: report history + linked/orphan sessions.
 * Pass reportId and/or birthDate; if both empty, wipes nothing.
 */
export async function wipeUserMatrixReports(input: {
  userId: string;
  reportId?: string | null;
  birthDate?: string | null;
}): Promise<WipeMatrixResult> {
  const birthDates = new Set<string>();
  let deletedReports = 0;
  const sessionIds: string[] = [];

  if (input.reportId?.trim()) {
    const { rows } = await query<{ birth_date: Date | string; session_id: string | null }>(
      `SELECT birth_date, session_id
       FROM numerology_report_history
       WHERE user_id = $1 AND id = $2::uuid AND tool_id = $3
       LIMIT 1`,
      [input.userId, input.reportId.trim(), MATRIX_REPORT_TOOL_ID]
    );
    const row = rows[0];
    if (row) {
      const isoFromReport = formatRowBirth(row.birth_date);
      if (isoFromReport) birthDates.add(isoFromReport);
      if (row.session_id) sessionIds.push(row.session_id);
    }
  }

  const iso = toIsoBirthDate(input.birthDate);
  if (iso) birthDates.add(iso);

  for (const birth of birthDates) {
    const many = await deleteOwnedMatrixReportsForBirth(input.userId, birth);
    deletedReports += many.deleted;
    sessionIds.push(...many.sessionIds);
  }

  // Fallback: delete by id if birth wipe found nothing (race / odd tool_id).
  if (deletedReports < 1 && input.reportId?.trim()) {
    const one = await deleteUserMatrixReport(input.userId, input.reportId);
    if (one.deleted) deletedReports += 1;
    sessionIds.push(...one.sessionIds);
  }

  const purgedSessions = await purgeMatrixConsultationSessions(
    input.userId,
    sessionIds
  );

  return {
    deletedReports,
    purgedSessions,
    birthDates: [...birthDates],
  };
}

function formatRowBirth(value: Date | string): string | null {
  if (typeof value === "string") return toIsoBirthDate(value.slice(0, 10));
  return toIsoBirthDate(
    `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
  );
}

/**
 * When user deletes a matrix chat session from site/cabinet — drop ownership
 * for linked birth dates (+ profile birth fallback) so buy-once cannot reopen.
 * Does not delete the session itself (caller does that) to avoid recursion.
 */
export async function wipeMatrixOwnershipForSession(input: {
  userId: string;
  sessionId: string;
  /** Profile birth date fallback when report.session_id was stale. */
  profileBirthDate?: string | null;
  /** When false, skip profile-birth wipe (caller did not confirm matrix session). */
  isMatrixSession?: boolean;
}): Promise<WipeMatrixResult> {
  const birthDates = new Set<string>();

  const { rows } = await query<{ birth_date: Date | string }>(
    `SELECT birth_date
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND (
         session_id = $3::uuid
         OR ($4::date IS NOT NULL AND birth_date = $4::date)
       )`,
    [
      input.userId,
      MATRIX_REPORT_TOOL_ID,
      input.sessionId,
      toIsoBirthDate(input.profileBirthDate),
    ]
  );

  for (const row of rows) {
    const iso = formatRowBirth(row.birth_date);
    if (iso) birthDates.add(iso);
  }

  const profileIso = toIsoBirthDate(input.profileBirthDate);
  if (
    profileIso &&
    birthDates.size === 0 &&
    input.isMatrixSession !== false
  ) {
    // Stale session_id on report: wipe profile birth only for confirmed matrix chats.
    birthDates.add(profileIso);
  }

  let deletedReports = 0;
  const sessionIds = [input.sessionId];
  for (const iso of birthDates) {
    const many = await deleteOwnedMatrixReportsForBirth(input.userId, iso);
    deletedReports += many.deleted;
    sessionIds.push(...many.sessionIds);
  }

  // Also clear any rows still pointing at this session.
  const dangling = await query(
    `DELETE FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND session_id = $3::uuid`,
    [input.userId, MATRIX_REPORT_TOOL_ID, input.sessionId]
  );
  deletedReports += dangling.rowCount ?? 0;

  return {
    deletedReports,
    purgedSessions: 0,
    birthDates: [...birthDates],
  };
}
