/**
 * Shared cleanup for destiny-matrix sessions + report history.
 * Site cabinet / chat delete and Telegram bot must use the same rules.
 *
 * Multi-subject rule: never wipe by profile birth date alone — that erased
 * the user's own matrix when ordering/deleting a matrix for another person.
 */
import { query } from "@/lib/db";
import { deleteConsultationSession } from "@/lib/session";
import {
  deleteOwnedMatrixReportsForBirth,
  deleteOwnedMatrixReportsForSubject,
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
  subjectIds: string[];
};

/**
 * Full user-initiated matrix wipe: report history + linked/orphan sessions.
 * Prefer subjectId or reportId. birthDate alone only touches the self subject.
 */
export async function wipeUserMatrixReports(input: {
  userId: string;
  reportId?: string | null;
  subjectId?: string | null;
  birthDate?: string | null;
}): Promise<WipeMatrixResult> {
  const birthDates = new Set<string>();
  const subjectIds = new Set<string>();
  let deletedReports = 0;
  const sessionIds: string[] = [];

  if (input.subjectId?.trim()) {
    const many = await deleteOwnedMatrixReportsForSubject(
      input.userId,
      input.subjectId.trim()
    );
    deletedReports += many.deleted;
    sessionIds.push(...many.sessionIds);
    subjectIds.add(input.subjectId.trim());
  } else if (input.reportId?.trim()) {
    const { rows } = await query<{
      birth_date: Date | string;
      session_id: string | null;
      subject_id: string | null;
    }>(
      `SELECT birth_date, session_id, subject_id
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
      if (row.subject_id) {
        subjectIds.add(row.subject_id);
        const many = await deleteOwnedMatrixReportsForSubject(
          input.userId,
          row.subject_id
        );
        deletedReports += many.deleted;
        sessionIds.push(...many.sessionIds);
      } else {
        const one = await deleteUserMatrixReport(input.userId, input.reportId);
        if (one.deleted) deletedReports += 1;
        sessionIds.push(...one.sessionIds);
      }
    }
  } else {
    // Birth-date path: self-subject only (never other people with the same date).
    const iso = toIsoBirthDate(input.birthDate);
    if (iso) {
      birthDates.add(iso);
      const many = await deleteOwnedMatrixReportsForBirth(input.userId, iso);
      deletedReports += many.deleted;
      sessionIds.push(...many.sessionIds);
    }
  }

  // Fallback: delete by id if scoped wipe found nothing (race / odd tool_id).
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
    subjectIds: [...subjectIds],
  };
}

function formatRowBirth(value: Date | string): string | null {
  if (typeof value === "string") return toIsoBirthDate(value.slice(0, 10));
  return toIsoBirthDate(
    `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
  );
}

/**
 * When user deletes a matrix chat session — drop ownership only for reports
 * linked to that session (by session_id / subject_id on those rows).
 * Never wipe by profile birth date: that erased self when deleting another's chat.
 */
export async function wipeMatrixOwnershipForSession(input: {
  userId: string;
  sessionId: string;
  /** @deprecated Ignored — kept for call-site compatibility. */
  profileBirthDate?: string | null;
  /** When false, skip wipe (caller did not confirm matrix session). */
  isMatrixSession?: boolean;
}): Promise<WipeMatrixResult> {
  if (input.isMatrixSession === false) {
    return {
      deletedReports: 0,
      purgedSessions: 0,
      birthDates: [],
      subjectIds: [],
    };
  }

  const birthDates = new Set<string>();
  const subjectIds = new Set<string>();

  const { rows } = await query<{
    id: string;
    birth_date: Date | string;
    subject_id: string | null;
  }>(
    `SELECT id, birth_date, subject_id
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND session_id = $3::uuid`,
    [input.userId, MATRIX_REPORT_TOOL_ID, input.sessionId]
  );

  let deletedReports = 0;
  const sessionIds = [input.sessionId];

  for (const row of rows) {
    const iso = formatRowBirth(row.birth_date);
    if (iso) birthDates.add(iso);
    if (row.subject_id) {
      subjectIds.add(row.subject_id);
      const many = await deleteOwnedMatrixReportsForSubject(
        input.userId,
        row.subject_id
      );
      deletedReports += many.deleted;
      sessionIds.push(...many.sessionIds);
    } else {
      const one = await deleteUserMatrixReport(input.userId, row.id);
      if (one.deleted) deletedReports += 1;
      sessionIds.push(...one.sessionIds);
    }
  }

  // Clear any rows still pointing at this session (no cross-subject birth wipe).
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
    subjectIds: [...subjectIds],
  };
}
