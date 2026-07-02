/**
 * Shared "current date" anchoring for every LLM prompt.
 *
 * Root cause of masters referencing a stale year (e.g. "2025") in forecasts:
 * several prompt paths never told the model what "today" actually is, so the
 * model fell back to a year from its training data instead of reasoning from
 * the real server clock. Every date label here is computed at call time
 * (never cached/frozen) and normalized to Moscow time so the day/year is
 * consistent regardless of the server's own timezone.
 */

const MOSCOW_TZ = "Europe/Moscow";

function ruDate(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("ru-RU", { ...opts, timeZone: MOSCOW_TZ });
}

/** "2 июля 2026 г." style label, always in Moscow time regardless of server TZ. */
export function todayLabelRu(date: Date = new Date()): string {
  return ruDate(date, { day: "numeric", month: "long", year: "numeric" });
}

export function weekdayLabelRu(date: Date = new Date()): string {
  return ruDate(date, { weekday: "long" });
}

export function monthLabelRu(date: Date = new Date()): string {
  return ruDate(date, { month: "long" });
}

/** Calendar year in Moscow time — safer near midnight than server-local getFullYear(). */
export function currentYearMsk(date: Date = new Date()): number {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
  })
    .formatToParts(date)
    .find((p) => p.type === "year")?.value;
  return part ? Number(part) : date.getFullYear();
}

/**
 * Mandatory block injected into every system prompt so masters anchor "этот
 * год" / "следующий месяц" / "до конца года" to the REAL current date instead
 * of a year baked into their training data. Computed fresh on every call.
 */
export function buildDateAnchorBlock(date: Date = new Date()): string {
  const today = todayLabelRu(date);
  const weekday = weekdayLabelRu(date);
  const year = currentYearMsk(date);
  const month = monthLabelRu(date);

  return `ТЕКУЩАЯ ДАТА (обязательный якорь — сверяй с ней КАЖДОЕ упоминание времени и не путай с датами из своих общих знаний):
- Сегодня: ${today}, ${weekday}.
- Текущий год: ${year}. Следующий год: ${year + 1}. Прошлый год ${year - 1} уже завершён — не называй его текущим или ближайшим.
- Текущий месяц: ${month} ${year}.
- «Этот год» = ${year}. «Следующий год» = ${year + 1}. «До конца года» = период от сегодня до 31 декабря ${year}. «В этом месяце» = ${month} ${year}.
- ЗАПРЕЩЕНО называть текущим, ближайшим или будущим периодом год или месяц, который уже прошёл относительно даты выше (например, писать «в 2025 году» или «этой весной», если сейчас уже позже).
- Если точная дата неизвестна — говори обобщённо («в ближайшие недели», «этой осенью»), но никогда не подставляй случайную прошедшую дату.`;
}
