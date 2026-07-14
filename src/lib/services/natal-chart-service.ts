import { randomUUID } from "crypto";
import { query, queryClient, withTransaction } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { getSetting, isNatalChartEnabled } from "@/lib/settings";
import {
  computeNatalChartRecord,
  computeDeepTransits,
  buildBirthFingerprint,
  type NatalChartInput,
  type NatalChartRecord,
  type NatalTradition,
  NATAL_ENGINE_VERSION,
  normalizeVedicChart,
} from "@/lib/natal";
import { localDateStringInTimezone } from "@/lib/natal/time";

type NatalChartRow = {
  user_id: string;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tzid: string | null;
  birth_place_label: string | null;
  time_known: boolean;
  chart_data: NatalChartRecord | null;
  engine_version: string;
  computed_at: string | null;
};

function rowToRecord(row: NatalChartRow): NatalChartRecord | null {
  if (!row.chart_data || typeof row.chart_data !== "object") return null;
  const chart = row.chart_data;
  return {
    ...chart,
    vedic: chart.vedic
      ? normalizeVedicChart(chart.vedic, {
          timeKnown: chart.timeKnown,
          hasLocation: Boolean(chart.place),
        })
      : null,
  };
}

function fingerprintFromUser(user: {
  birth_date: string | Date;
  birth_time?: string | null;
  birth_city?: string | null;
}): string {
  return buildBirthFingerprint({
    birthDate: String(user.birth_date).slice(0, 10),
    birthTime: user.birth_time,
    birthCity: user.birth_city,
  });
}

export async function getStoredNatalChart(userId: string): Promise<NatalChartRecord | null> {
  const { rows } = await query<NatalChartRow>(
    `SELECT user_id, birth_lat, birth_lon, birth_tzid, birth_place_label, time_known,
            chart_data, engine_version, computed_at
     FROM natal_charts WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return rowToRecord(row);
}

export async function computeAndStoreNatalChart(userId: string): Promise<NatalChartRecord | null> {
  if (!(await isNatalChartEnabled())) return null;

  const user = await getUserById(userId);
  if (!user?.birth_date) return null;

  const birthDate = String(user.birth_date).slice(0, 10);

  const input: NatalChartInput = {
    birthDate,
    birthTime: user.birth_time,
    birthCity: user.birth_city,
    timeKnown: Boolean(user.birth_time?.trim()),
  };

  const record = await computeNatalChartRecord(userId, input);
  const houseSystem =
    record.western && typeof record.western.houseSystem === "string"
      ? record.western.houseSystem.toLowerCase()
      : "placidus";

  const stored = await query<{ chart_data: NatalChartRecord }>(
    `INSERT INTO natal_charts (
       user_id, birth_lat, birth_lon, birth_tzid, birth_place_label,
       time_known, house_system, chart_data, engine_version, computed_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       birth_lat = EXCLUDED.birth_lat,
       birth_lon = EXCLUDED.birth_lon,
       birth_tzid = EXCLUDED.birth_tzid,
       birth_place_label = EXCLUDED.birth_place_label,
       time_known = EXCLUDED.time_known,
       house_system = EXCLUDED.house_system,
       chart_data = CASE
         WHEN natal_charts.chart_data->>'birthFingerprint' =
                EXCLUDED.chart_data->>'birthFingerprint'
           AND natal_charts.engine_version = EXCLUDED.engine_version
           AND natal_charts.chart_data #>> '{western,ephemeris}'
                 IS NOT DISTINCT FROM EXCLUDED.chart_data #>> '{western,ephemeris}'
         THEN EXCLUDED.chart_data || jsonb_strip_nulls(jsonb_build_object(
           'interpretations', natal_charts.chart_data->'interpretations',
           'interpretation', natal_charts.chart_data->'interpretation',
           'interpretationClaims', natal_charts.chart_data->'interpretationClaims'
         ))
         ELSE EXCLUDED.chart_data
       END,
       engine_version = EXCLUDED.engine_version,
       computed_at = NOW(),
       updated_at = NOW()
     RETURNING chart_data`,
    [
      userId,
      record.place?.latitude ?? null,
      record.place?.longitude ?? null,
      record.place?.timezone ?? null,
      record.place?.label ?? null,
      record.timeKnown,
      houseSystem,
      JSON.stringify(record),
      NATAL_ENGINE_VERSION,
    ]
  );

  return stored.rows[0]?.chart_data ?? record;
}

export async function getOrComputeNatalChart(userId: string): Promise<NatalChartRecord | null> {
  if (!(await isNatalChartEnabled())) return null;

  const user = await getUserById(userId);
  if (!user?.birth_date) return null;

  const fingerprint = fingerprintFromUser(user);
  const stored = await getStoredNatalChart(userId);
  const settings = await getSetting("natalChart");
  const expectedEphemeris =
    settings.ephemeris === "natalengine" ? "natalengine" : "celestine";
  const storedEphemeris =
    stored?.western && typeof stored.western.ephemeris === "string"
      ? stored.western.ephemeris
      : null;

  const stale =
    !stored ||
    stored.engineVersion !== NATAL_ENGINE_VERSION ||
    stored.birthFingerprint !== fingerprint ||
    (stored.western !== null && storedEphemeris !== expectedEphemeris);

  if (stale) {
    return computeAndStoreNatalChart(userId);
  }

  if (stored.western && stored.place) {
    const today = localDateStringInTimezone(stored.place.timezone);
    if (stored.transitCacheDate === today && stored.transits) {
      return stored;
    }
    const transits = await computeDeepTransits({ ...stored, userId }, { correlateMemory: false });
    const refreshed = { ...stored, transits, transitCacheDate: today };
    await query(
      `UPDATE natal_charts
       SET chart_data = jsonb_set(
             jsonb_set(chart_data, '{transits}', $2::jsonb, true),
             '{transitCacheDate}', to_jsonb($3::text), true
           ),
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, JSON.stringify(transits), today]
    );
    return refreshed;
  }

  return stored;
}

