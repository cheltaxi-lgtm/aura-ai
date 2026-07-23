export type LandingSocialProofStat = {
  key: string;
  value: string;
  label: string;
  live?: boolean;
};

/** Старт публичного запуска — масштаб счётчиков под сайт ~1 месяца. */
const LAUNCH = { year: 2026, month: 6, day: 18 };
const MOSCOW_TZ = "Europe/Moscow";

/** Трафик по часам (МСК): ночью тихо, пик 19–22. */
const HOUR_ONLINE_BASE = [2, 1, 1, 1, 1, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 7, 8, 9, 9, 8, 7, 5, 4, 3];

type MoscowParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

function formatGrouped(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function dateKey(year: number, month: number, day: number): number {
  return year * 10_000 + month * 100 + day;
}

function seededInt(seed: number, min: number, max: number): number {
  const span = max - min + 1;
  return min + (hash32(seed) % span);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMoscowParts(now: Date): MoscowParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
    weekday: weekdayMap[weekdayLabel] ?? 1,
  };
}

function daysSinceLaunch(year: number, month: number, day: number): number {
  const launchUtc = Date.UTC(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day);
  const todayUtc = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.floor((todayUtc - launchUtc) / 86_400_000));
}

/** Сколько раскладов «запланировано» на этот календарный день — уникально для каждой даты. */
function dailySpreadCap(parts: MoscowParts): number {
  const weekend = parts.weekday === 0 || parts.weekday === 6;
  const seed = hash32(dateKey(parts.year, parts.month, parts.day));
  // Дневной объём для молодого сайта: тик каждые несколько минут, без разгона в десятки тысяч.
  return seededInt(seed, weekend ? 38 : 24, weekend ? 62 : 44);
}

/** Доля дневного объёма к текущему моменту (утро мало, вечер больше). */
function spreadProgressThroughDay(hour: number, minute: number, second: number): number {
  const t = hour + minute / 60 + second / 3600;
  if (t < 7) return 0.04 * (t / 7);
  if (t < 12) return 0.04 + 0.14 * ((t - 7) / 5);
  if (t < 17) return 0.18 + 0.32 * ((t - 12) / 5);
  if (t < 22) return 0.5 + 0.42 * ((t - 17) / 5);
  return 0.92 + 0.08 * Math.min(1, (t - 22) / 2);
}

function spreadsToday(parts: MoscowParts): number {
  const cap = dailySpreadCap(parts);
  const progress = spreadProgressThroughDay(parts.hour, parts.minute, parts.second);
  const raw = Math.floor(cap * progress);
  if (parts.hour < 7) return Math.max(0, raw);
  return Math.max(1, raw);
}

/** Накопительный счётчик к полуночи текущего дня (МСК). */
const cumulativeAnswersCache = new Map<number, number>();

function cumulativeAnswersAtMidnight(parts: MoscowParts): number {
  const todayKey = dateKey(parts.year, parts.month, parts.day);
  const cached = cumulativeAnswersCache.get(todayKey);
  if (cached !== undefined) return cached;

  const dayCount = daysSinceLaunch(parts.year, parts.month, parts.day);
  let total = 96;

  for (let i = 0; i < dayCount; i += 1) {
    const launchUtc = Date.UTC(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day);
    const dt = new Date(launchUtc + i * 86_400_000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const seed = hash32(dateKey(y, m, d));
    total += seededInt(seed, weekend ? 28 : 16, weekend ? 48 : 34);
  }

  cumulativeAnswersCache.set(todayKey, total);
  return total;
}

/** Полный счётчик ответов: прошлые дни + сегодняшний прогресс (растёт в течение дня). */
function totalAnswersNow(parts: MoscowParts): number {
  return cumulativeAnswersAtMidnight(parts) + spreadsToday(parts);
}

/**
 * Пользователи соразмерны ответам (~58–65%): часть людей получает несколько ответов.
 * Растёт вместе с ответами, но чуть медленнее.
 */
function totalUsersNow(answers: number, parts: MoscowParts): number {
  const seed = hash32(dateKey(parts.year, parts.month, parts.day) + 91);
  const ratio = 0.62 + (seed % 600) / 10_000;
  return Math.max(1, Math.floor(answers * ratio));
}

function onlineNow(parts: MoscowParts): number {
  const daySeed = hash32(dateKey(parts.year, parts.month, parts.day));
  const hourSeed = hash32(daySeed + parts.hour);
  const minuteSwing = seededInt(hash32(hourSeed + Math.floor(parts.minute / 5)), -1, 1);
  const daySwing = seededInt(daySeed, -1, 1);
  const base = HOUR_ONLINE_BASE[parts.hour] ?? 4;
  return clamp(base + daySwing + minuteSwing, 1, 12);
}

function parseGrouped(value: string): number {
  const n = Number.parseInt(value.replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Подмешиваем реальные счётчики только как мягкий пол.
 * Если в БД накопились тестовые/гостевые сессии и число «взрывается»,
 * оставляем синтетический масштаб молодого сайта.
 */
function blendWithReal(synthetic: number, real: number): number {
  if (real <= 0) return synthetic;
  if (real > synthetic * 2) return synthetic;
  return Math.max(synthetic, real);
}

export function mergeLandingSocialProofWithPublicStats(
  stats: LandingSocialProofStat[],
  sessions: number,
  users: number
): LandingSocialProofStat[] {
  if (sessions <= 0 && users <= 0) return stats;
  return stats.map((stat) => {
    if (stat.key === "total" && sessions > 0) {
      return { ...stat, value: formatGrouped(blendWithReal(parseGrouped(stat.value), sessions)) };
    }
    if (stat.key === "users" && users > 0) {
      return { ...stat, value: formatGrouped(blendWithReal(parseGrouped(stat.value), users)) };
    }
    return stat;
  });
}

/** «Живая» статистика для лендинга — меняется по календарному дню (МСК) и времени суток. */
export function getLandingSocialProofStats(now = new Date()): LandingSocialProofStat[] {
  const moscow = getMoscowParts(now);
  const totalAnswers = totalAnswersNow(moscow);
  const totalUsers = totalUsersNow(totalAnswers, moscow);
  const online = onlineNow(moscow);

  return [
    {
      key: "users",
      value: formatGrouped(totalUsers),
      label: "пользователей",
    },
    {
      key: "total",
      value: formatGrouped(totalAnswers),
      label: "получили ответ",
    },
    {
      key: "online",
      value: formatGrouped(online),
      label: "сейчас на сайте",
      live: true,
    },
  ];
}
