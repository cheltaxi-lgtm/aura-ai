/**
 * Cabinet modules for Telegram bot (read/list + light actions).
 * Heavy generation stays on site URLs when needed (photo upload, natal report pay).
 */
import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  getCabinetPhotoSpreads,
  getCabinetProfile,
  getCabinetStats,
  getCabinetSessions,
} from "@/lib/cabinet-data";
import { CHARACTERS } from "@/lib/characters";
import { listJointReadingsForUser, buildJointReadingUrl } from "@/lib/joint-reading-service";
import { listFacts } from "@/lib/memory/user-facts";
import { getMemoryPreferences } from "@/lib/memory/preferences";
import { listMemoryContextReceipts } from "@/lib/memory/context-receipts";
import { memorySourceLabel } from "@/lib/memory/presentation";
import { listUserMatrixReports } from "@/lib/services/numerology-report-service";
import { getStoredNatalChart } from "@/lib/services/natal-chart-service";
import { bigThree } from "@/lib/natal/presentation";
import { listUserRituals, ritualToClient, getCabinetRitualStats } from "@/lib/ritual-service";
import {
  addUserSupportMessage,
  createSupportTicket,
  listUserSupportTickets,
  getSupportTicketMessages,
  getUserSupportTicket,
} from "@/lib/support-service";
import { emailSupportTicketCreated } from "@/lib/email/support-notify";
import { getAccountDeliverableEmail } from "@/lib/reminder-contacts";
import { getUserById } from "@/lib/users";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { hasPaidAccess } from "@/lib/session";
import {
  isSessionChatQuestionCapReached,
  SESSION_CHAT_LIMIT_MESSAGE,
} from "@/lib/session-limits";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import {
  chargeChatBilling,
  type ChatBillingHandle,
} from "@/lib/services/billing-service";
import {
  ChatOrchestrator,
  parseChatRequest,
} from "@/lib/services/chat-orchestrator";
import { query } from "@/lib/db";

function masterDisplayName(key: string | null | undefined): string | null {
  if (!key?.trim()) return null;
  const id = key.trim().toLowerCase();
  if (id === "numerolog") return "Эвелина";
  const hit = CHARACTERS.find((c) => c.id === id);
  return hit?.name ?? key;
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

async function requireLinked(telegramUserId: number) {
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.accountId || !resolved.profileUserId) {
    return {
      ok: false as const,
      error: "needs_link" as const,
      message: "Привяжите аккаунт Zovus.",
      linkUrl: resolved.linkUrl,
    };
  }
  return { ok: true as const, resolved };
}

