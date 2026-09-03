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
import { birthFingerprintsMatch } from "@/lib/natal/types";

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

export async function isStoredNatalChartStale(
  stored: NatalChartRecord,
  user: {
    birth_date: string | Date;
    birth_time?: string | null;
    birth_city?: string | null;
  }
): Promise<boolean> {
  const fingerprint = fingerprintFromUser(user);
  const settings = await getSetting("natalChart");
  const expectedEphemeris =
    settings.ephemeris === "natalengine" ? "natalengine" : "celestine";
  const storedEphemeris =
    stored.western && typeof stored.western.ephemeris === "string"
      ? stored.western.ephemeris
      : null;
  return (
    stored.engineVersion !== NATAL_ENGINE_VERSION ||
    !birthFingerprintsMatch(stored.birthFingerprint, fingerprint) ||
    (stored.western !== null && storedEphemeris !== expectedEphemeris)
  );
}

export async function getNatalChartClientView(userId: string): Promise<{
  chart: NatalChartRecord | null;
  needsRebuild: boolean;
  canCompute: boolean;
}> {
  const user = await getUserById(userId);
  const canCompute = Boolean(user?.birth_date);
  const chart = await getStoredNatalChart(userId);
  if (!chart) {
    return { chart: null, needsRebuild: false, canCompute };
  }
  if (!user?.birth_date) {
    return { chart, needsRebuild: true, canCompute: false };
  }
  const needsRebuild = await isStoredNatalChartStale(chart, {
    birth_date: user.birth_date,
    birth_time: user.birth_time,
    birth_city: user.birth_city,
  });
  return { chart, needsRebuild, canCompute };
}

export async function deleteStoredNatalChart(userId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query(`DELETE FROM natal_timing_cache WHERE user_id = $1`, [userId]);
    const result = await client.query(`DELETE FROM natal_charts WHERE user_id = $1`, [userId]);
    return (result.rowCount ?? 0) > 0;
  });
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

  const fingerprint = fingerprintFromUser({
    birth_date: user.birth_date,
    birth_time: user.birth_time,
    birth_city: user.birth_city,
  });
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
    !birthFingerprintsMatch(stored.birthFingerprint, fingerprint) ||
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
            created_at, updated_at
     FROM natal_report_history
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  return rows.map(mapNatalReportHistoryRow);
}

