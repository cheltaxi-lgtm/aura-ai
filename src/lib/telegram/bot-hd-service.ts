import { query } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import {
  getOrComputeHdChart,
  listHdChartsForUser,
} from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  computeTransits,
  GATE_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  type HdActivation,
} from "@/lib/human-design";
import { isHumanDesignEnabled } from "@/lib/settings";

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

interface NatalPlaceRow {
  birth_place_label: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tzid: string | null;
}

async function resolveHdIdentity(profileUserId: string) {
  const user = await getUserById(profileUserId);
  if (!user?.birth_date) return null;
  const { rows } = await query<NatalPlaceRow>(
    `SELECT birth_place_label, birth_lat, birth_lon, birth_tzid
     FROM natal_charts WHERE user_id = $1`,
    [profileUserId]
  );
  const natal = rows[0];
  if (
    !natal?.birth_place_label ||
    natal.birth_lat === null ||
    natal.birth_lon === null ||
    !natal.birth_tzid
  ) {
    return null;
  }
  return {
    birthDate: user.birth_date,
    birthTime: user.birth_time ?? null,
    timezone: natal.birth_tzid,
    placeName: natal.birth_place_label,
    lat: natal.birth_lat,
    lon: natal.birth_lon,
  };
}

/** HD summary for the bot: computes (or reuses) the user's own chart. */
export async function botHdSummary(telegramUserId: number) {
  if (!(await isHumanDesignEnabled())) {
    return { ok: false as const, error: "disabled" as const, message: "Модуль временно недоступен." };
  }
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return {
      ok: false as const,
      error: "needs_link" as const,
      message: "Привяжите аккаунт Zovus.",
      linkUrl: resolved.linkUrl,
    };
  }
  const pid = resolved.profileUserId;

  // Fast path: latest self chart already computed.
  const existing = await listHdChartsForUser(pid).catch(() => []);
  const own = existing.find((c) => c.subjectKind !== "other") ?? null;

  let chartRow = own;
  if (!chartRow) {
    const identity = await resolveHdIdentity(pid);
    if (!identity) {
      return {
        ok: false as const,
        error: "needs_birth_data" as const,
        message:
          "Чтобы рассчитать Дизайн Человека, нужны дата, время и место рождения. Заполните профиль на сайте — карта появится автоматически.",
        url: `${siteBase()}/dizayn-cheloveka/rasschitat?utm_source=telegram&utm_medium=bot`,
      };
    }
    try {
      chartRow = (
        await getOrComputeHdChart(identity, pid, { kind: "self", name: null })
      ).row;
    } catch {
      return {
        ok: false as const,
        error: "calc_failed" as const,
        message: "Не удалось рассчитать карту. Попробуйте на сайте.",
        url: `${siteBase()}/dizayn-cheloveka/rasschitat?utm_source=telegram&utm_medium=bot`,
      };
    }
  }

  const c = chartRow.chart;
  const typeMeta = TYPE_META[c.type];
  return {
    ok: true as const,
    hd: {
      type: typeMeta.nameRu,
      strategy: typeMeta.strategyRu,
      authority: AUTHORITY_NAMES_RU[c.authority],
      profile: `${c.profile} · ${PROFILE_NAMES_RU[c.profile] ?? ""}`,
      definedCenters: c.definedCenters.length,
      activeGates: c.activeGates.length,
      timeKnown: chartRow.timeUnknown === false,
    },
    url: `${siteBase()}/dizayn-cheloveka/karta/${chartRow.fingerprint}?utm_source=telegram&utm_medium=bot`,
    cabinetUrl: `${siteBase()}/cabinet/human-design?utm_source=telegram&utm_medium=bot`,
  };
}

/** Short daily transit digest lines for the morning reminder. Null when no chart. */
export async function botHdDailyDigest(telegramUserId: number): Promise<string[] | null> {
  if (!(await isHumanDesignEnabled())) return null;
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) return null;

  const charts = await listHdChartsForUser(resolved.profileUserId).catch(() => []);
  const own = charts.find((c) => c.subjectKind !== "other");
  if (!own) return null;

  const transits = computeTransits();
  const ownGates = new Set(own.chart.activeGates);
  const hits: { body: string; gate: number }[] = [];
  for (const t of transits) {
    if (ownGates.has(t.gate)) hits.push({ body: t.body, gate: t.gate });
  }

  const sun = transits.find((t: HdActivation) => t.body === "sun");
  const lines: string[] = [];
  if (sun) {
    lines.push(
      `Солнце сегодня в воротах ${sun.gate} «${GATE_NAMES_RU[sun.gate] ?? ""}» (линия ${sun.line}).`
    );
  }
  if (hits.length > 0) {
    const gates = hits.slice(0, 3).map((h) => h.gate).join(", ");
    lines.push(`Транзиты активируют ваши ворота: ${gates} — день усиливает ваши темы.`);
  }
  return lines.length ? lines : null;
}
