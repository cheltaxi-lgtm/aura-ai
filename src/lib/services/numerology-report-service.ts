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

  const { rows } = await query<NumerologyReportHistoryRow>(
    `SELECT ${SELECT_COLS}
     FROM numerology_report_history
     WHERE user_id = $1
       AND tool_id = $2
       AND birth_date = $3::date
       AND calculation_version = $4
     LIMIT 1`,
    [userId, toolId, birthDate, calculationVersion]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function userOwnsMatrixReport(
  userId: string,
  birthDateRaw: string | null | undefined
): Promise<boolean> {
  const owned = await findOwnedMatrixReport(userId, birthDateRaw);
  return Boolean(owned);
}

export type SaveMatrixReportResult =
  | { status: "saved"; report: NumerologyReportHistoryItem }
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

  return withTransaction(async (client) => {
    const inserted = await queryClient<NumerologyReportHistoryRow>(
      client,
      `INSERT INTO numerology_report_history (
         user_id, tool_id, birth_date, calculation_version, content,
         structured_data, rune_cost, charge_transaction_id, session_id
       ) VALUES (
         $1, $2, $3::date, $4, $5, $6::jsonb, $7, $8, $9
       )
       ON CONFLICT (user_id, tool_id, birth_date, calculation_version) DO NOTHING
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
