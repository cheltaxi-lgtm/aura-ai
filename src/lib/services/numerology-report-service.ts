import { query, queryClient, withTransaction } from "@/lib/db";
import { parseBirthDate } from "@/lib/numerology/constants";
import { MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";

export const MATRIX_REPORT_TOOL_ID = "destiny_matrix" as const;

export type NumerologyReportHistoryItem = {
  id: string;
  toolId: string;
  subjectId: string | null;
  birthDate: string;
  calculationVersion: string;
  content: string;
  structuredData: Record<string, unknown> | null;
  runeCost: number | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NumerologyReportHistoryRow = {
  id: string;
  tool_id: string;
  subject_id: string | null;
  birth_date: Date | string;
  calculation_version: string;
  content: string;
  structured_data: Record<string, unknown> | null;
  rune_cost: number | null;
  session_id: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Normalize any accepted birth-date string to ISO `YYYY-MM-DD` for DATE columns. */
export function toIsoBirthDate(raw: string | null | undefined): string | null {
  const parsed = parseBirthDate(raw);
  if (!parsed) return null;
  const mm = String(parsed.month).padStart(2, "0");
  const dd = String(parsed.day).padStart(2, "0");
  return `${parsed.year}-${mm}-${dd}`;
}

function formatBirthDate(value: Date | string): string {
  if (typeof value === "string") {
    const iso = value.slice(0, 10);
    return toIsoBirthDate(iso) ?? iso;
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapRow(row: NumerologyReportHistoryRow): NumerologyReportHistoryItem {
  return {
    id: row.id,
    toolId: row.tool_id,
    subjectId: row.subject_id,
    birthDate: formatBirthDate(row.birth_date),
    calculationVersion: row.calculation_version,
    content: row.content,
    structuredData: row.structured_data,
    runeCost: row.rune_cost,
    sessionId: row.session_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

const SELECT_COLS = `
  id, tool_id, subject_id, birth_date, calculation_version, content, structured_data,
  rune_cost, session_id, created_at, updated_at
`;

export async function findOwnedMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<NumerologyReportHistoryItem | null> {
  const birthDate = toIsoBirthDate(birthDateRaw);
  if (!birthDate) return null;
  const toolId = options?.toolId ?? MATRIX_REPORT_TOOL_ID;
  const calculationVersion = options?.calculationVersion ?? MATRIX_CALCULATION_VERSION;

  const exact = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date
       AND calculation_version = $4
       AND length(trim(content)) > 0
     LIMIT 1`,
    [userId, toolId, birthDate, calculationVersion]
  );
  if (exact.rows[0]) return mapRow(exact.rows[0]);

  // Buy-once unlock survives calculation-version bumps: any non-empty saved row for this date.
  const anyVersion = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date
       AND length(trim(content)) > 0
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, toolId, birthDate]
  );
  return anyVersion.rows[0] ? mapRow(anyVersion.rows[0]) : null;
}

export async function findOwnedMatrixReportBySubject(
  userId: string,
  subjectId: string,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<NumerologyReportHistoryItem | null> {
  const toolId = options?.toolId ?? MATRIX_REPORT_TOOL_ID;
  const calculationVersion = options?.calculationVersion ?? MATRIX_CALCULATION_VERSION;
  const exact = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND subject_id = $3::uuid
       AND calculation_version = $4
       AND length(trim(content)) > 0
     LIMIT 1`,
    [userId, toolId, subjectId.trim(), calculationVersion]
  );
  if (exact.rows[0]) return mapRow(exact.rows[0]);

  const anyVersion = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND subject_id = $3::uuid
       AND length(trim(content)) > 0
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, toolId, subjectId.trim()]
  );
  return anyVersion.rows[0] ? mapRow(anyVersion.rows[0]) : null;
}

export type OwnedMatrixLookup = {
  report: NumerologyReportHistoryItem | null;
  /** Content passes client-safety + completeness gate (site/bot parity). */
  usable: boolean;
  /** Non-empty row exists but fails the usability gate (leak / truncated). */
  unusable: boolean;
};

/** Owned report + usability — mirror Telegram botMatrixService gates. */
export async function lookupOwnedMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<OwnedMatrixLookup> {
  const report = await findOwnedMatrixReport(userId, birthDateRaw, options);
  if (!report?.content?.trim()) {
    return { report: null, usable: false, unusable: false };
  }
  const { isUsableMatrixReading } = await import("@/lib/chat-reply-sanitize");
  const usable = isUsableMatrixReading(report.content);
  return { report, usable, unusable: !usable };
}

export async function lookupOwnedMatrixReportBySubject(
  userId: string,
  subjectId: string,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<OwnedMatrixLookup> {
  const report = await findOwnedMatrixReportBySubject(userId, subjectId, options);
  if (!report?.content?.trim()) {
    return { report: null, usable: false, unusable: false };
  }
  const { isUsableMatrixReading } = await import("@/lib/chat-reply-sanitize");
  const usable = isUsableMatrixReading(report.content);
  return { report, usable, unusable: !usable };
}

export async function findUsableOwnedMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<NumerologyReportHistoryItem | null> {
  const { report, usable } = await lookupOwnedMatrixReport(
    userId,
    birthDateRaw,
    options
  );
  return usable ? report : null;
}

export async function findUsableOwnedMatrixReportBySubject(
  userId: string,
  subjectId: string,
  options?: { calculationVersion?: string; toolId?: string }
): Promise<NumerologyReportHistoryItem | null> {
  const { report, usable } = await lookupOwnedMatrixReportBySubject(
    userId,
    subjectId,
    options
  );
  return usable ? report : null;
}

export async function userOwnsMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined
): Promise<boolean> {
  const owned = await findUsableOwnedMatrixReport(userId, birthDateRaw);
  return Boolean(owned);
}

/** List metadata without full LLM bodies (browser ownership / cabinet chips). */
export async function listUserMatrixReportSummaries(
  userId: string,
  limit = 20
): Promise<
  Array<{
    id: string;
    subjectId: string | null;
    subjectKind: string | null;
    subjectName: string | null;
    birthDate: string;
    calculationVersion: string;
    hasContent: boolean;
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const { rows } = await query<
    NumerologyReportHistoryRow & { subject_kind: string | null; subject_name: string | null }
  >(
    `SELECT n.id, n.tool_id, n.subject_id, n.birth_date, n.calculation_version,
            n.content, n.structured_data, n.rune_cost, n.session_id, n.created_at, n.updated_at,
            s.kind AS subject_kind, s.display_name AS subject_name
     FROM numerology_report_history n
     LEFT JOIN matrix_subjects s ON s.id = n.subject_id
     WHERE n.user_id = $1 AND n.tool_id = $2
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [userId, MATRIX_REPORT_TOOL_ID, safeLimit]
  );
  return rows.map((row) => {
    const report = mapRow(row);
    return {
      id: report.id,
      subjectId: report.subjectId,
      subjectKind: row.subject_kind,
      subjectName: row.subject_name,
      birthDate: report.birthDate,
      calculationVersion: report.calculationVersion,
      hasContent: Boolean(report.content?.trim()),
      sessionId: report.sessionId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  });
}

export type SaveMatrixReportResult =
  | { status: "saved"; report: NumerologyReportHistoryItem }
  | { status: "updated"; report: NumerologyReportHistoryItem }
  | { status: "already_saved"; report: NumerologyReportHistoryItem };

export async function saveMatrixReport(params: {
  userId: string;
  birthDateRaw: string;
  content: string;
  runeCost: number;
  chargeTransactionId?: string;
  sessionId?: string;
  structuredData?: Record<string, unknown> | null;
  calculationVersion?: string;
  toolId?: string;
  subjectId?: string;
  /** When true, replace existing row for this birth date/version (new order). */
  overwrite?: boolean;
}): Promise<SaveMatrixReportResult> {
  const birthDate = toIsoBirthDate(params.birthDateRaw);
  if (!birthDate) {
    throw new Error("invalid_birth_date_for_matrix_report");
  }
  const toolId = params.toolId ?? MATRIX_REPORT_TOOL_ID;
  const calculationVersion = params.calculationVersion ?? MATRIX_CALCULATION_VERSION;
  const content = params.content.trim();
  if (!content) {
    throw new Error("empty_matrix_report_content");
  }
  const overwrite = Boolean(params.overwrite);
  let subjectId = params.subjectId?.trim() || null;

  if (!subjectId) {
    const { ensureSelfSubject } = await import("@/lib/services/matrix-subject-service");
    const self = await ensureSelfSubject(params.userId);
    if (!self || self.birthDate !== birthDate) {
      throw new Error("matrix_subject_required");
    }
    subjectId = self.id;
  }

  return withTransaction(async (client) => {
    const ownedSubject = await queryClient<{ birth_date: Date | string }>(
      client,
      `SELECT birth_date FROM matrix_subjects
       WHERE id = $1::uuid AND user_id = $2
       LIMIT 1`,
      [subjectId, params.userId]
    );
    if (!ownedSubject.rows[0] || formatBirthDate(ownedSubject.rows[0].birth_date) !== birthDate) {
      throw new Error("invalid_matrix_subject");
    }

    if (overwrite) {
      // Wipe any prior destiny-matrix rows for this subject (all calculation versions).
      await queryClient(
        client,
        `DELETE FROM numerology_report_history
         WHERE user_id = $1
           AND tool_id = $2
           AND subject_id = $3::uuid`,
        [params.userId, toolId, subjectId]
      );
    }

    const conflictSql = overwrite
      ? `ON CONFLICT (user_id, tool_id, subject_id, calculation_version) DO UPDATE SET
           content = EXCLUDED.content,
           structured_data = EXCLUDED.structured_data,
           rune_cost = EXCLUDED.rune_cost,
           charge_transaction_id = EXCLUDED.charge_transaction_id,
           session_id = EXCLUDED.session_id,
           updated_at = NOW()`
      : `ON CONFLICT (user_id, tool_id, subject_id, calculation_version) DO NOTHING`;

    const inserted = await queryClient<NumerologyReportHistoryRow>(
      client,
      `INSERT INTO numerology_report_history (
         user_id, tool_id, subject_id, birth_date, calculation_version, content,
         structured_data, rune_cost, charge_transaction_id, session_id
       ) VALUES (
         $1, $2, $3::uuid, $4::date, $5, $6, $7::jsonb, $8, $9, $10
       )
       ${conflictSql}
       RETURNING ${SELECT_COLS}`,
      [
        params.userId,
        toolId,
        subjectId,
        birthDate,
        calculationVersion,
        content,
        params.structuredData ? JSON.stringify(params.structuredData) : null,
        params.runeCost,
        params.chargeTransactionId ?? null,
        params.sessionId ?? null,
      ]
    );

    if (overwrite && inserted.rows[0]) {
      return { status: "updated" as const, report: mapRow(inserted.rows[0]) };
    }

    const existing =
      inserted.rows[0] ??
      (
        await queryClient<NumerologyReportHistoryRow>(
          client,
          `SELECT ${SELECT_COLS}
           FROM numerology_report_history
           WHERE user_id = $1
             AND tool_id = $2
             AND subject_id = $3::uuid
             AND calculation_version = $4`,
          [params.userId, toolId, subjectId, calculationVersion]
        )
      ).rows[0];

    if (!existing) {
      throw new Error("numerology_report_history_missing_after_insert");
    }

    // Reopen / reuse: keep buy-once content but point at the active chat session.
    if (!inserted.rows[0] && params.sessionId?.trim()) {
      await queryClient(
        client,
        `UPDATE numerology_report_history
         SET session_id = $4::uuid,
             updated_at = NOW()
         WHERE user_id = $1
           AND tool_id = $2
           AND subject_id = $3::uuid
           AND calculation_version = $5
           AND (session_id IS DISTINCT FROM $4::uuid)`,
        [
          params.userId,
          toolId,
          subjectId,
          params.sessionId.trim(),
          calculationVersion,
        ]
      );
      existing.session_id = params.sessionId.trim();
    }

    return {
      status: inserted.rows[0] ? "saved" : "already_saved",
      report: mapRow(existing),
    };
  });
}

export async function listUserMatrixReports(
  userId: string,
  limit = 20
): Promise<NumerologyReportHistoryItem[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const { rows } = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, MATRIX_REPORT_TOOL_ID, safeLimit]
  );
  return rows.map(mapRow);
}

export async function getUserMatrixReportById(
  userId: string,
  reportId: string
): Promise<NumerologyReportHistoryItem | null> {
  const id = reportId.trim();
  if (!id) return null;
  const { rows } = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND id = $2::uuid
       AND tool_id IN ('destiny_matrix', 'child_matrix', 'matrix_year_forecast', 'matrix_compatibility')
     LIMIT 1`,
    [userId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Delete one owned matrix report (buy-once unlock reset for that birth date/version row). */
export async function deleteUserMatrixReport(
  userId: string,
  reportId: string
): Promise<{ deleted: boolean; sessionIds: string[] }> {
  const id = reportId.trim();
  if (!id) return { deleted: false, sessionIds: [] };

  const before = await query<{ session_id: string | null }>(
    `SELECT session_id
     FROM numerology_report_history
     WHERE user_id = $1
       AND id = $2::uuid
       AND tool_id = $3`,
    [userId, id, MATRIX_REPORT_TOOL_ID]
  );
  if (!before.rows[0]) return { deleted: false, sessionIds: [] };

  const { rowCount } = await query(
    `DELETE FROM numerology_report_history
     WHERE user_id = $1
       AND id = $2::uuid
       AND tool_id = $3`,
    [userId, id, MATRIX_REPORT_TOOL_ID]
  );
  const sessionIds = before.rows
    .map((r) => r.session_id)
    .filter((s): s is string => Boolean(s?.trim()));
  return { deleted: (rowCount ?? 0) > 0, sessionIds };
}

/**
 * Delete destiny-matrix reports for a birth date.
 * Multi-subject safe: without subjectId only touches the user's `self` subject
 * (plus legacy rows with null subject_id). Never wipes other people sharing a date.
 */
export async function deleteOwnedMatrixReportsForBirth(
  userId: string,
  birthDateRaw: string | null | undefined,
  options?: { toolId?: string; subjectId?: string | null }
): Promise<{ deleted: number; sessionIds: string[] }> {
  const birthDate = toIsoBirthDate(birthDateRaw);
  if (!birthDate) return { deleted: 0, sessionIds: [] };
  const toolId = options?.toolId ?? MATRIX_REPORT_TOOL_ID;
  const subjectId = options?.subjectId?.trim() || null;

  if (subjectId) {
    return deleteOwnedMatrixReportsForSubject(userId, subjectId, { toolId });
  }

  const before = await query<{ session_id: string | null }>(
    `SELECT n.session_id
     FROM numerology_report_history n
     LEFT JOIN matrix_subjects ms ON ms.id = n.subject_id
     WHERE n.user_id = $1
       AND n.tool_id = $2
       AND n.birth_date = $3::date
       AND (n.subject_id IS NULL OR ms.kind = 'self')`,
    [userId, toolId, birthDate]
  );
  const sessionIds = [
    ...new Set(
      before.rows
        .map((r) => r.session_id)
        .filter((s): s is string => Boolean(s?.trim()))
    ),
  ];

  const { rowCount } = await query(
    `DELETE FROM numerology_report_history n
     USING matrix_subjects ms
     WHERE n.user_id = $1
       AND n.tool_id = $2
       AND n.birth_date = $3::date
       AND n.subject_id = ms.id
       AND ms.kind = 'self'`,
    [userId, toolId, birthDate]
  );
  // Legacy rows without subject_id (pre-migration leftovers).
  const legacy = await query(
    `DELETE FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date
       AND subject_id IS NULL`,
    [userId, toolId, birthDate]
  );
  return {
    deleted: (rowCount ?? 0) + (legacy.rowCount ?? 0),
    sessionIds,
  };
}

export async function deleteOwnedMatrixReportsForSubject(
  userId: string,
  subjectId: string,
  options?: { toolId?: string }
): Promise<{ deleted: number; sessionIds: string[] }> {
  const toolId = options?.toolId ?? MATRIX_REPORT_TOOL_ID;
  const before = await query<{ session_id: string | null }>(
    `SELECT session_id
     FROM numerology_report_history
     WHERE user_id = $1 AND tool_id = $2 AND subject_id = $3::uuid`,
    [userId, toolId, subjectId.trim()]
  );
  const { rowCount } = await query(
    `DELETE FROM numerology_report_history
     WHERE user_id = $1 AND tool_id = $2 AND subject_id = $3::uuid`,
    [userId, toolId, subjectId.trim()]
  );
  return {
    deleted: rowCount ?? 0,
    sessionIds: [
      ...new Set(
        before.rows
          .map((row) => row.session_id)
          .filter((id): id is string => Boolean(id?.trim()))
      ),
    ],
  };
}
