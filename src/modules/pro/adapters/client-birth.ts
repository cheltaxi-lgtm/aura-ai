/**
 * Map pro.clients birth columns ↔ case_inputs payload.
 */

export type ProClientBirthSource = {
  birth_date?: string | null;
  birth_time?: string | null;
  birth_place?: string | null;
  birth_lat?: number | null;
  birth_lon?: number | null;
  birth_tz?: string | null;
};

export function casePayloadFromClientBirth(
  client: ProClientBirthSource | null | undefined
): Record<string, unknown> | null {
  if (!client?.birth_date) return null;
  const time =
    typeof client.birth_time === "string" && client.birth_time.trim()
      ? client.birth_time.trim().slice(0, 8)
      : null;
  return {
    birthDate: String(client.birth_date).slice(0, 10),
    birthTime: time,
    timeKnown: Boolean(time),
    birthPlace: client.birth_place ?? null,
    birthCity: client.birth_place ?? null,
    latitude: client.birth_lat ?? null,
    longitude: client.birth_lon ?? null,
    timezone: client.birth_tz ?? null,
    birthLat: client.birth_lat ?? null,
    birthLon: client.birth_lon ?? null,
    birthTz: client.birth_tz ?? null,
  };
}

export function clientBirthPatchFromPayload(payload: Record<string, unknown>): {
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  birthLat: number | null;
  birthLon: number | null;
  birthTz: string | null;
} {
  const date =
    typeof payload.birthDate === "string" && payload.birthDate.trim()
      ? payload.birthDate.trim().slice(0, 10)
      : null;
  const time =
    typeof payload.birthTime === "string" && payload.birthTime.trim()
      ? payload.birthTime.trim().slice(0, 8)
      : null;
  const place =
    (typeof payload.birthPlace === "string" && payload.birthPlace.trim()) ||
    (typeof payload.birthCity === "string" && payload.birthCity.trim()) ||
    null;
  const lat =
    typeof payload.latitude === "number"
      ? payload.latitude
      : typeof payload.birthLat === "number"
        ? payload.birthLat
        : null;
  const lon =
    typeof payload.longitude === "number"
      ? payload.longitude
      : typeof payload.birthLon === "number"
        ? payload.birthLon
        : null;
  const tz =
    (typeof payload.timezone === "string" && payload.timezone.trim()) ||
    (typeof payload.birthTz === "string" && payload.birthTz.trim()) ||
    null;
  return {
    birthDate: date,
    birthTime: time,
    birthPlace: place,
    birthLat: lat,
    birthLon: lon,
    birthTz: tz,
  };
}