export async function botCabinetOverview(telegramUserId: number) {
  const gate = await requireLinked(telegramUserId);
  if (!gate.ok) return gate;
  const { resolved } = gate;
  const pid = resolved.profileUserId!;
  const aid = resolved.accountId!;
  const site = siteBase();
  const utm = "utm_source=telegram&utm_medium=bot&utm_campaign=cabinet";

  const [
    balance,
    natal,
    rituals,
    ritualStats,
    joints,
    facts,
    tickets,
    matrices,
    photos,
    profile,
    stats,
    sessionsMeta,
    unlimited,
    memoryPreferences,
    memoryReceipts,
  ] = await Promise.all([
    getRuneBalance(pid),
    getStoredNatalChart(pid),
    listUserRituals(pid).catch(() => []),
    getCabinetRitualStats(pid).catch(() => null),
    listJointReadingsForUser(pid, 5).catch(() => []),
    listFacts(pid, 5).catch(() => []),
    listUserSupportTickets(aid).catch(() => []),
    listUserMatrixReports(pid, 50).catch(() => []),
    getCabinetPhotoSpreads(pid).catch(() => []),
    getCabinetProfile(pid, resolved.email || "", resolved.name || "Гость").catch(() => null),
    getCabinetStats(pid).catch(() => ({
      totalSessions: 0,
      favoriteMaster: null,
      daysWithUs: 0,
      totalCards: 0,
    })),
    getCabinetSessions(pid, 1, 0).catch(() => ({ sessions: [], total: 0 })),
    resolveUnlimitedAccess({ accountId: aid, profileUserId: pid }).catch(() => false),
    getMemoryPreferences(pid),
    listMemoryContextReceipts(pid),
  ]);

  const western = natal?.western ?? null;
  const timeKnown = Boolean(natal?.timeKnown);
  const natalSummary = western ? bigThree(western, timeKnown) : [];
  const placeLabel = natal?.place?.label || null;
  const userRow = await getUserById(pid).catch(() => null);

  return {
    ok: true as const,
    runeBalance: balance,
    profile: {
      name: profile?.name || resolved.name || userRow?.name || "Гость",
      email: profile?.email || resolved.email || null,
      zodiac: profile?.zodiac || userRow?.zodiac || null,
      birthDate: profile?.birthDate || userRow?.birth_date || null,
      memberSince: profile?.createdAt || null,
      linked: true,
      unlimited: Boolean(unlimited),
    },
    stats: {
      totalSessions: Math.max(stats.totalSessions, sessionsMeta.total),
      totalCards: stats.totalCards,
      daysWithUs: stats.daysWithUs,
      favoriteMaster: stats.favoriteMaster,
      favoriteMasterName: masterDisplayName(stats.favoriteMaster),
      matrices: matrices.length,
      photos: photos.length,
      rituals: rituals.length,
      joints: joints.length,
      openTickets: tickets.filter(
        (t) => t.status !== "closed" && t.status !== "resolved"
      ).length,
    },
    natal: natal
      ? {
          hasChart: true,
          bigThree: natalSummary,
          place: placeLabel,
          url: `${site}/cabinet/astrology?${utm}`,
        }
      : {
          hasChart: false,
          bigThree: [] as string[],
          place: null,
          url: `${site}/cabinet/astrology?${utm}`,
        },
    rituals: {
      stats: ritualStats,
      recent: rituals.slice(0, 5).map((r) => {
        const c = ritualToClient(r);
        return {
          id: c.id,
          title: String(c.ritualType || "Обряд"),
          status: c.status,
          characterKey: c.characterKey,
        };
      }),
      url: `${site}/cabinet?${utm}`,
    },
    joint: {
      items: joints.map((j) => ({
        token: j.token,
        status: j.status,
        url: buildJointReadingUrl(j.token),
        createdAt: String(j.created_at),
      })),
      url: `${site}/joint-reading?${utm}`,
    },
    memory: facts.map((f) => ({
      id: f.id,
      fact: f.fact.slice(0, 180),
      category: f.category,
      source: memorySourceLabel(f.sourceType),
      capturedAt: f.sourceCapturedAt,
    })),
    memoryStatus: { enabled: memoryPreferences.memoryEnabled, autoCapture: memoryPreferences.autoCaptureEnabled },
    memoryContexts: memoryReceipts.map(r => ({ product: memorySourceLabel(r.product), factsCount: r.facts.length })),
    support: {
      tickets: tickets.slice(0, 5).map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        preview: t.last_message_preview?.slice(0, 120) ?? "",
      })),
      url: `${site}/cabinet/support?${utm}`,
    },
    numerology: {
      matrices: matrices.slice(0, 5).map((m) => ({
        id: m.id,
        birthDate: m.birthDate,
        createdAt: m.createdAt,
      })),
      url: `${site}/cabinet?${utm}`,
    },
    photo: {
      items: photos.slice(0, 5).map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        master: p.characterName,
      })),
      url: `${site}/photo-rasklad?${utm}`,
    },
    urls: {
      memory: `${site}/cabinet?tab=memory&${utm}`,
      cabinet: `${site}/cabinet?${utm}`,
      runes: `${site}/cabinet?shop=1&${utm}`,
      astrology: `${site}/cabinet/astrology?${utm}`,
      photo: `${site}/photo-rasklad?${utm}`,
      joint: `${site}/joint-reading?${utm}`,
      support: `${site}/cabinet/support?${utm}`,
    },
  };
}

export async function botNatalSummary(telegramUserId: number) {
  const overview = await botCabinetOverview(telegramUserId);
  if (!overview.ok) return overview;
  return { ok: true as const, natal: overview.natal, url: overview.urls.astrology };
}

