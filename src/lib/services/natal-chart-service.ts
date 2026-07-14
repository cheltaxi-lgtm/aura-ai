import { query } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { getSetting, isNatalChartEnabled } from "@/lib/settings";
import {
  computeNatalChartRecord,
  computeDeepTransits,
  buildBirthFingerprint,
  type NatalChartInput,
  type NatalChartRecord,
  NATAL_ENGINE_VERSION,
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
  return row.chart_data;
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

  await query(
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
       chart_data = EXCLUDED.chart_data,
       engine_version = EXCLUDED.engine_version,
       computed_at = NOW(),
       updated_at = NOW()`,
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

  return record;
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

export async function saveNatalInterpretation(userId: string, interpretation: string): Promise<void> {
  await query(
    `UPDATE natal_charts
     SET chart_data = jsonb_set(chart_data, '{interpretation}', to_jsonb($2::text), true),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, interpretation]
  );
}

/** Fire-and-forget safe wrapper for onboarding/profile updates. */
export function scheduleNatalChartCompute(userId: string): void {
  void computeAndStoreNatalChart(userId).catch((error) => {
    console.warn("[natal-chart] compute failed:", userId, error);
  });
}
