import { query, queryClient, withTransaction } from "@/lib/db";
import { PRICING } from "@/lib/config/pricing";
import { matrixCalendarYmd } from "@/lib/numerology/matrix-calendar";
import { toIsoBirthDate } from "@/lib/services/numerology-report-service";

export type MatrixSubjectKind = "self" | "child" | "partner" | "other";

export type MatrixSubject = {
  id: string;
  kind: MatrixSubjectKind;
  displayName: string | null;
  birthDate: string;
  birthTime: string | null;
  birthCity: string | null;
  createdAt: string;
  updatedAt: string;
};

type MatrixSubjectRow = {
  id: string;
  kind: MatrixSubjectKind;
  display_name: string | null;
  birth_date: Date | string;
  birth_time: string | null;
  birth_city: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export const MATRIX_SUBJECT_KINDS: MatrixSubjectKind[] = [
  "self",
  "child",
  "partner",
  "other",
];

const SUBJECT_COLS = `
  id, kind, display_name, birth_date, birth_time, birth_city, created_at, updated_at
`;

export function isMatrixSubjectKind(v: string): v is MatrixSubjectKind {
  return MATRIX_SUBJECT_KINDS.includes(v as MatrixSubjectKind);
}

/** Subject DOB: age 0–120 inclusive, not future. Returns ISO or null. */
export function validateSubjectBirthDate(
  raw: string | null | undefined
): string | null {
  const iso = toIsoBirthDate(raw);
  if (!iso) return null;

  const [year, month, day] = iso.split("-").map(Number);
  const today = matrixCalendarYmd();
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;

  return age >= 0 && age <= 120 ? iso : null;
}

function formatDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function formatTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapSubject(row: MatrixSubjectRow): MatrixSubject {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    birthDate: formatDate(row.birth_date),
    birthTime: row.birth_time,
    birthCity: row.birth_city,
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
  };
}

function subjectError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

export async function listMatrixSubjects(userId: string): Promise<MatrixSubject[]> {
  const { rows } = await query<MatrixSubjectRow>(
    `SELECT ${SUBJECT_COLS}
     FROM matrix_subjects
     WHERE user_id = $1
     ORDER BY CASE WHEN kind = 'self' THEN 0 ELSE 1 END, created_at DESC`,
    [userId]
  );
  return rows.map(mapSubject);
}

export async function getMatrixSubject(
  userId: string,
  subjectId: string
): Promise<MatrixSubject | null> {
  const { rows } = await query<MatrixSubjectRow>(
    `SELECT ${SUBJECT_COLS}
     FROM matrix_subjects
     WHERE user_id = $1 AND id = $2::uuid
     LIMIT 1`,
    [userId, subjectId.trim()]
  );
  return rows[0] ? mapSubject(rows[0]) : null;
}