/** @deprecated prefer botMatrixSummary from bot-matrix-service */
export async function botMatrixFree(telegramUserId: number) {
  const { botMatrixSummary } = await import("@/lib/telegram/bot-matrix-service");
  return botMatrixSummary(telegramUserId);
}

export async function botSupportList(telegramUserId: number) {
  const gate = await requireLinked(telegramUserId);
  if (!gate.ok) return gate;
  const tickets = await listUserSupportTickets(gate.resolved.accountId!);
  return {
    ok: true as const,
    tickets: tickets.slice(0, 10).map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      preview: t.last_message_preview?.slice(0, 160) ?? "",
    })),
    url: `${siteBase()}/cabinet/support?utm_source=telegram&utm_medium=bot`,
  };
}

export async function botSupportCreate(input: {
  telegramUserId: number;
  subject: string;
  message: string;
}) {
  const gate = await requireLinked(input.telegramUserId);
  if (!gate.ok) return gate;
  try {
    const rawMessage = input.message.slice(0, 4000);
    const rawSubject = input.subject.trim().slice(0, 100);
    const subject =
      rawSubject ||
      `Telegram: ${rawMessage.replace(/\s+/g, " ").slice(0, 72)}` ||
      "Вопрос из Telegram";
    const created = await createSupportTicket({
      userAccountId: gate.resolved.accountId!,
      subject,
      category: "general",
      message: rawMessage,
    });

    const { rows } = await query<{ name: string | null }>(
      `SELECT name FROM user_accounts WHERE id = $1 LIMIT 1`,
      [gate.resolved.accountId!]
    );
    const account = rows[0];
    const deliverable = await getAccountDeliverableEmail(gate.resolved.accountId!).catch(
      () => null
    );
    if (deliverable) {
      void emailSupportTicketCreated({
        userEmail: deliverable,
        userName: account?.name?.trim() || deliverable,
        ticketId: created.ticket.id,
        subject: created.ticket.subject,
        category: created.ticket.category,
        messagePreview: rawMessage.slice(0, 280),
      });
    }

    return {
      ok: true as const,
      ticketId: created.ticket.id,
      autoReply: created.autoReply.content?.slice(0, 1000) ?? "",
    };
  } catch (err) {
    console.error("[bot-support] create", err);
    return { ok: false as const, error: "internal" as const, message: "Не удалось создать обращение." };
  }
}

export async function botSupportReply(input: {
  telegramUserId: number;
  ticketId: string;
  message: string;
}) {
  const gate = await requireLinked(input.telegramUserId);
  if (!gate.ok) return gate;
  const ticket = await getUserSupportTicket(gate.resolved.accountId!, input.ticketId);
  if (!ticket) {
    return { ok: false as const, error: "not_found" as const, message: "Обращение не найдено." };
  }
  try {
    const msg = await addUserSupportMessage({
      userAccountId: gate.resolved.accountId!,
      ticketId: input.ticketId,
      content: input.message.slice(0, 4000),
    });
    const thread = await getSupportTicketMessages(input.ticketId);
    return {
      ok: true as const,
      messageId: msg?.id ?? null,
      messages: thread.slice(-6).map((m) => ({
        role: m.sender_type,
        content: m.content.slice(0, 500),
      })),
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "internal";
    return {
      ok: false as const,
      error: code === "ticket_closed" ? "closed" : "internal",
      message: code === "ticket_closed" ? "Обращение закрыто." : "Не удалось отправить.",
    };
  }
}

async function assistantReplyForUserMessage(
  sessionId: string,
  profileUserId: string,
  userMessage: string
): Promise<string> {
  const { rows } = await query<{ content: string }>(
    `WITH latest_user AS (
       SELECT cm.created_at
       FROM chat_messages cm
       INNER JOIN sessions s ON s.id = cm.session_id AND s.user_id = $2
       WHERE cm.session_id = $1
         AND cm.role = 'user'
         AND cm.content = $3
       ORDER BY cm.created_at DESC
       LIMIT 1
     )
     SELECT answer.content
     FROM latest_user asked
     JOIN LATERAL (
       SELECT cm.content
       FROM chat_messages cm
       WHERE cm.session_id = $1
         AND cm.role = 'assistant'
         AND cm.created_at >= asked.created_at
       ORDER BY cm.created_at ASC
       LIMIT 1
     ) answer ON TRUE`,
    [sessionId, profileUserId, userMessage]
  );
  return rows[0]?.content?.trim() ?? "";
}

function extractReplyFromChatBody(raw: string, contentType: string): string {
  if (contentType.includes("application/json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const t = j.reply ?? j.message ?? j.content;
      if (typeof t === "string" && t.trim()) return t.trim();
    } catch {
      /* fall through */
    }
  }
  let out = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload) as Record<string, unknown>;
      if (typeof j.reply === "string" && j.reply.trim()) return j.reply.trim();
      if (typeof j.text === "string") out += j.text;
      else if (typeof j.delta === "string") out += j.delta;
      else if (typeof j.content === "string") out += j.content;
    } catch {
      /* ignore */
    }
  }
  return out.trim();
}

