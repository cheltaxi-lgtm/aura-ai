import { createHash, randomBytes } from "crypto";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  computeNatalChartRecord,
  buildBirthFingerprint,
  NATAL_ENGINE_VERSION,
  type NatalChartRecord,
  type NatalPlace,
} from "@/lib/natal";
import { buildNatalGuestSafePayload, type NatalGuestSafePayload } from "@/lib/natal/guest-free-summary";
import {
  NATAL_GUEST_CLAIM_TTL_MS,
} from "@/lib/natal-guest-claim-cookie";
import { profileHasBirthData } from "@/lib/users";
import { buildAstroMeta } from "@/lib/astro-profile";
import { getZodiacFromDate } from "@/utils/zodiac";
import { isNatalChartEnabled } from "@/lib/settings";

export type NatalGuestCalcInput = {
  birthDate: string;
  birthTime?: string | null;
  timeKnown: boolean;
  place: NatalPlace;
};

type GuestRow = {
  id: string;
  birth_date: string;
  birth_time: string | null;
  time_known: boolean;
  place_label: string;
  birth_lat: number;
  birth_lon: number;
  birth_tzid: string;
  birth_fingerprint: string;
  chart_data: NatalChartRecord;
  engine_version: string;
  claim_token_hash: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
};

export type NatalGuestClaimResult =
  | {
      ok: true;
      status: "claimed" | "idempotent";
      artifactId: string;
      birthFingerprint: string;
      chart: NatalChartRecord;
    }
  | {
      ok: false;
      code:
        | "NO_CLAIM_TOKEN"
        | "INVALID_TOKEN"
        | "EXPIRED"
        | "ALREADY_CLAIMED"
        | "NATAL_PROFILE_CONFLICT"
        | "DISABLED"
        | "NOT_FOUND";
      conflict?: {
        existingBirthDate: string | null;
        existingBirthCity: string | null;
        guestBirthDate: string;
        guestPlaceLabel: string;
      };
    };

function hashNatalGuestClaimToken(rawToken: string): string {
  return createHash("sha256").update(`natal-guest-claim:v1:${rawToken}`).digest("hex");
}

export function createNatalGuestClaimToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizeBirthDate(raw: string): string {
  const d = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error("INVALID_BIRTH_DATE");
  }
  return d;
}

function normalizeBirthTime(raw: string | null | undefined, timeKnown: boolean): string | null {
  if (!timeKnown) return null;
  const t = (raw ?? "").trim().slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
    throw new Error("INVALID_BIRTH_TIME");
  }
  return t;
}

function validatePlace(place: NatalPlace): NatalPlace {
  if (
    !place ||
    typeof place.label !== "string" ||
    !place.label.trim() ||
    typeof place.latitude !== "number" ||
    !Number.isFinite(place.latitude) ||
    typeof place.longitude !== "number" ||
    !Number.isFinite(place.longitude) ||
    typeof place.timezone !== "string" ||
    !place.timezone.trim() ||
    !place.timezone.includes("/")
  ) {
    throw new Error("INVALID_PLACE");
  }
  return {
    label: place.label.trim().slice(0, 200),
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone.trim(),
  };
}

/** Same self birth identity — date/time + place primary name (label may be richer). */
function birthIdentityMatches(
  user: {
    birth_date: string | Date | null;
    birth_time?: string | null;
    birth_city?: string | null;
  },
  guest: GuestRow
): boolean {
  if (!user.birth_date) return false;
  const ud = String(user.birth_date).slice(0, 10);
  const gd = String(guest.birth_date).slice(0, 10);
  if (ud !== gd) return false;

  const uTime = user.birth_time ? String(user.birth_time).slice(0, 5) : null;
  const gTime = guest.time_known && guest.birth_time ? String(guest.birth_time).slice(0, 5) : null;
  const uKnown = Boolean(uTime);
  if (uKnown !== guest.time_known) return false;
  if (uKnown && uTime !== gTime) return false;

  const uCity = (user.birth_city ?? "").trim().toLowerCase();
  const gCity = guest.place_label.trim().toLowerCase();
  if (!uCity || !gCity) return false;
  if (uCity === gCity) return true;
  const uPrimary = uCity.split(",")[0]?.trim() ?? "";
  const gPrimary = gCity.split(",")[0]?.trim() ?? "";
  return uPrimary.length >= 2 && uPrimary === gPrimary;
}

async function sweepExpiredGuestNatal(client?: PoolClient): Promise<number> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);
  const { rowCount } = await run(
    `DELETE FROM natal_guest_charts
     WHERE claimed_user_id IS NULL AND expires_at < NOW()`
  );
  return rowCount ?? 0;
}

/**
 * Compute via the same engine as authenticated Natal, persist guest artifact,
 * return safe payload + raw claim token (caller sets HttpOnly cookie).
 */
