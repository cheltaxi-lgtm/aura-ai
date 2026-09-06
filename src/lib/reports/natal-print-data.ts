import { query } from "@/lib/db";

/** Match the historical report fingerprint and engine; never substitute the current profile chart. */
export async function getNatalPrintRecord(userId: string, id: string) {
  const { rows } = await query<{
    tradition: string; report_type: string; content: string; structured_data: Record<string, unknown> | null;
    evidence_refs: unknown; birth_fingerprint: string; engine_version: string; ephemeris: string; created_at: string;
    time_known: boolean | null; chart_data: { western?: Record<string, unknown> } | null;
  }>(
    `SELECT history.tradition, history.report_type, history.content, history.structured_data, history.evidence_refs,
            history.birth_fingerprint, history.engine_version, history.ephemeris, history.created_at,
            (charts.chart_data->>'timeKnown')::boolean AS time_known, charts.chart_data
     FROM natal_report_history history
     LEFT JOIN natal_charts charts ON charts.user_id = history.user_id AND charts.chart_data->>'birthFingerprint' = history.birth_fingerprint AND charts.engine_version = history.engine_version
     WHERE history.id = $1 AND history.user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows[0] ?? null;
}