export type NatalReportHistoryItem = {
  id: string;
  birthFingerprint: string;
  engineVersion: string;
  ephemeris: string;
  tradition: NatalTradition;
  reportType: string;
  content: string;
  structuredData: Record<string, unknown> | null;
  evidenceRefs: unknown[] | Record<string, unknown> | null;
  runeCost: number | null;
  chargeTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NatalReportHistoryRow = {
  id: string;
  birth_fingerprint: string;
  engine_version: string;
  ephemeris: string;
  tradition: NatalTradition;
  report_type: string;
  content: string;
  structured_data: Record<string, unknown> | null;
  evidence_refs: unknown[] | Record<string, unknown> | null;
  rune_cost: number | null;
  charge_transaction_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapNatalReportHistoryRow(row: NatalReportHistoryRow): NatalReportHistoryItem {
  return {
    id: row.id,
    birthFingerprint: row.birth_fingerprint,
    engineVersion: row.engine_version,
    ephemeris: row.ephemeris,
    tradition: row.tradition,
    reportType: row.report_type,
    content: row.content,
    structuredData: row.structured_data,
    evidenceRefs: row.evidence_refs,
    runeCost: row.rune_cost,
    chargeTransactionId: row.charge_transaction_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listCurrentUserNatalReportHistory(
  userId: string,
  limit = 50
): Promise<NatalReportHistoryItem[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 100)
    : 50;
  const { rows } = await query<NatalReportHistoryRow>(
    `SELECT id, birth_fingerprint, engine_version, ephemeris, tradition,
            report_type, content, structured_data, evidence_refs, rune_cost,
            charge_transaction_id, created_at, updated_at
     FROM natal_report_history
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  return rows.map(mapNatalReportHistoryRow);
}

export type SaveNatalInterpretationResult =
  | { status: "saved"; report: NatalReportHistoryItem }
  | { status: "already_saved"; report: NatalReportHistoryItem }
  | { status: "stale" };

/**
 * Persists the current interpretation and its immutable paid-report version in
 * one transaction. The chart row is locked and must still be owned by the
 * caller's claim, so recomputes and expired-claim takeovers cannot save stale
 * generated text.
 */
export async function saveCurrentNatalInterpretation(params: {
  userId: string;
  tradition: NatalTradition;
  interpretation: string;
  expectedBirthFingerprint: string;
  expectedEngineVersion: string;
  expectedEphemeris: string;
  claimToken: string;
  runeCost: number;
  chargeTransactionId?: string;
  structuredData?: Record<string, unknown> | null;
  evidenceRefs?: unknown[] | Record<string, unknown> | null;
}): Promise<SaveNatalInterpretationResult> {
  return withTransaction(async (client) => {
    const locked = await queryClient<{ user_id: string }>(
      client,
      `SELECT user_id
       FROM natal_charts
       WHERE user_id = $1
         AND chart_data->>'birthFingerprint' = $3
         AND engine_version = $4
         AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $5
         AND chart_data #>> ARRAY['interpretationClaims', $2::text, 'token'] = $6
       FOR UPDATE`,
      [
        params.userId,
        params.tradition,
        params.expectedBirthFingerprint,
        params.expectedEngineVersion,
        params.expectedEphemeris,
        params.claimToken,
      ]
    );
    if (!locked.rows[0]) return { status: "stale" };

    const values = [
      params.userId,
      params.expectedBirthFingerprint,
      params.expectedEngineVersion,
      params.expectedEphemeris,
      params.tradition,
      params.interpretation,
      params.structuredData ? JSON.stringify(params.structuredData) : null,
      params.evidenceRefs ? JSON.stringify(params.evidenceRefs) : null,
      params.runeCost,
      params.chargeTransactionId ?? null,
      params.claimToken,
    ];
    const inserted = await queryClient<NatalReportHistoryRow>(
      client,
      `INSERT INTO natal_report_history (
         user_id, birth_fingerprint, engine_version, ephemeris, tradition,
         report_type, content, structured_data, evidence_refs, rune_cost,
         charge_transaction_id, claim_token
       ) VALUES (
         $1, $2, $3, $4, $5, 'interpretation', $6, $7::jsonb, $8::jsonb, $9, $10, $11
       )
       ON CONFLICT (
         user_id, birth_fingerprint, engine_version, ephemeris, tradition, report_type
       ) DO NOTHING
       RETURNING id, birth_fingerprint, engine_version, ephemeris, tradition,
                 report_type, content, structured_data, evidence_refs, rune_cost,
                 charge_transaction_id, created_at, updated_at`,
      values
    );

    const existing =
      inserted.rows[0] ??
      (
        await queryClient<NatalReportHistoryRow>(
          client,
          `SELECT id, birth_fingerprint, engine_version, ephemeris, tradition,
                  report_type, content, structured_data, evidence_refs, rune_cost,
                  charge_transaction_id, created_at, updated_at
           FROM natal_report_history
           WHERE user_id = $1
             AND birth_fingerprint = $2
             AND engine_version = $3
             AND ephemeris = $4
             AND tradition = $5
             AND report_type = 'interpretation'`,
          values.slice(0, 5)
        )
      ).rows[0];
    if (!existing) throw new Error("natal_report_history_missing_after_insert");

    const saved = await queryClient(
      client,
      `UPDATE natal_charts
       SET chart_data = (
             chart_data || jsonb_build_object(
               'interpretations',
               COALESCE(chart_data->'interpretations', '{}'::jsonb) ||
                 jsonb_build_object($2::text, $3::text)
             )
           ) || jsonb_build_object(
             'interpretationClaims',
             COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text
           ),
           updated_at = NOW()
       WHERE user_id = $1
         AND chart_data->>'birthFingerprint' = $4
         AND engine_version = $5
         AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $6
         AND chart_data #>> ARRAY['interpretationClaims', $2::text, 'token'] = $7`,
      [
        params.userId,
        params.tradition,
        existing.content,
        params.expectedBirthFingerprint,
        params.expectedEngineVersion,
        params.expectedEphemeris,
        params.claimToken,
      ]
    );
    if (saved.rowCount !== 1) throw new Error("natal_chart_claim_lost_during_save");

    return {
      status: inserted.rows[0] ? "saved" : "already_saved",
      report: mapNatalReportHistoryRow(existing),
    };
  });
}

export type NatalInterpretationClaimResult =
  | { status: "claimed"; token: string }
  | {
      status: "cached";
      interpretation: string;
      structuredData?: Record<string, unknown> | null;
      evidenceRefs?: unknown[] | Record<string, unknown> | null;
    }
  | { status: "busy" }
  | { status: "unavailable" };

/**
 * Atomically reserves generation for one user/tradition. Claims carry only an
 * opaque token and timestamp, and stale reservations can be replaced.
 */
export async function claimNatalInterpretation(
  userId: string,
  tradition: NatalTradition,
  expectedBirthFingerprint: string,
  expectedEngineVersion: string,
  expectedEphemeris: string
): Promise<NatalInterpretationClaimResult> {
  const token = randomUUID();
  const claimed = await query<{ chart_data: NatalChartRecord }>(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) ||
             jsonb_build_object(
               $2::text,
               jsonb_build_object(
                 'token', $6::text,
                 'claimedAtEpoch', EXTRACT(EPOCH FROM NOW())
               )
             ),
           true
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND chart_data->>'birthFingerprint' = $3
       AND engine_version = $4
       AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $5
       AND NULLIF(chart_data->'interpretations'->>$2, '') IS NULL
       AND ($2 <> 'western' OR NULLIF(chart_data->>'interpretation', '') IS NULL)
       AND NOT EXISTS (
         SELECT 1
         FROM natal_report_history history
         WHERE history.user_id = natal_charts.user_id
           AND history.birth_fingerprint = $3
           AND history.engine_version = $4
           AND history.ephemeris = $5
           AND history.tradition = $2
           AND history.report_type = 'interpretation'
       )
       AND (
         chart_data #> ARRAY['interpretationClaims', $2::text] IS NULL
         OR CASE
              WHEN chart_data #>> ARRAY['interpretationClaims', $2::text, 'claimedAtEpoch']
                     ~ '^[0-9]+([.][0-9]+)?$'
              THEN (chart_data #>> ARRAY[
                'interpretationClaims', $2::text, 'claimedAtEpoch'
              ])::numeric
              ELSE 0
            END < EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')
       )
     RETURNING chart_data`,
    [
      userId,
      tradition,
      expectedBirthFingerprint,
      expectedEngineVersion,
      expectedEphemeris,
      token,
    ]
  );
  if (claimed.rowCount === 1) return { status: "claimed", token };

  const current = await query<{
    chart_data: NatalChartRecord | null;
    report_content: string | null;
    report_structured_data: Record<string, unknown> | null;
    report_evidence_refs: unknown[] | Record<string, unknown> | null;
  }>(
    `SELECT chart.chart_data, history.content AS report_content,
            history.structured_data AS report_structured_data,
            history.evidence_refs AS report_evidence_refs
     FROM natal_charts chart
     LEFT JOIN natal_report_history history
       ON history.user_id = chart.user_id
      AND history.birth_fingerprint = $3
      AND history.engine_version = $4
      AND history.ephemeris = $5
      AND history.tradition = $2
      AND history.report_type = 'interpretation'
     WHERE chart.user_id = $1`,
    [userId, tradition, expectedBirthFingerprint, expectedEngineVersion, expectedEphemeris]
  );
  const currentRow = current.rows[0];
  const chart = currentRow?.chart_data;
  const currentEphemeris =
    chart?.western && typeof chart.western.ephemeris === "string"
      ? chart.western.ephemeris
      : "unknown";
  if (
    !chart ||
    chart.birthFingerprint !== expectedBirthFingerprint ||
    chart.engineVersion !== expectedEngineVersion ||
    currentEphemeris !== expectedEphemeris
  ) {
    return { status: "unavailable" };
  }
  const cached =
    chart.interpretations?.[tradition] ??
    (tradition === "western" ? chart.interpretation : undefined) ??
    currentRow.report_content;
  if (cached?.trim()) {
    return {
      status: "cached",
      interpretation: cached,
      structuredData: currentRow.report_structured_data,
      evidenceRefs: currentRow.report_evidence_refs,
    };
  }
  return { status: "busy" };
}

export async function releaseNatalInterpretationClaim(
  userId: string,
  tradition: NatalTradition,
  claimToken: string
): Promise<void> {
  await query(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text,
           true
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND chart_data #>> ARRAY['interpretationClaims', $2::text, 'token'] = $3`,
    [userId, tradition, claimToken]
  );
}

/** Fire-and-forget safe wrapper for onboarding/profile updates. */
export function scheduleNatalChartCompute(userId: string): void {
  void computeAndStoreNatalChart(userId).catch((error) => {
    void error;
    console.warn("[natal-chart] scheduled compute failed");
  });
}
