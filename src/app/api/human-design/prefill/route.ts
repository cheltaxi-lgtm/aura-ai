import { NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getUserById } from "@/lib/users";
import { query } from "@/lib/db";
import { birthFingerprintsMatch, buildBirthFingerprint, birthTimeOccurrenceFromProfile, natalPlaceFromProfile } from "@/lib/natal/types";

interface NatalPlaceRow {
  birth_place_label: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tzid: string | null;
  time_known: boolean;
  profile_fingerprint: string | null;
}

/**
 * Birth-data prefill for the HD calculator: profile (date/time/city) plus
 * precise place coordinates from the natal chart when available.
 */
export async function GET() {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_chart_read");
  if (rateLimited) return rateLimited;

  const user = await getUserById(resolved.profileUserId);
  if (!user) {
    return NextResponse.json({ enabled: true, prefill: null });
  }

  const { rows } = await query<NatalPlaceRow>(
    `SELECT birth_place_label, birth_lat, birth_lon, birth_tzid, time_known, chart_data->>'profileFingerprint' AS profile_fingerprint
     FROM natal_charts WHERE user_id = $1`,
    [resolved.profileUserId]
  );
  const profileFingerprint = buildBirthFingerprint({ birthDate: String(user.birth_date).slice(0, 10), birthTime: user.birth_time, birthCity: user.birth_city, birthTimeOccurrence:birthTimeOccurrenceFromProfile(user) });
  const natal = rows[0] && birthFingerprintsMatch(rows[0].profile_fingerprint ?? undefined, profileFingerprint) ? rows[0] : undefined;
  const selected = natalPlaceFromProfile(user);

  const place = selected ? { label: selected.label, latitude: selected.latitude, longitude: selected.longitude, timezone: selected.timezone } :
    natal?.birth_place_label &&
    natal.birth_lat !== null &&
    natal.birth_lon !== null &&
    natal.birth_tzid
      ? {
          label: natal.birth_place_label,
          latitude: natal.birth_lat,
          longitude: natal.birth_lon,
          timezone: natal.birth_tzid,
        }
      : null;

  // Natal `time_known=false` means the stored clock is a placeholder — HD
  // must not treat it as a known birth time (overconfident type/authority).
  const timeKnown = natal ? Boolean(natal.time_known) : Boolean(user.birth_time);
  const birthTime = timeKnown ? user.birth_time ?? null : null;

  return NextResponse.json({
    enabled: true,
    prefill: {
      name: user.name,
      birthDate: user.birth_date,
      birthTime,
      birthTimeOccurrence: birthTimeOccurrenceFromProfile(user),
      timeKnown,
      birthCity: user.birth_city ?? null,
      place,
    },
  });
}
