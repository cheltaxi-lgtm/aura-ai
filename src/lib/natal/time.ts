export function parseBirthTimeToDecimal(timeRaw: string | null | undefined): number | null {
  if (!timeRaw) return null;
  const trimmed = timeRaw.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours + minutes / 60 + seconds / 3600;
}

export function birthTimeLabel(decimalHour: number): string {
  const seconds = Math.round(decimalHour * 3600);
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor(seconds / 60) % 60;
  const sec = seconds % 60;
  const hhmm = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  return sec ? hhmm + ":" + String(sec).padStart(2, "0") : hhmm;
}

export function resolveBirthUtcOffsetHours(
  birthDate: string,
  birthTime: string,
  timezone: string,
  occurrence?: "earlier" | "later"
): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  const hour = parseBirthTimeToDecimal(birthTime);
  if (hour == null) throw new Error("INVALID_BIRTH_TIME");
  const wall = Date.UTC(year, month - 1, day) + Math.round(hour * 3_600_000);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const wallAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  };
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const instant = wall + hours * 3_600_000;
    offsets.add(wallAt(instant) - instant);
  }
  const candidates = [...offsets].map(offset => wall - offset)
    .filter(instant => wallAt(instant) === wall).sort((a, b) => a - b);
  if (!candidates.length) throw new Error("NONEXISTENT_BIRTH_TIME");
  if (candidates.length > 1 && !occurrence) throw new Error("AMBIGUOUS_BIRTH_TIME");
  const instant = occurrence === "later" ? candidates[candidates.length - 1] : candidates[0];
  return (wall - instant) / 3_600_000;
}

export function natalBirthTimeError(error: unknown): string | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "INVALID_BIRTH_TIME") return "Укажите корректное время рождения или отметьте, что оно неизвестно.";
  if (code === "NONEXISTENT_BIRTH_TIME") return "Такого местного времени не было из-за перевода часов. Проверьте время и место рождения.";
  if (code === "AMBIGUOUS_BIRTH_TIME") return "Это время повторялось при переводе часов. Выберите первое или второе наступление времени в настройках карты.";
  return null;
}

/** YYYY-MM-DD in the birth-place IANA timezone (for transit windows). */
export function localDateStringInTimezone(timezone: string, refDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

export function localHourInTimezone(timezone: string, refDate = new Date()): number {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(refDate);
  return Number(value);
}
