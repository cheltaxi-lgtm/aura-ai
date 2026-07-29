import { botConfig } from "../config.js";

export type SiteResolve = {
  ok: boolean;
  linked: boolean;
  accountId: string | null;
  profileUserId: string | null;
  needsOnboarding: boolean;
  name: string | null;
  runeBalance: number | null;
  linkUrl: string;
  error?: string;
};

type Json = Record<string, unknown>;

async function siteFetch<T extends Json>(
  path: string,
  body: Json,
  timeoutMs = 90_000
): Promise<{ status: number; data: T }> {
  const base = botConfig.siteInternalBaseUrl;
  const secret = botConfig.internalSecret;
  if (!base || !secret) {
    return {
      status: 503,
      data: { ok: false, error: "site_bridge_disabled" } as unknown as T,
    };
  }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bot-Internal-Secret": secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({ ok: false, error: "invalid_json" }))) as T;
  return { status: res.status, data };
}

export async function siteResolve(telegramUserId: number): Promise<SiteResolve> {
  const { data } = await siteFetch<SiteResolve & Json>("/api/internal/bot/resolve", {
    telegram_user_id: telegramUserId,
  });
  return {
    ok: Boolean(data.ok),
    linked: Boolean(data.linked),
    accountId: (data.accountId as string) ?? null,
    profileUserId: (data.profileUserId as string) ?? null,
    needsOnboarding: Boolean(data.needsOnboarding),
    name: (data.name as string) ?? null,
    runeBalance: typeof data.runeBalance === "number" ? data.runeBalance : null,
    linkUrl: typeof data.linkUrl === "string" ? data.linkUrl : `${botConfig.siteUrl}/cabinet`,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

export async function siteHistory(telegramUserId: number, limit = 8) {
  return siteFetch<{
    ok: boolean;
    items?: Array<{
      sessionId: string;
      characterKey: string;
      date: string;
      topic: string;
      cards: string[];
      preview: string;
    }>;
    total?: number;
    runeBalance?: number;
    error?: string;
    linkUrl?: string;
  }>("/api/internal/bot/history", { telegram_user_id: telegramUserId, limit });
}

export async function siteSpread(telegramUserId: number, question: string) {
  return siteFetch<{
    ok: boolean;
    sessionId?: string;
    cards?: Array<{
      id: number;
      name: string;
      reversed: boolean;
      position: number;
      positionLabel: string;
      meaning: string;
    }>;
    reading?: string;
    runeBalance?: number;
    charged?: number;
    free?: boolean;
    error?: string;
    message?: string;
    linkUrl?: string;
    cost?: number;
  }>(
    "/api/internal/bot/spread",
    { telegram_user_id: telegramUserId, question },
    120_000
  );
}

export async function siteDaily(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    text?: string;
    cards?: Array<{ name: string; reversed: boolean; position: string }>;
    cached?: boolean;
    error?: string;
    message?: string;
    linkUrl?: string;
  }>("/api/internal/bot/daily", { telegram_user_id: telegramUserId }, 120_000);
}

export async function siteRunes(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    runeBalance?: number;
    shopUrl?: string;
    cabinetUrl?: string;
    error?: string;
    linkUrl?: string;
  }>("/api/internal/bot/runes", { telegram_user_id: telegramUserId });
}

export async function siteModules(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    linked?: boolean;
    linkUrl?: string;
    modules?: Array<{ id: string; title: string; native: boolean; url: string | null }>;
  }>("/api/internal/bot/modules", { telegram_user_id: telegramUserId });
}

export async function siteReading(telegramUserId: number, sessionId: string) {
  return siteFetch<{
    ok: boolean;
    sessionId?: string;
    reading?: string;
    cards?: string[];
    intention?: string | null;
    error?: string;
  }>("/api/internal/bot/reading", {
    telegram_user_id: telegramUserId,
    session_id: sessionId,
  });
}

export async function siteCabinet(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    runeBalance?: number;
    natal?: {
      hasChart: boolean;
      bigThree: string[];
      place: string | null;
      url: string;
    };
    rituals?: {
      stats: Record<string, number> | null;
      recent: Array<{ id: string; title: string; status: string; characterKey: string }>;
      url: string;
    };
    joint?: {
      items: Array<{ token: string; status: string; url: string; createdAt: string }>;
      url: string;
    };
    diary?: Array<{ id: string; characterKey: string; text: string; createdAt: string }>;
    memory?: Array<{ id: string; fact: string; category: string | null }>;
    support?: {
      tickets: Array<{ id: string; subject: string; status: string; preview: string }>;
      url: string;
    };
    numerology?: {
      matrices: Array<{ id: string; birthDate: string; createdAt: string }>;
      url: string;
    };
    photo?: {
      items: Array<{ id?: string; createdAt?: string; master?: string }>;
      url: string;
    };
    urls?: Record<string, string>;
    error?: string;
    message?: string;
    linkUrl?: string;
  }>("/api/internal/bot/cabinet", { telegram_user_id: telegramUserId });
}

export async function siteNatal(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    natal?: {
      hasChart: boolean;
      bigThree: string[];
      place: string | null;
      url: string;
    };
    url?: string;
    error?: string;
    message?: string;
    linkUrl?: string;
  }>("/api/internal/bot/natal", { telegram_user_id: telegramUserId });
}

export async function siteNumerology(telegramUserId: number) {
  return siteFetch<{
    ok: boolean;
    birthDate?: string;
    portrait?: string;
    moneyInsight?: string;
    loveInsight?: string;
    yearInsight?: string;
    keyArcana?: Array<{ role: string; number: number; title: string; shortMeaning: string }>;
    savedReports?: number;
    url?: string;
    error?: string;
    message?: string;
    linkUrl?: string;
  }>("/api/internal/bot/numerology", { telegram_user_id: telegramUserId });
}

export async function siteSupport(
  telegramUserId: number,
  action: "list" | "create" | "reply",
  extra: { subject?: string; message?: string; ticketId?: string } = {}
) {
  return siteFetch<{
    ok: boolean;
    tickets?: Array<{ id: string; subject: string; status: string; preview: string }>;
    ticketId?: string;
    autoReply?: string;
    messageId?: string | null;
    messages?: Array<{ role: string; content: string }>;
    url?: string;
    error?: string;
    message?: string;
    linkUrl?: string;
  }>("/api/internal/bot/support", {
    telegram_user_id: telegramUserId,
    action,
    subject: extra.subject,
    message: extra.message,
    ticket_id: extra.ticketId,
  });
}

export async function siteAuthBridgeConfirm(input: {
  token: string;
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
}) {
  return siteFetch<{
    ok: boolean;
    purpose?: string;
    error?: string;
  }>("/api/internal/bot/auth-bridge", {
    token: input.token,
    telegram_user_id: input.telegramUserId,
    username: input.username ?? undefined,
    first_name: input.firstName ?? undefined,
    photo_url: input.photoUrl ?? undefined,
  });
}

export async function siteChat(telegramUserId: number, sessionId: string, message: string) {
  return siteFetch<{
    ok: boolean;
    reply?: string;
    sessionId?: string;
    runeBalance?: number;
    error?: string;
    message?: string;
    linkUrl?: string;
    cost?: number;
  }>(
    "/api/internal/bot/chat",
    {
      telegram_user_id: telegramUserId,
      session_id: sessionId,
      message,
    },
    120_000
  );
}

/** Split long reading into Telegram-safe chunks. */
export function chunkTelegramText(text: string, max = 3500): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.4) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
