import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/users";
import {
  computePersonalTiming,
  TIMING_ENGINE_VERSION,
  type PersonalTimingResult,
  type TimingCategory,
  type TimingHorizon,
} from "@/lib/natal/timing";
import { getOrComputeNatalChart } from "./natal-chart-service";

export type NatalEventFrequency = "daily" | "weekly";
export interface NatalEventPreferences {
  enabled: boolean;
  horizons: TimingHorizon[];
  categories: TimingCategory[];
  planetImportance: string[];
  frequency: NatalEventFrequency;
  inApp: boolean;
  push: boolean;
  timezone: string;
}

const ALL_CATEGORIES: TimingCategory[] = [
  "identity", "emotions", "relationships", "career", "growth", "pressure", "transformation",
];
const ALLOWED_PLANETS = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const DEFAULT_PREFS: NatalEventPreferences = {
  enabled: false,
  horizons: [7, 30],
  categories: [...ALL_CATEGORIES],
  planetImportance: ["jupiter", "saturn", "uranus", "neptune", "pluto"],
  frequency: "daily",
  inApp: true,
  push: false,
  timezone: "UTC",
};

function stringArray(value: unknown, allowed: readonly string[], field: string): string[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new Error(`INVALID_${field.toUpperCase()}`);
  const unique = [...new Set(value)];
  if (unique.some((item) => typeof item !== "string" || !allowed.includes(item))) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return unique as string[];
}

export function validateNatalEventPreferences(
  value: unknown,
  current: NatalEventPreferences = DEFAULT_PREFS
): NatalEventPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_PREFERENCES");
  const patch = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "enabled", "horizons", "categories", "planetImportance", "frequency", "inApp", "push", "timezone",
  ]);
  if (Object.keys(patch).some((key) => !allowedKeys.has(key))) throw new Error("INVALID_PREFERENCES_FIELD");
  const timezone = patch.timezone === undefined ? current.timezone : patch.timezone;
  if (typeof timezone !== "string" || timezone.length > 64) throw new Error("INVALID_TIMEZONE");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }
  const frequency = patch.frequency ?? current.frequency;
  if (frequency !== "daily" && frequency !== "weekly") throw new Error("INVALID_FREQUENCY");
  let horizons = current.horizons;
  if (patch.horizons !== undefined) {
    if (!Array.isArray(patch.horizons) || patch.horizons.length > 4) throw new Error("INVALID_HORIZONS");
    const unique = [...new Set(patch.horizons)];
    if (unique.some((item) => typeof item !== "number" || ![7, 30, 90, 365].includes(item))) {
      throw new Error("INVALID_HORIZONS");
    }
    horizons = unique as TimingHorizon[];
  }
  const categories = patch.categories === undefined
    ? current.categories
    : stringArray(patch.categories, ALL_CATEGORIES, "categories") as TimingCategory[];
  const planetImportance = patch.planetImportance === undefined
    ? current.planetImportance
    : stringArray(patch.planetImportance, ALLOWED_PLANETS, "planet_importance");
  for (const field of ["enabled", "inApp", "push"] as const) {
    if (patch[field] !== undefined && typeof patch[field] !== "boolean") throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return {
    enabled: patch.enabled as boolean ?? current.enabled,
    horizons, categories, planetImportance, frequency,
    inApp: patch.inApp as boolean ?? current.inApp,
    // No native push delivery exists in this repository. Store the preference,
    // but the cron only dispatches the supported in-app channel.
    push: patch.push as boolean ?? current.push,
    timezone,
  };
}

type PreferenceRow = {
  enabled: boolean;
  horizons: number[];
  categories: TimingCategory[];
  planet_importance: string[];
  frequency: NatalEventFrequency;
  in_app: boolean;
  push: boolean;
  timezone: string;
};

function mapPrefs(row: PreferenceRow | undefined): NatalEventPreferences {
  if (!row) return { ...DEFAULT_PREFS, horizons: [...DEFAULT_PREFS.horizons], categories: [...DEFAULT_PREFS.categories] };
  return {
    enabled: row.enabled,
    horizons: row.horizons.filter((item): item is TimingHorizon => [7, 30, 90, 365].includes(item)),
    categories: row.categories,
    planetImportance: row.planet_importance,
    frequency: row.frequency,
    inApp: row.in_app,
    push: row.push,
    timezone: row.timezone,
  };
}

export async function getNatalEventPreferences(userId: string): Promise<NatalEventPreferences> {
  const { rows } = await query<PreferenceRow>(
    `SELECT enabled, horizons, categories, planet_importance, frequency, in_app, push, timezone
     FROM natal_event_preferences WHERE user_id = $1`,
    [userId]
  );
  if (rows[0]) return mapPrefs(rows[0]);
  const chart = await query<{ birth_tzid: string | null }>(
    `SELECT birth_tzid FROM natal_charts WHERE user_id = $1`,
    [userId]
  );
  return { ...mapPrefs(undefined), timezone: chart.rows[0]?.birth_tzid || "UTC" };
}