export async function ensureSelfSubject(userId: string): Promise<MatrixSubject | null> {
  return withTransaction(async (client) => {
    const profile = await queryClient<{ birth_date: Date | string | null; name: string | null }>(
      client,
      `SELECT birth_date, name FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const user = profile.rows[0];
    if (!user?.birth_date) return null;

    const birthDate = formatDate(user.birth_date);
    await queryClient(
      client,
      `INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
       VALUES ($1, 'self', $2, $3::date)
       ON CONFLICT DO NOTHING`,
      [userId, user.name?.trim() || null, birthDate]
    );
    await queryClient(
      client,
      `UPDATE matrix_subjects
       SET birth_date = $2::date,
           display_name = COALESCE(NULLIF(trim(display_name), ''), $3),
           updated_at = NOW()
       WHERE user_id = $1 AND kind = 'self'
         AND birth_date IS DISTINCT FROM $2::date`,
      [userId, birthDate, user.name?.trim() || null]
    );
    const subject = await queryClient<MatrixSubjectRow>(
      client,
      `SELECT ${SUBJECT_COLS}
       FROM matrix_subjects
       WHERE user_id = $1 AND kind = 'self'
       LIMIT 1`,
      [userId]
    );
    return subject.rows[0] ? mapSubject(subject.rows[0]) : null;
  });
}

export async function upsertMatrixSubject(input: {
  userId: string;
  kind: MatrixSubjectKind;
  displayName?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
}): Promise<MatrixSubject> {
  const birthDate = validateSubjectBirthDate(input.birthDate);
  if (!birthDate) throw subjectError("invalid_birth_date");

  const displayName = input.displayName?.trim() || null;
  const birthTime = input.birthTime?.trim() || null;
  const birthCity = input.birthCity?.trim() || null;

  if (input.kind === "self") {
    const existing = await query<MatrixSubjectRow>(
      `SELECT ${SUBJECT_COLS}
       FROM matrix_subjects
       WHERE user_id = $1 AND kind = 'self'
       LIMIT 1`,
      [input.userId]
    );
    if (!existing.rows[0]) {
      const self = await ensureSelfSubject(input.userId);
      if (!self) throw subjectError("self_requires_profile");
      return self;
    }

    return withTransaction(async (client) => {
      await queryClient(
        client,
        `UPDATE users SET birth_date = $2::date
         WHERE id = $1 AND birth_date IS DISTINCT FROM $2::date`,
        [input.userId, birthDate]
      );
      const { rows } = await queryClient<MatrixSubjectRow>(
        client,
        `UPDATE matrix_subjects
         SET display_name = $3,
             birth_date = $4::date,
             birth_time = $5::time,
             birth_city = $6,
             updated_at = NOW()
         WHERE user_id = $1 AND id = $2::uuid AND kind = 'self'
         RETURNING ${SUBJECT_COLS}`,
        [input.userId, existing.rows[0].id, displayName, birthDate, birthTime, birthCity]
      );
      if (!rows[0]) throw subjectError("self_exists");
      return mapSubject(rows[0]);
    });
  }

  return withTransaction(async (client) => {
    const count = await queryClient<{ count: string }>(
      client,
      `SELECT count(*)::text AS count FROM matrix_subjects WHERE user_id = $1`,
      [input.userId]
    );
    if (Number(count.rows[0]?.count ?? 0) >= PRICING.MATRIX_SUBJECT_LIMIT) {
      throw subjectError("subject_limit");
    }

    const { rows } = await queryClient<MatrixSubjectRow>(
      client,
      `INSERT INTO matrix_subjects (
         user_id, kind, display_name, birth_date, birth_time, birth_city
       ) VALUES ($1, $2, $3, $4::date, $5::time, $6)
       RETURNING ${SUBJECT_COLS}`,
      [input.userId, input.kind, displayName, birthDate, birthTime, birthCity]
    );
    return mapSubject(rows[0]);
  });
}

export async function deleteMatrixSubject(
  userId: string,
  subjectId: string
): Promise<{ deleted: boolean; deletedReports: number; sessionIds: string[] }> {
  return withTransaction(async (client) => {
    const subject = await queryClient<{ kind: MatrixSubjectKind }>(
      client,
      `SELECT kind FROM matrix_subjects
       WHERE user_id = $1 AND id = $2::uuid
       FOR UPDATE`,
      [userId, subjectId.trim()]
    );
    if (!subject.rows[0]) {
      return { deleted: false, deletedReports: 0, sessionIds: [] };
    }
    if (subject.rows[0].kind === "self") throw subjectError("self_immutable");

    const reports = await queryClient<{ session_id: string | null }>(
      client,
      `DELETE FROM numerology_report_history
       WHERE user_id = $1 AND subject_id = $2::uuid
       RETURNING session_id`,
      [userId, subjectId.trim()]
    );
    const removed = await queryClient(
      client,
      `DELETE FROM matrix_subjects WHERE user_id = $1 AND id = $2::uuid`,
      [userId, subjectId.trim()]
    );
    return {
      deleted: (removed.rowCount ?? 0) > 0,
      deletedReports: reports.rowCount ?? 0,
      sessionIds: [
        ...new Set(
          reports.rows
            .map((row) => row.session_id)
            .filter((id): id is string => Boolean(id?.trim()))
        ),
      ],
    };
  });
}