export async function userHasNatalInterpretationForChart(
  userId: string,
  chart: { birthFingerprint: string; engineVersion: string }
): Promise<boolean> {
  const birthFingerprint = chart.birthFingerprint.trim();
  const engineVersion = chart.engineVersion.trim();
  if (!userId || !birthFingerprint || !engineVersion) return false;

  const { rows } = await query<{ owned: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM natal_report_history
       WHERE user_id = $1
         AND birth_fingerprint = $2
         AND engine_version = $3
         AND report_type = 'interpretation'
         AND NULLIF(BTRIM(content), '') IS NOT NULL
     ) AS owned`,
    [userId, birthFingerprint, engineVersion]
  );
  return rows[0]?.owned === true;
}

export async function deleteCurrentUserNatalReport(
  userId: string,
  reportId: string
): Promise<NatalReportHistoryItem | null> {
  return withTransaction(async (client) => {
    const selected = await queryClient<NatalReportHistoryRow>(
      client,
      `SELECT id, birth_fingerprint, engine_version, ephemeris, tradition,
              report_type, content, structured_data, evidence_refs, rune_cost,
              created_at, updated_at
       FROM natal_report_history
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [reportId, userId]
    );
    const report = selected.rows[0];
    if (!report) return null;

    await queryClient(
      client,
      `UPDATE private_report_shares
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE owner_user_id = $1 AND report_kind = 'natal' AND report_id = $2`,
      [userId, reportId]
    );

    await queryClient(
      client,
      `DELETE FROM natal_report_history WHERE id = $1 AND user_id = $2`,
      [reportId, userId]
    );

    if (report.report_type === "interpretation") {
      await queryClient(
        client,
        `UPDATE natal_charts
         SET chart_data = jsonb_set(
               jsonb_set(
                 CASE WHEN $2 = 'western' THEN chart_data - 'interpretation' ELSE chart_data END,
                 '{interpretations}',
                 COALESCE(chart_data->'interpretations', '{}'::jsonb) - $2::text,
                 true
               ),
               '{interpretationClaims}',
               COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text,
               true
             ),
             updated_at = NOW()
         WHERE user_id = $1
           AND chart_data->>'birthFingerprint' = $3
           AND engine_version = $4
           AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $5`,
        [
          userId,
          report.tradition,
          report.birth_fingerprint,
          report.engine_version,
          report.ephemeris,
        ]
      );
    }

    return mapNatalReportHistoryRow(report);
  });
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
  reportType?: string;
  claimKey?: string;
}): Promise<SaveNatalInterpretationResult> {
  return withTransaction(async (client) => {
    const reportType = params.reportType ?? "interpretation";
    const claimKey = params.claimKey ?? params.tradition;
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
        claimKey,
        params.expectedBirthFingerprint,
        params.expectedEngineVersion,
        params.expectedEphemeris,
        params.claimToken,
      ]
    );
    if (!locked.rows[0]) return { status: "stale" };

    const inserted = await queryClient<NatalReportHistoryRow>(
      client,
      `INSERT INTO natal_report_history (
         user_id, birth_fingerprint, engine_version, ephemeris, tradition,
         report_type, content, structured_data, evidence_refs, rune_cost,
         charge_transaction_id, claim_token
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12
       )
       ON CONFLICT (
         user_id, birth_fingerprint, engine_version, ephemeris, tradition, report_type
       ) DO NOTHING
       RETURNING id, birth_fingerprint, engine_version, ephemeris, tradition,
                 report_type, content, structured_data, evidence_refs, rune_cost,
                 created_at, updated_at`,
      [
        params.userId,
        params.expectedBirthFingerprint,
        params.expectedEngineVersion,
        params.expectedEphemeris,
        params.tradition,
        reportType,
        params.interpretation,
        params.structuredData ? JSON.stringify(params.structuredData) : null,
        params.evidenceRefs ? JSON.stringify(params.evidenceRefs) : null,
        params.runeCost,
        params.chargeTransactionId ?? null,
        params.claimToken,
      ]
    );

    const existing =
      inserted.rows[0] ??
      (
        await queryClient<NatalReportHistoryRow>(
          client,
          `SELECT id, birth_fingerprint, engine_version, ephemeris, tradition,
                  report_type, content, structured_data, evidence_refs, rune_cost,
                  created_at, updated_at
           FROM natal_report_history
           WHERE user_id = $1
             AND birth_fingerprint = $2
             AND engine_version = $3
             AND ephemeris = $4
             AND tradition = $5
             AND report_type = $6`,
          [
            params.userId,
            params.expectedBirthFingerprint,
            params.expectedEngineVersion,
            params.expectedEphemeris,
            params.tradition,
            reportType,
          ]
        )
      ).rows[0];
    if (!existing) throw new Error("natal_report_history_missing_after_insert");

    const saved = reportType === "interpretation"
      ? await queryClient(
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
                 COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $4::text
               ),
               updated_at = NOW()
           WHERE user_id = $1
             AND chart_data->>'birthFingerprint' = $5
             AND engine_version = $6
             AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $7
             AND chart_data #>> ARRAY['interpretationClaims', $4::text, 'token'] = $8`,
          [
            params.userId,
            params.tradition,
            existing.content,
            claimKey,
            params.expectedBirthFingerprint,
            params.expectedEngineVersion,
            params.expectedEphemeris,
            params.claimToken,
          ]
        )
      : await queryClient(
          client,
          `UPDATE natal_charts
           SET chart_data = jsonb_set(
                 chart_data,
                 '{interpretationClaims}',
                 COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text,
                 true
               ),
               updated_at = NOW()
           WHERE user_id = $1
             AND chart_data->>'birthFingerprint' = $3
             AND engine_version = $4
             AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $5
             AND chart_data #>> ARRAY['interpretationClaims', $2::text, 'token'] = $6`,
          [
            params.userId,
            claimKey,
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
      reportId?: string;
      structuredData?: Record<string, unknown> | null;
      evidenceRefs?: unknown[] | Record<string, unknown> | null;
    }
  | { status: "busy" }
  | { status: "unavailable" };

/**
 * Removes empty paid-report placeholders and expired in-flight claims so OAuth /
 * partial-profile users can retry generation after a failed attempt.
 */
/**
 * Force-regenerate: drop the paid report in both storage places claim reads —
 * natal_report_history and natal_charts.chart_data (interpretations + claims).
 * Without this, forceRegenerate is a no-op when chart_data still holds text.
 */
export async function invalidateNatalReportForRegenerate(params: {
  userId: string;
  tradition: NatalTradition;
  reportType?: string;
  claimKey?: string;
}): Promise<void> {
  const reportType = params.reportType ?? "interpretation";
  const claimKey = params.claimKey ?? params.tradition;
  const isInterpretation = reportType === "interpretation";

  await query(
    `DELETE FROM natal_report_history
     WHERE user_id = $1
       AND tradition = $2
       AND report_type = $3`,
    [params.userId, params.tradition, reportType]
  );

  if (isInterpretation) {
    await query(
      `UPDATE natal_charts
       SET chart_data = jsonb_set(
             jsonb_set(
               CASE WHEN $2 = 'western' THEN chart_data - 'interpretation' ELSE chart_data END,
               '{interpretations}',
               COALESCE(chart_data->'interpretations', '{}'::jsonb) - $2::text,
               true
             ),
             '{interpretationClaims}',
             COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $3::text,
             true
           ),
           updated_at = NOW()
       WHERE user_id = $1`,
      [params.userId, params.tradition, claimKey]
    );
    return;
  }

  await query(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text,
           true
         ),
         updated_at = NOW()
     WHERE user_id = $1`,
    [params.userId, claimKey]
  );
}

export async function clearStaleNatalInterpretationBlocks(
  userId: string,
  tradition: NatalTradition,
  expectedBirthFingerprint: string,
  expectedEngineVersion: string,
  expectedEphemeris: string,
  options?: { reportType?: string; claimKey?: string }
): Promise<void> {
  const reportType = options?.reportType ?? "interpretation";
  const claimKey = options?.claimKey ?? tradition;

  await query(
    `DELETE FROM natal_report_history
     WHERE user_id = $1
       AND birth_fingerprint = $2
       AND engine_version = $3
       AND ephemeris = $4
       AND tradition = $5
       AND report_type = $6
       AND NULLIF(BTRIM(content), '') IS NULL`,
    [userId, expectedBirthFingerprint, expectedEngineVersion, expectedEphemeris, tradition, reportType]
  );

  await query(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           (
             SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
             FROM jsonb_each(COALESCE(chart_data->'interpretationClaims', '{}'::jsonb)) AS claims(key, value)
             WHERE key <> $5::text
                OR CASE
                     WHEN value #>> '{claimedAtEpoch}' ~ '^[0-9]+([.][0-9]+)?$'
                     THEN (value #>> '{claimedAtEpoch}')::numeric
                     ELSE 0
                   END < EXTRACT(EPOCH FROM NOW() - INTERVAL '10 minutes')
           ),
           true
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND chart_data->>'birthFingerprint' = $2
       AND engine_version = $3
       AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $4`,
    [userId, expectedBirthFingerprint, expectedEngineVersion, expectedEphemeris, claimKey]
  );
}

