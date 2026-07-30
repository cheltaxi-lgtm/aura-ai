import { query, queryClient, withTransaction } from "@/lib/db";
import { parseBirthDate } from "@/lib/numerology/constants";
import { MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";

export const MATRIX_REPORT_TOOL_ID = "destiny_matrix" as const;

export type NumerologyReportHistoryItem = {
  id: string;
  toolId: string;
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
  id, tool_id, birth_date, calculation_version, content, structured_data,
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

export async function userOwnsMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined
): Promise<boolean> {
  const owned = await findOwnedMatrixReport(userId, birthDateRaw);
  return Boolean(owned?.content?.trim());
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

  return withTransaction(async (client) => {
    if (overwrite) {
      // Wipe any prior destiny-matrix rows for this birth date (all calculation versions).
      await queryClient(
        client,
        `DELETE FROM numerology_report_history
         WHERE user_id = $1
           AND tool_id = $2
           AND birth_date = $3::date`,
        [params.userId, toolId, birthDate]
      );
    }

    const conflictSql = overwrite
      ? `ON CONFLICT (user_id, tool_id, birth_date, calculation_version) DO UPDATE SET
           content = EXCLUDED.content,
           structured_data = EXCLUDED.structured_data,
           rune_cost = EXCLUDED.rune_cost,
           charge_transaction_id = EXCLUDED.charge_transaction_id,
           session_id = EXCLUDED.session_id,
           updated_at = NOW()`
      : `ON CONFLICT (user_id, tool_id, birth_date, calculation_version) DO NOTHING`;

    const inserted = await queryClient<NumerologyReportHistoryRow>(
      client,
      `INSERT INTO numerology_report_history (
         user_id, tool_id, birth_date, calculation_version, content,
         structured_data, rune_cost, charge_transaction_id, session_id
       ) VALUES (
         $1, $2, $3::date, $4, $5, $6::jsonb, $7, $8, $9
       )
       ${conflictSql}
       RETURNING ${SELECT_COLS}`,
      [
        params.userId,
        toolId,
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
             AND birth_date = $3::date
             AND calculation_version = $4`,
          [params.userId, toolId, birthDate, calculationVersion]
        )
      ).rows[0];

    if (!existing) {
      throw new Error("numerology_report_history_missing_after_insert");
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
       AND tool_id = $3
     LIMIT 1`,
    [userId, id, MATRIX_REPORT_TOOL_ID]
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

/** Delete all destiny-matrix reports for a birth date (user-initiated reset). */
export async function deleteOwnedMatrixReportsForBirth(
  userId: string,
  birthDateRaw: string | null | undefined
): Promise<{ deleted: number; sessionIds: string[] }> {
  const birthDate = toIsoBirthDate(birthDateRaw);
  if (!birthDate) return { deleted: 0, sessionIds: [] };

  const before = await query<{ session_id: string | null }>(
    `SELECT session_id
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date`,
    [userId, MATRIX_REPORT_TOOL_ID, birthDate]
  );
  const sessionIds = [
    ...new Set(
      before.rows
        .map((r) => r.session_id)
        .filter((s): s is string => Boolean(s?.trim()))
    ),
  ];

  const { rowCount } = await query(
    `DELETE FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date`,
    [userId, MATRIX_REPORT_TOOL_ID, birthDate]
  );
  return { deleted: rowCount ?? 0, sessionIds };
}
