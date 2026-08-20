import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { matrixCalendarDate } from "@/lib/numerology/matrix-calendar";
import {
  isMatrixSubjectKind,
  validateSubjectBirthDate,
  type MatrixSubjectKind,
} from "@/lib/services/matrix-subject-service";
import { PRICING } from "@/lib/config/pricing";

export type PersistedMatrixSnapshot = {
  subjectId: string;
  birthDate: string;
  asOfDate: string;
  calculationVersion: string;
  snapshot: Record<string, unknown>;
};

function persistError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

export async function attachSnapshotToSubject(
  client: PoolClient,
  subjectId: string,
  snapshot: Record<string, unknown>,
  asOfDate: string,
  calculationVersion: string
): Promise<void> {
  await queryClient(
    client,
    `UPDATE matrix_subjects
     SET matrix_snapshot = $2::jsonb,
         as_of_date = $3::date,
         calculation_version = $4,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [subjectId, JSON.stringify(snapshot), asOfDate, calculationVersion]
  );
}

/**
 * Persist an immutable Matrix snapshot immediately after calc.
 * Does not write Natal/HD time/place onto the subject.
 * Does not erase users.birth_time / birth_city.
 * Does not overwrite users.birth_date when a different profile date already exists.
 */
export async function persistOwnedMatrixSnapshot(input: {
  userId: string;
  birthDate: string;
  displayName?: string | null;
  subjectKind?: MatrixSubjectKind | null;
  subjectId?: string | null;
  snapshot?: Record<string, unknown> | null;
  asOfDate?: string | null;
  calculationVersion?: string | null;
}): Promise<PersistedMatrixSnapshot> {
  const birthDate = validateSubjectBirthDate(input.birthDate);
  if (!birthDate) throw persistError("invalid_birth_date");
  const kind =
    input.subjectKind && isMatrixSubjectKind(input.subjectKind) ? input.subjectKind : "self";
  const displayName = input.displayName?.trim().slice(0, 80) || null;

  let snapshot = input.snapshot && typeof input.snapshot === "object" ? input.snapshot : null;
  let asOfDate =
    typeof input.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)
      ? input.asOfDate
      : null;
  let calculationVersion = input.calculationVersion?.trim() || null;

  if (!snapshot || !asOfDate) {
    asOfDate = matrixCalendarDate();
    const matrix = destinyMatrix(birthDate, { asOfDate });
    if (!matrix) throw persistError("invalid_birth_date");
    snapshot = matrixToStructuredData(matrix);
    calculationVersion = matrix.calculationVersion;
  }
  calculationVersion = calculationVersion || MATRIX_CALCULATION_VERSION;

  return withTransaction(async (client) => {
    if (kind === "self") {
      const profile = await queryClient<{ birth_date: string | null }>(
        client,
        `SELECT birth_date::text FROM users WHERE id = $1 FOR UPDATE`,
        [input.userId]
      );
      const existing = profile.rows[0]?.birth_date
        ? String(profile.rows[0].birth_date).slice(0, 10)
        : null;
      if (!existing) {
        await queryClient(
          client,
          `UPDATE users SET birth_date = $2::date WHERE id = $1 AND birth_date IS NULL`,
          [input.userId, birthDate]
        );
      }

      let subjectId = input.subjectId?.trim() || null;
      if (subjectId) {
        const owned = await queryClient<{ id: string }>(
          client,
          `SELECT id FROM matrix_subjects
           WHERE user_id = $1 AND id = $2::uuid AND kind = 'self'
           LIMIT 1`,
          [input.userId, subjectId]
        );
        if (!owned.rows[0]) throw persistError("matrix_subject_forbidden");
      } else {
        const found = await queryClient<{ id: string }>(
          client,
          `SELECT id FROM matrix_subjects WHERE user_id = $1 AND kind = 'self' LIMIT 1`,
          [input.userId]
        );
        if (found.rows[0]) {
          subjectId = found.rows[0].id;
        } else {
          const inserted = await queryClient<{ id: string }>(
            client,
            `INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
             VALUES ($1, 'self', $2, $3::date)
             RETURNING id`,
            [input.userId, displayName, birthDate]
          );
          subjectId = inserted.rows[0]?.id ?? null;
        }
      }
      if (!subjectId) throw persistError("SUBJECT_INSERT_FAILED");

      await queryClient(
        client,
        `UPDATE matrix_subjects
         SET birth_date = $3::date,
             display_name = COALESCE($4, display_name),
             matrix_snapshot = $5::jsonb,
             as_of_date = $6::date,
             calculation_version = $7,
             updated_at = NOW()
         WHERE user_id = $1 AND id = $2::uuid`,
        [
          input.userId,
          subjectId,
          birthDate,
          displayName,
          JSON.stringify(snapshot),
          asOfDate,
          calculationVersion,
        ]
      );
      return { subjectId, birthDate, asOfDate, calculationVersion, snapshot };
    }

    let subjectId = input.subjectId?.trim() || null;
    if (subjectId) {
      const owned = await queryClient<{ id: string }>(
        client,
        `SELECT id FROM matrix_subjects
         WHERE user_id = $1 AND id = $2::uuid AND kind = $3
         LIMIT 1`,
        [input.userId, subjectId, kind]
      );
      if (!owned.rows[0]) throw persistError("matrix_subject_forbidden");
    } else {
      const count = await queryClient<{ count: string }>(
        client,
        `SELECT count(*)::text AS count FROM matrix_subjects WHERE user_id = $1`,
        [input.userId]
      );
      if (Number(count.rows[0]?.count ?? 0) >= PRICING.MATRIX_SUBJECT_LIMIT) {
        throw persistError("subject_limit");
      }
      const inserted = await queryClient<{ id: string }>(
        client,
        `INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
         VALUES ($1, $2, $3, $4::date)
         RETURNING id`,
        [input.userId, kind, displayName, birthDate]
      );
      subjectId = inserted.rows[0]?.id ?? null;
    }
    if (!subjectId) throw persistError("SUBJECT_INSERT_FAILED");

    await queryClient(
      client,
      `UPDATE matrix_subjects
       SET birth_date = $3::date,
           display_name = COALESCE($4, display_name),
           matrix_snapshot = $5::jsonb,
           as_of_date = $6::date,
           calculation_version = $7,
           updated_at = NOW()
       WHERE user_id = $1 AND id = $2::uuid`,
      [
        input.userId,
        subjectId,
        birthDate,
        displayName,
        JSON.stringify(snapshot),
        asOfDate,
        calculationVersion,
      ]
    );
    return { subjectId, birthDate, asOfDate, calculationVersion, snapshot };
  });
}

export async function getOwnedMatrixSnapshot(
  userId: string,
  subjectId: string
): Promise<PersistedMatrixSnapshot | null> {
  if (!subjectId || !/^[0-9a-f-]{36}$/i.test(subjectId)) return null;
  const { rows } = await query<{
    id: string;
    birth_date: string;
    as_of_date: string | null;
    calculation_version: string | null;
    matrix_snapshot: Record<string, unknown> | null;
  }>(
    `SELECT id, birth_date::text, as_of_date::text, calculation_version, matrix_snapshot
     FROM matrix_subjects
     WHERE user_id = $1 AND id = $2::uuid
     LIMIT 1`,
    [userId, subjectId]
  );
  const row = rows[0];
  if (!row?.matrix_snapshot || !row.as_of_date) return null;
  return {
    subjectId: row.id,
    birthDate: String(row.birth_date).slice(0, 10),
    asOfDate: String(row.as_of_date).slice(0, 10),
    calculationVersion: row.calculation_version || MATRIX_CALCULATION_VERSION,
    snapshot: row.matrix_snapshot,
  };
}