async function forceClearNatalInterpretationClaimKey(
  userId: string,
  expectedBirthFingerprint: string,
  expectedEngineVersion: string,
  expectedEphemeris: string,
  claimKey: string
): Promise<void> {
  await query(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $5::text,
           true
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND chart_data->>'birthFingerprint' = $2
       AND engine_version = $3
       AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $4`,
    [userId, expectedBirthFingerprint, expectedEngineVersion, expectedEphemeris, claimKey]
  );
}

export async function claimNatalInterpretationResilient(
  userId: string,
  tradition: NatalTradition,
  expectedBirthFingerprint: string,
  expectedEngineVersion: string,
  expectedEphemeris: string,
  options?: { reportType?: string; claimKey?: string }
): Promise<NatalInterpretationClaimResult> {
  const claimKey = options?.claimKey ?? tradition;
  await clearStaleNatalInterpretationBlocks(
    userId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris,
    options
  );
  const first = await claimNatalInterpretation(
    userId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris,
    options
  ).catch(() => ({ status: "busy" } as const));
  if (first.status !== "busy") return first;

  await clearStaleNatalInterpretationBlocks(
    userId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris,
    options
  );
  const second = await claimNatalInterpretation(
    userId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris,
    options
  ).catch(() => ({ status: "busy" } as const));
  if (second.status !== "busy") return second;

  // An active claim must never be stolen: the original request may already
  // have charged runes and be about to persist its report. Stale claims are
  // reclaimed by clearStaleNatalInterpretationBlocks above (10 minute TTL).
  return second;
}

/**
 * Atomically reserves generation for one user/tradition. Claims carry only an
 * opaque token and timestamp, and stale reservations can be replaced.
 */
export async function claimNatalInterpretation(
  userId: string,
  tradition: NatalTradition,
  expectedBirthFingerprint: string,
  expectedEngineVersion: string,
  expectedEphemeris: string,
  options?: { reportType?: string; claimKey?: string }
): Promise<NatalInterpretationClaimResult> {
  const reportType = options?.reportType ?? "interpretation";
  const claimKey = options?.claimKey ?? tradition;
  const useInterpretationCache = reportType === "interpretation";
  const token = randomUUID();
  const claimed = await query<{ chart_data: NatalChartRecord }>(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(
           chart_data,
           '{interpretationClaims}',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) ||
             jsonb_build_object(
               $7::text,
               jsonb_build_object(
                 'token', $9::text,
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
       AND (
         NOT $8::boolean
         OR (
           NULLIF(chart_data->'interpretations'->>$2, '') IS NULL
           AND ($2 <> 'western' OR NULLIF(chart_data->>'interpretation', '') IS NULL)
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM natal_report_history history
         WHERE history.user_id = natal_charts.user_id
           AND history.birth_fingerprint = $3
           AND history.engine_version = $4
           AND history.ephemeris = $5
           AND history.tradition = $2
           AND history.report_type = $6
           AND NULLIF(BTRIM(history.content), '') IS NOT NULL
       )
       AND (
         chart_data #> ARRAY['interpretationClaims', $7::text] IS NULL
         OR CASE
              WHEN chart_data #>> ARRAY['interpretationClaims', $7::text, 'claimedAtEpoch']
                     ~ '^[0-9]+([.][0-9]+)?$'
              THEN (chart_data #>> ARRAY[
                'interpretationClaims', $7::text, 'claimedAtEpoch'
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
      reportType,
      claimKey,
      useInterpretationCache,
      token,
    ]
  );
  if (claimed.rowCount === 1) return { status: "claimed", token };

  const current = await query<{
    chart_data: NatalChartRecord | null;
    report_id: string | null;
    report_content: string | null;
    report_structured_data: Record<string, unknown> | null;
    report_evidence_refs: unknown[] | Record<string, unknown> | null;
  }>(
    `SELECT chart.chart_data, history.id AS report_id, history.content AS report_content,
            history.structured_data AS report_structured_data,
            history.evidence_refs AS report_evidence_refs
     FROM natal_charts chart
     LEFT JOIN natal_report_history history
       ON history.user_id = chart.user_id
      AND history.birth_fingerprint = $3
      AND history.engine_version = $4
      AND history.ephemeris = $5
      AND history.tradition = $2
      AND history.report_type = $6
     WHERE chart.user_id = $1`,
    [userId, tradition, expectedBirthFingerprint, expectedEngineVersion, expectedEphemeris, reportType]
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
  const cached = useInterpretationCache
    ? chart.interpretations?.[tradition] ??
      (tradition === "western" ? chart.interpretation : undefined) ??
      currentRow.report_content
    : currentRow.report_content;
  if (cached?.trim()) {
    return {
      status: "cached",
      interpretation: cached,
      reportId: currentRow.report_id ?? undefined,
      structuredData: currentRow.report_structured_data,
      evidenceRefs: currentRow.report_evidence_refs,
    };
  }
  return { status: "busy" };
}

export async function releaseNatalInterpretationClaim(
  userId: string,
  tradition: NatalTradition,
  claimToken: string,
  claimKey: string = tradition
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
    [userId, claimKey, claimToken]
  );
}

/** Fire-and-forget safe wrapper for onboarding/profile updates. */
export function scheduleNatalChartCompute(userId: string): void {
  void computeAndStoreNatalChart(userId).catch((error) => {
    void error;
    console.warn("[natal-chart] scheduled compute failed");
  });
}