export async function createGuestNatalChart(input: NatalGuestCalcInput): Promise<{
  rawClaimToken: string;
  payload: NatalGuestSafePayload;
}> {
  if (!(await isNatalChartEnabled())) {
    throw new Error("NATAL_DISABLED");
  }

  const birthDate = normalizeBirthDate(input.birthDate);
  const timeKnown = Boolean(input.timeKnown);
  const birthTime = normalizeBirthTime(input.birthTime, timeKnown);
  const place = validatePlace(input.place);

  await sweepExpiredGuestNatal();

  const syntheticId = `guest-natal-${randomBytes(8).toString("hex")}`;
  const record = await computeNatalChartRecord(syntheticId, {
    birthDate,
    birthTime,
    birthCity: place.label,
    timeKnown,
    place,
  });

  // Persist authoritative timeKnown from engine (invalid time → false).
  const effectiveTimeKnown = record.timeKnown;
  const fingerprint =
    record.birthFingerprint ??
    buildBirthFingerprint({
      birthDate,
      birthTime: effectiveTimeKnown ? birthTime : null,
      birthCity: place.label,
    });

  const ownedRecord: NatalChartRecord = {
    ...record,
    birthFingerprint: fingerprint,
    // Strip paid interpretation fields from stored guest artifact.
    interpretation: undefined,
    interpretations: undefined,
    interpretationClaims: undefined,
  };

  const rawClaimToken = createNatalGuestClaimToken();
  const claimHash = hashNatalGuestClaimToken(rawClaimToken);
  const expiresAt = new Date(Date.now() + NATAL_GUEST_CLAIM_TTL_MS).toISOString();

  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO natal_guest_charts (
       birth_date, birth_time, time_known, place_label,
       birth_lat, birth_lon, birth_tzid, birth_fingerprint,
       chart_data, engine_version, claim_token_hash, expires_at
     ) VALUES (
       $1::date, $2, $3, $4,
       $5, $6, $7, $8,
       $9::jsonb, $10, $11, $12::timestamptz
     )
     RETURNING id, expires_at::text`,
    [
      birthDate,
      effectiveTimeKnown ? birthTime : null,
      effectiveTimeKnown,
      place.label,
      place.latitude,
      place.longitude,
      place.timezone,
      fingerprint,
      JSON.stringify(ownedRecord),
      NATAL_ENGINE_VERSION,
      claimHash,
      expiresAt,
    ]
  );

  const row = rows[0];
  if (!row) throw new Error("GUEST_NATAL_INSERT_FAILED");

  return {
    rawClaimToken,
    payload: buildNatalGuestSafePayload({
      artifactId: row.id,
      chart: ownedRecord,
      expiresAt: row.expires_at,
    }),
  };
}

async function adoptExactChart(
  client: PoolClient,
  userId: string,
  guest: GuestRow
): Promise<NatalChartRecord> {
  const chart: NatalChartRecord = {
    ...guest.chart_data,
    userId,
    birthFingerprint: guest.birth_fingerprint,
    engineVersion: guest.engine_version,
    timeKnown: guest.time_known,
    place: {
      label: guest.place_label,
      latitude: guest.birth_lat,
      longitude: guest.birth_lon,
      timezone: guest.birth_tzid,
    },
    interpretation: undefined,
    interpretations: undefined,
    interpretationClaims: undefined,
  };

  const houseSystem =
    chart.western && typeof chart.western.houseSystem === "string"
      ? String(chart.western.houseSystem).toLowerCase()
      : "placidus";

  await queryClient(
    client,
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
      guest.birth_lat,
      guest.birth_lon,
      guest.birth_tzid,
      guest.place_label,
      guest.time_known,
      houseSystem,
      JSON.stringify(chart),
      guest.engine_version,
    ]
  );

  return chart;
}

/**
 * Atomic claim: cookie token hash → adopt EXACT stored guest chart.
 * Birth completeness is NOT required. Conflicting self birth needs confirmReplace.
 */
export async function claimGuestNatalChart(opts: {
  profileUserId: string;
  rawClaimToken: string | null | undefined;
  confirmReplace?: boolean;
}): Promise<NatalGuestClaimResult> {
  if (!(await isNatalChartEnabled())) {
    return { ok: false, code: "DISABLED" };
  }

  const raw = typeof opts.rawClaimToken === "string" ? opts.rawClaimToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) {
    return { ok: false, code: "NO_CLAIM_TOKEN" };
  }

  const claimHash = hashNatalGuestClaimToken(raw.toLowerCase());

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `natal-guest-claim:${opts.profileUserId}`,
    ]);

    const { rows } = await queryClient<GuestRow>(
      client,
      `SELECT id, birth_date::text, birth_time::text, time_known, place_label,
              birth_lat, birth_lon, birth_tzid, birth_fingerprint,
              chart_data, engine_version, claim_token_hash,
              claimed_user_id, claimed_at::text, created_at::text, expires_at::text
       FROM natal_guest_charts
       WHERE claim_token_hash = $1
       FOR UPDATE`,
      [claimHash]
    );
    const guest = rows[0];
    if (!guest) {
      await sweepExpiredGuestNatal(client);
      return { ok: false, code: "INVALID_TOKEN" };
    }

    if (guest.claimed_user_id) {
      if (guest.claimed_user_id === opts.profileUserId) {
        const stored = await queryClient<{ chart_data: NatalChartRecord }>(
          client,
          `SELECT chart_data FROM natal_charts WHERE user_id = $1`,
          [opts.profileUserId]
        );
        const chart = stored.rows[0]?.chart_data ?? guest.chart_data;
        return {
          ok: true,
          status: "idempotent",
          artifactId: guest.id,
          birthFingerprint: guest.birth_fingerprint,
          chart: { ...chart, userId: opts.profileUserId },
        };
      }
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    if (new Date(guest.expires_at).getTime() < Date.now()) {
      await queryClient(client, `DELETE FROM natal_guest_charts WHERE id = $1`, [guest.id]);
      await sweepExpiredGuestNatal(client);
      return { ok: false, code: "EXPIRED" };
    }

    const { rows: userRows } = await queryClient<{
      id: string;
      name: string;
      gender: string;
      birth_date: string | null;
      birth_time: string | null;
      birth_city: string | null;
      zodiac: string | null;
      life_focus: string | null;
      main_question: string | null;
      astro_meta: Record<string, unknown> | null;
    }>(
      client,
      `SELECT id, name, gender, birth_date::text, birth_time::text, birth_city, zodiac,
              life_focus, main_question, astro_meta
       FROM users WHERE id = $1 FOR UPDATE`,
      [opts.profileUserId]
    );
    const user = userRows[0];
    if (!user) {
      return { ok: false, code: "NOT_FOUND" };
    }

    const hasBirth = profileHasBirthData(user);
    const matches = hasBirth ? birthIdentityMatches(user, guest) : false;

    if (hasBirth && !matches && !opts.confirmReplace) {
      return {
        ok: false,
        code: "NATAL_PROFILE_CONFLICT",
        conflict: {
          existingBirthDate: user.birth_date ? String(user.birth_date).slice(0, 10) : null,
          existingBirthCity: user.birth_city,
          guestBirthDate: String(guest.birth_date).slice(0, 10),
          guestPlaceLabel: guest.place_label,
        },
      };
    }

    if (!hasBirth || !matches || opts.confirmReplace) {
      const birthDate = String(guest.birth_date).slice(0, 10);
      const birthTime = guest.time_known ? guest.birth_time : null;
      const zodiac = getZodiacFromDate(birthDate).name || user.zodiac || "";
      const nextMeta = {
        ...(typeof user.astro_meta === "object" && user.astro_meta ? user.astro_meta : {}),
        ...buildAstroMeta(birthDate),
        stubProfile: false,
      };
      await queryClient(
        client,
        `UPDATE users SET
           birth_date = $2::date,
           birth_time = $3,
           birth_city = $4,
           zodiac = $5,
           astro_meta = $6::jsonb
         WHERE id = $1`,
        [opts.profileUserId, birthDate, birthTime, guest.place_label, zodiac, JSON.stringify(nextMeta)]
      );
    }

    const chart = await adoptExactChart(client, opts.profileUserId, guest);

    await queryClient(
      client,
      `UPDATE natal_guest_charts
       SET claimed_user_id = $2, claimed_at = NOW()
       WHERE id = $1 AND claimed_user_id IS NULL`,
      [guest.id, opts.profileUserId]
    );

    return {
      ok: true,
      status: "claimed",
      artifactId: guest.id,
      birthFingerprint: guest.birth_fingerprint,
      chart,
    };
  });
}

/** Test/helper: load guest row by id (never exposes claim hash to callers). */
export async function getGuestNatalArtifactMeta(artifactId: string): Promise<{
  id: string;
  birthFingerprint: string;
  engineVersion: string;
  claimedUserId: string | null;
  expiresAt: string;
  chartData: NatalChartRecord;
  claimTokenHash: string;
} | null> {
  const { rows } = await query<GuestRow>(
    `SELECT id, birth_date::text, birth_time::text, time_known, place_label,
            birth_lat, birth_lon, birth_tzid, birth_fingerprint,
            chart_data, engine_version, claim_token_hash,
            claimed_user_id, claimed_at::text, created_at::text, expires_at::text
     FROM natal_guest_charts WHERE id = $1`,
    [artifactId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    birthFingerprint: row.birth_fingerprint,
    engineVersion: row.engine_version,
    claimedUserId: row.claimed_user_id,
    expiresAt: row.expires_at,
    chartData: row.chart_data,
    claimTokenHash: row.claim_token_hash,
  };
}

export { hashNatalGuestClaimToken };