export async function botChatFollowUp(input: {
  telegramUserId: number;
  sessionId: string;
  message: string;
  clientEventId?: string;
  expectedCost?: number;
}): Promise<
  | { ok: true; reply: string; sessionId: string; runeBalance: number; reused?: boolean }
  | { ok: false; error: string; message: string; linkUrl?: string; runeBalance?: number; cost?: number }
> {
  const gate = await requireLinked(input.telegramUserId);
  if (!gate.ok) {
    return { ok: false, error: gate.error, message: gate.message, linkUrl: gate.linkUrl };
  }
  const accountId = gate.resolved.accountId!;
  const profileUserId = gate.resolved.profileUserId!;
  const message = input.message.trim().slice(0, 2000);
  if (message.length < 1) {
    return { ok: false, error: "invalid", message: "Пустое сообщение." };
  }

  const { rows: sessRows } = await query<{ character_key: string | null }>(
    `SELECT character_key FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [input.sessionId, profileUserId]
  );
  const characterId = sessRows[0]?.character_key || "veronika";

  let billingHandle: ChatBillingHandle | null = null;

  try {
    const parsed = await parseChatRequest({
      characterId,
      sessionId: input.sessionId,
      messages: [{ role: "user", content: message }],
    });
    if (!parsed.ok) {
      return { ok: false, error: "invalid", message: "Не удалось принять сообщение." };
    }
    const canonicalMessage =
      parsed.parsed.messages[parsed.parsed.messages.length - 1]?.content ?? message;

    const prep = await ChatOrchestrator.prepare(accountId, parsed.parsed);
    if (!prep.ok) {
      return { ok: false, error: "session", message: "Сессия недоступна." };
    }

    if (typeof input.expectedCost === "number" && prep.billingParams.session) {
      const { session, unlimited, freeLimit } = prep.billingParams;
      const settings = await getRuneSettings();
      const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, settings);
      const fullAccess = hasPaidAccess(session, { unlimited });
      const isFree = !fullAccess && session.free_questions_used < freeLimit;
      const actualCost = useRuneBilling && !isFree
        ? runeCostFromSettings(settings, "QUESTION")
        : 0;
      if (actualCost !== input.expectedCost) {
        return {
          ok: false,
          error: "price_changed",
          message: "Стоимость вопроса изменилась. Подтвердите новую цену.",
          runeBalance: await getRuneBalance(profileUserId),
          cost: actualCost,
        };
      }
    }

    const billing = await chargeChatBilling({
      ...prep.billingParams,
      idempotencyKey: input.clientEventId
        ? `bot-chat:${input.telegramUserId}:${input.clientEventId}`
        : undefined,
      maxCost: input.expectedCost,
    });
    if (!billing.ok) {
      const body = await billing.response.json().catch(() => ({}));
      const bal = typeof body.balance === "number" ? body.balance : undefined;
      const cost = typeof body.required === "number" ? body.required : undefined;
      const billingError = typeof body.error === "string" ? body.error : "insufficient_runes";
      return {
        ok: false,
        error: billingError,
        message:
          typeof body.message === "string"
            ? body.message
            : "Недостаточно рун для вопроса. Отправьте /runes и выберите пакет ЮKassa.",
        runeBalance: bal,
        cost,
      };
    }

    billingHandle = billing.handle;
    if (billing.handle.charge?.deduplicated) {
      const priorReply = await assistantReplyForUserMessage(
        input.sessionId,
        profileUserId,
        canonicalMessage
      );
      const runeBalance = await getRuneBalance(profileUserId);
      if (priorReply) {
        return {
          ok: true,
          reply: priorReply,
          sessionId: input.sessionId,
          runeBalance,
          reused: true,
        };
      }
      return {
        ok: false,
        error: "pending",
        message: "Ответ уже формируется. Откройте разбор чуть позже.",
        runeBalance,
      };
    }
    prep.orchestrator.applyBilling(billing.handle, billing.session);
    const response = await prep.orchestrator.run();
    const raw = await response.text();
    let reply = extractReplyFromChatBody(raw, response.headers.get("content-type") || "");
    if (!reply) {
      reply = await assistantReplyForUserMessage(
        input.sessionId,
        profileUserId,
        canonicalMessage
      );
    }
    if (!reply) {
      await billing.handle.rollbackOnError();
      return { ok: false, error: "generation_failed", message: "Ответ не сложился. Руны возвращены." };
    }

    const runeBalance = await getRuneBalance(profileUserId);
    return { ok: true, reply, sessionId: input.sessionId, runeBalance };
  } catch (err) {
    console.error("[bot-chat]", err);
    if (billingHandle) {
      try {
        await billingHandle.rollbackOnError();
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: "internal", message: "Ошибка чата. Попробуйте позже." };
  }
}

export async function botChatQuote(input: {
  telegramUserId: number;
  sessionId: string;
}): Promise<
  | {
      ok: true;
      sessionId: string;
      cost: number;
      runeBalance: number;
      free: boolean;
      canAfford: boolean;
    }
  | { ok: false; error: string; message: string; linkUrl?: string }
> {
  const gate = await requireLinked(input.telegramUserId);
  if (!gate.ok) {
    return { ok: false, error: gate.error, message: gate.message, linkUrl: gate.linkUrl };
  }
  const accountId = gate.resolved.accountId!;
  const profileUserId = gate.resolved.profileUserId!;
  const { rows } = await query<{ character_key: string | null }>(
    `SELECT character_key FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [input.sessionId, profileUserId]
  );
  if (!rows[0]) {
    return { ok: false, error: "session", message: "Сессия недоступна." };
  }

  const parsed = await parseChatRequest({
    characterId: rows[0].character_key || "veronika",
    sessionId: input.sessionId,
    messages: [{ role: "user", content: "Уточняющий вопрос" }],
  });
  if (!parsed.ok) {
    return { ok: false, error: "invalid", message: "Не удалось проверить стоимость вопроса." };
  }
  const prep = await ChatOrchestrator.prepare(accountId, parsed.parsed);
  if (!prep.ok || !prep.billingParams.session) {
    return { ok: false, error: "session", message: "Сессия недоступна." };
  }

  const { session, unlimited, freeLimit } = prep.billingParams;
  if (isSessionChatQuestionCapReached(session.free_questions_used)) {
    return { ok: false, error: "session_question_limit", message: SESSION_CHAT_LIMIT_MESSAGE };
  }
  const runeBalance = await getRuneBalance(profileUserId);
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);
  const hasFullAccess = hasPaidAccess(session, { unlimited });
  const free = !hasFullAccess && session.free_questions_used < freeLimit;
  if (!useRuneBilling && !hasFullAccess && !free) {
    return {
      ok: false,
      error: "paywall",
      message: "Для этой сессии уточняющие вопросы сейчас недоступны.",
    };
  }
  const cost = useRuneBilling && !free ? runeCostFromSettings(runeSettings, "QUESTION") : 0;

  return {
    ok: true,
    sessionId: input.sessionId,
    cost,
    runeBalance,
    free,
    canAfford: cost === 0 || runeBalance >= cost,
  };
}