export async function updateNatalEventPreferences(
  userId: string,
  patch: unknown
): Promise<NatalEventPreferences> {
  const current = await getNatalEventPreferences(userId);
  const next = validateNatalEventPreferences(patch, current);
  const { rows } = await query<PreferenceRow>(
    `INSERT INTO natal_event_preferences (
       user_id, enabled, horizons, categories, planet_importance, frequency, in_app, push, timezone, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, horizons = EXCLUDED.horizons,
       categories = EXCLUDED.categories, planet_importance = EXCLUDED.planet_importance,
       frequency = EXCLUDED.frequency, in_app = EXCLUDED.in_app,
       push = EXCLUDED.push, timezone = EXCLUDED.timezone, updated_at = NOW()
     RETURNING enabled, horizons, categories, planet_importance, frequency, in_app, push, timezone`,
    [
      userId, next.enabled, next.horizons, next.categories, next.planetImportance,
      next.frequency, next.inApp, next.push, next.timezone,
    ]
  );
  return mapPrefs(rows[0]);
}

type CacheRow = {
  timing_data: PersonalTimingResult | null;
  generated_at: Date | string | null;
};

/**
 * Read-only short timing context for report generation. This deliberately
 * never starts an expensive timing calculation on the interpretation path.
 */
export async function getCachedPersonalTiming(userId: string): Promise<PersonalTimingResult | null> {
  const { rows } = await query<{ timing_data: PersonalTimingResult }>(
    `SELECT timing_data
     FROM natal_timing_cache
     WHERE user_id = $1
       AND horizon_days IN (7, 30)
       AND timing_data IS NOT NULL
       AND engine_version = $2
       AND generated_at > NOW() - INTERVAL '48 hours'
     ORDER BY horizon_days ASC, generated_at DESC
     LIMIT 1`,
    [userId, TIMING_ENGINE_VERSION]
  );
  return rows[0]?.timing_data ?? null;
}

export async function getOrComputePersonalTiming(
  userId: string,
  horizon: TimingHorizon,
  options?: { force?: boolean; referenceDate?: Date }
): Promise<{ timing: PersonalTimingResult; cached: boolean }> {
  const chart = await getOrComputeNatalChart(userId);
  if (!chart?.western || !chart.place || !chart.birthFingerprint) throw new Error("TIMING_CHART_INCOMPLETE");
  const reference = options?.referenceDate ?? new Date();
  const windowStart = new Intl.DateTimeFormat("en-CA", {
    timeZone: chart.place.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(reference);
  const cached = await query<CacheRow>(
    `SELECT timing_data, generated_at
     FROM natal_timing_cache
     WHERE user_id = $1 AND horizon_days = $2 AND window_start = $3
       AND engine_version = $4 AND birth_fingerprint = $5`,
    [userId, horizon, windowStart, TIMING_ENGINE_VERSION, chart.birthFingerprint]
  );
  const existing = cached.rows[0];
  const generatedAt = existing?.generated_at ? new Date(existing.generated_at).getTime() : 0;
  if (!options?.force && existing?.timing_data && generatedAt > reference.getTime() - 6 * 3_600_000) {
    return { timing: existing.timing_data, cached: true };
  }

  const claim = randomUUID();
  const claimed = await query(
    `INSERT INTO natal_timing_cache (
       user_id, horizon_days, window_start, window_end, engine_version,
       birth_fingerprint, claim_token, claim_at
     ) VALUES ($1, $2, $3, $3::date + $2::integer, $4, $5, $6, NOW())
     ON CONFLICT (user_id, horizon_days, window_start, engine_version, birth_fingerprint)
     DO UPDATE SET claim_token = EXCLUDED.claim_token, claim_at = NOW()
     WHERE natal_timing_cache.claim_at IS NULL
        OR natal_timing_cache.claim_at < NOW() - INTERVAL '10 minutes'
     RETURNING claim_token`,
    [userId, horizon, windowStart, TIMING_ENGINE_VERSION, chart.birthFingerprint, claim]
  );
  if (claimed.rowCount !== 1) {
    throw new Error("TIMING_GENERATION_BUSY");
  }

  try {
    const user = await getUserById(userId);
    if (!user?.birth_date) throw new Error("TIMING_BIRTH_DATE_MISSING");
    const timing = await computePersonalTiming({
      natal: chart,
      birthDate: String(user.birth_date).slice(0, 10),
      birthTime: user.birth_time,
      horizon,
      referenceDate: reference,
    });
    const saved = await query(
      `UPDATE natal_timing_cache
       SET timing_data = $7::jsonb, generated_at = NOW(), claim_token = NULL, claim_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND horizon_days = $2 AND window_start = $3
         AND engine_version = $4 AND birth_fingerprint = $5 AND claim_token = $6`,
      [userId, horizon, windowStart, TIMING_ENGINE_VERSION, chart.birthFingerprint, claim, JSON.stringify(timing)]
    );
    if (saved.rowCount !== 1) throw new Error("TIMING_CLAIM_LOST");
    return { timing, cached: false };
  } catch (error) {
    await query(
      `UPDATE natal_timing_cache SET claim_token = NULL, claim_at = NULL
       WHERE user_id = $1 AND claim_token = $2`,
      [userId, claim]
    );
    throw error;
  }
}
