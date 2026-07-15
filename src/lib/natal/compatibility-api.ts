import type { NatalChartInput } from "./types";

export function parseCompatibilityLabel(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error("invalid_label");
  const label = value.trim().replace(/\s+/g, " ");
  if (!label || label.length > 80) throw new Error("invalid_label");
  return label;
}

export function parseManualPartnerInput(value: unknown): NatalChartInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_partner");
  }
  const input = value as Record<string, unknown>;
  const birthDate = typeof input.birthDate === "string" ? input.birthDate.trim() : "";
  const birthCity = typeof input.birthCity === "string" ? input.birthCity.trim() : "";
  const birthTime = typeof input.birthTime === "string" ? input.birthTime.trim() : "";
  const timeKnown = input.timeKnown === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("invalid_birth_date");
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birthDate ||
    date.getTime() > Date.now()
  ) {
    throw new Error("invalid_birth_date");
  }
  if (birthCity.length < 2 || birthCity.length > 160) throw new Error("invalid_birth_city");
  if (timeKnown && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(birthTime)) {
    throw new Error("invalid_birth_time");
  }
  return {
    birthDate,
    birthCity,
    birthTime: timeKnown ? birthTime : null,
    timeKnown,
  };
}

export function isCompatibilityId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function isCompatibilityInviteToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
