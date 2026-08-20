import { query } from "@/lib/db";
import { getMatrixPairGuestPendingMeta } from "@/lib/services/matrix-pair-guest-service";
import {
  listUserMatrixCompatibilityReports,
  toIsoBirthDate,
  type NumerologyReportHistoryItem,
} from "@/lib/services/numerology-report-service";

const PENDING_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MatrixPairIdentity = {
  dateA: string;
  dateB: string;
};

export type MatrixPairOwnershipReport = {
  birthDate: string;
  partnerDate: string | null;
};

/** Partner date from stored pair-report metadata. Roles stay A=self, B=partner. */
export function partnerDateFromPairStructuredData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  const params =
    data.numerologToolParams && typeof data.numerologToolParams === "object"
      ? (data.numerologToolParams as Record<string, unknown>)
      : null;
  const raw =
    (typeof data.partnerDate === "string" && data.partnerDate) ||
    (typeof data.dateB === "string" && data.dateB) ||
    (typeof params?.partnerDate === "string" && params.partnerDate) ||
    null;
  return toIsoBirthDate(raw);
}

export function matrixPairReportOwnsCurrentPair(
  reports: MatrixPairOwnershipReport[],
  pair: MatrixPairIdentity
): boolean {
  const dateA = toIsoBirthDate(pair.dateA);
  const dateB = toIsoBirthDate(pair.dateB);
  if (!dateA || !dateB) return false;
  return reports.some(
    (report) =>
      toIsoBirthDate(report.birthDate) === dateA && report.partnerDate === dateB
  );
}

export function matrixPairHistoryOwnsCurrentPair(
  entries: Array<{ birthDate?: unknown; partnerDate?: unknown }>,
  pair: MatrixPairIdentity
): boolean {
  const dateA = toIsoBirthDate(pair.dateA);
  const dateB = toIsoBirthDate(pair.dateB);
  if (!dateA || !dateB) return false;
  return entries.some(
    (entry) =>
      toIsoBirthDate(typeof entry.birthDate === "string" ? entry.birthDate : null) ===
        dateA &&
      toIsoBirthDate(typeof entry.partnerDate === "string" ? entry.partnerDate : null) ===
        dateB
  );
}

async function partnerDateFromSession(
  userId: string,
  sessionId: string | null
): Promise<string | null> {
  if (!sessionId || !PENDING_ID_RE.test(sessionId)) return null;
  const { rows } = await query<{ numerolog_tool_params: Record<string, unknown> | null }>(
    `SELECT numerolog_tool_params
     FROM sessions
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [sessionId, userId]
  );
  const params = rows[0]?.numerolog_tool_params;
  return toIsoBirthDate(
    typeof params?.partnerDate === "string" ? params.partnerDate : null
  );
}

async function reportsWithPartnerDates(
  userId: string
): Promise<Array<{ report: NumerologyReportHistoryItem; partnerDate: string | null }>> {
  const reports = await listUserMatrixCompatibilityReports(userId, 50);
  const out: Array<{ report: NumerologyReportHistoryItem; partnerDate: string | null }> = [];
  for (const report of reports) {
    const fromStructured = partnerDateFromPairStructuredData(report.structuredData);
    const partnerDate =
      fromStructured ?? (await partnerDateFromSession(userId, report.sessionId));
    out.push({ report, partnerDate });
  }
  return out;
}

/** Exact current pair only — never the latest compatibility row for the subject. */
export async function findOwnedExactMatrixPairReport(opts: {
  userId: string;
  dateA: string;
  dateB: string;
}): Promise<NumerologyReportHistoryItem | null> {
  const dateA = toIsoBirthDate(opts.dateA);
  const dateB = toIsoBirthDate(opts.dateB);
  if (!dateA || !dateB) return null;
  const rows = await reportsWithPartnerDates(opts.userId);
  const hit = rows.find(
    (row) => toIsoBirthDate(row.report.birthDate) === dateA && row.partnerDate === dateB
  );
  return hit?.report ?? null;
}

async function userHasExactMatrixPairReport(
  userId: string,
  pair: MatrixPairIdentity
): Promise<boolean> {
  const withPartner = (await reportsWithPartnerDates(userId)).map((row) => ({
    birthDate: row.report.birthDate,
    partnerDate: row.partnerDate,
  }));
  if (matrixPairReportOwnsCurrentPair(withPartner, pair)) return true;

  const { rows } = await query<{
    birth_date: string | null;
    partner_date: string | null;
  }>(
    `SELECT context_data->>'birthDate' AS birth_date,
            context_data->'numerologToolParams'->>'partnerDate' AS partner_date
     FROM history
     WHERE user_id = $1
       AND is_paid = true
       AND context_data->>'numerologToolId' = 'matrix_compatibility'
       AND NULLIF(BTRIM(COALESCE(context_data->>'reading', '')), '') IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return matrixPairHistoryOwnsCurrentPair(
    rows.map((row) => ({ birthDate: row.birth_date, partnerDate: row.partner_date })),
    pair
  );
}

/** Server-only exact-pair ownership. Returns boolean only. */
export async function hasOwnedMatrixPairForPending(opts: {
  userId: string;
  pendingId: string;
}): Promise<boolean> {
  const pendingId = opts.pendingId.trim();
  if (!opts.userId || !PENDING_ID_RE.test(pendingId)) return false;

  const pending = await getMatrixPairGuestPendingMeta(pendingId);
  if (!pending) return false;
  if (pending.claimedUserId && pending.claimedUserId !== opts.userId) return false;

  return userHasExactMatrixPairReport(opts.userId, {
    dateA: pending.dateA,
    dateB: pending.dateB,
  });
}
