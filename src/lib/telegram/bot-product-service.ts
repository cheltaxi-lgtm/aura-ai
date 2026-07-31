/**
 * Thin product surface for Telegram bot ↔ site parity.
 * Site Postgres remains source of truth; bot calls these via /api/internal/bot/*.
 */
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { formatReversedCardName } from "@/lib/card-orientation";
import { buildCharacterPrompt, generateReading } from "@/lib/chat-prompts";
import {
  DailyReadingLockedError,
  getOrCreateDailyReading,
} from "@/lib/daily-energy";
import {
  drawSpread,
  resolveMasterDeckSystem,
  resolveSpreadDeckSystem,
} from "@/lib/decks";
import {
  BillingService,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  createSession,
  deleteConsultationSession,
  unlockSingleSession,
  updateSessionChatMeta,
} from "@/lib/session";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import { isPaidSpreadTextComplete } from "@/lib/spread-reading-complete";
import { getCabinetSessions } from "@/lib/cabinet-data";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { sanitizeReadingForClient, stripMemoryLeakFromReply } from "@/lib/chat-sanitize";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import { createHistoryEntry, getUserById } from "@/lib/users";
import { query } from "@/lib/db";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";
import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";
import { resolveIntentCopy } from "@/lib/spread-intents/gender-copy";
import { resolveIntentMasterId } from "@/lib/spread-intents/resolve-master";
import { getSpread, resolveSpreadPositions } from "@/lib/spreads";
import { resolveSpreadCost } from "@/lib/spreads/spread-pricing";
import type { SessionTopicId } from "@/lib/session-topics";

const POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;

export type BotCard = {
  id: number;
  name: string;
  reversed: boolean;
  position: number;
  positionLabel: string;
  meaning: string;
};

function historyKind(s: {
  characterKey: string;
  intention?: string | null;
  spreadId?: string | null;
  spreadType?: string | null;
}): "matrix" | "photo" | "spread" {
  if (
    s.spreadId === "destiny_matrix" ||
    s.intention === "destiny_matrix" ||
    s.characterKey === "numerolog"
  ) {
    return "matrix";
  }
  if (s.spreadType === "photo") return "photo";
  return "spread";
}

export async function botHistory(profileUserId: string, limit = 8) {
  const { sessions, total } = await getCabinetSessions(profileUserId, limit, 0);
  return {
    total,
    items: sessions.map((s) => {
      const kind = historyKind(s);
      const topic =
        kind === "matrix"
          ? "Матрица судьбы"
          : kind === "photo"
            ? s.topicSummary?.trim() || "Расклад по фото"
            : s.topicSummary;
      return {
        sessionId: s.sessionId ?? s.id,
        characterKey: s.characterKey,
        kind,
        date: s.sessionDate,
        topic,
        cards: s.keyCards,
        preview: (s.prediction || "").slice(0, 280),
      };
    }),
  };
}

export async function botHistoryDelete(profileUserId: string, sessionId: string) {
  const id = sessionId.trim();
  if (!id) return { ok: false as const, error: "not_found" as const };
  const ok = await deleteConsultationSession(id, profileUserId);
  if (!ok) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, deleted: true as const };
}

export async function botReadingDetail(profileUserId: string, sessionId: string) {
  const { rows } = await query<{
    id: string;
    character_key: string | null;
    intention: string | null;
    cards: string[] | null;
    content: string | null;
  }>(
    `SELECT s.id, s.character_key, s.intention, s.cards,
            (
              SELECT cm.content FROM chat_messages cm
              WHERE cm.session_id = s.id AND cm.role = 'assistant'
              ORDER BY cm.created_at ASC
              LIMIT 1
            ) AS content
     FROM sessions s
     WHERE s.id = $1 AND s.user_id = $2
     LIMIT 1`,
    [sessionId, profileUserId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    characterKey: row.character_key,
    intention: row.intention,
    cards: row.cards ?? [],
    reading: row.content ?? "",
  };
}

function orientCards(
  drawn: Array<{ id: number; name: string; meaning: string; reversed?: boolean }>,
  positionLabels: string[] = [...POSITIONS]
): BotCard[] {
  return drawn.map((c, i) => {
    const reversed = c.reversed ?? Math.random() < 0.45;
    return {
      id: c.id,
      name: c.name,
      reversed,
      position: i,
      positionLabel: positionLabels[i] ?? `Позиция ${i + 1}`,
      meaning: c.meaning,
    };
  });
}

export type BotSpreadResult =
  | {
      ok: true;
      sessionId: string;
      cards: BotCard[];
      reading: string;
      runeBalance: number;
      charged: number;
      free: boolean;
      masterId?: string;
      spreadId?: string;
      cost?: number;
      intentSlug?: string;
    }
  | {
      ok: false;
      error:
        | "needs_link"
        | "needs_onboarding"
        | "insufficient_runes"
        | "generation_failed"
        | "site_only"
        | "not_found"
        | "internal";
      message: string;
      runeBalance?: number;
      cost?: number;
      linkUrl?: string;
    };

function intentTopicHint(category: string, spreadId: string): SessionTopicId | null {
  if (spreadId === "triplet-love" || category === "love") return "love";
  return null;
}

/** Full Veronika triplet on site (same billing rules as /api/reading). */
export async function botRunVeronikaSpread(input: {
  telegramUserId: number;
  question: string;
}): Promise<BotSpreadResult> {
  const resolved = await resolveBotUser(input.telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return {
      ok: false,
      error: "needs_link",
      message: "Сначала привяжите аккаунт Zovus — тогда расклад и история будут общими с сайтом.",
      linkUrl: resolved.linkUrl,
    };
  }
  if (resolved.needsOnboarding) {
    return {
      ok: false,
      error: "needs_onboarding",
      message: "Завершите профиль (город и дата рождения) — в боте или в кабинете на сайте.",
      linkUrl: resolved.linkUrl,
    };
  }

  const profileUserId = resolved.profileUserId;
  const user = await getUserById(profileUserId);
  if (!user) {
    return { ok: false, error: "internal", message: "Профиль не найден." };
  }

  const question = input.question.trim().slice(0, 500);
  if (question.length < 3) {
    return { ok: false, error: "internal", message: "Слишком короткий вопрос." };
  }

  const system = resolveMasterDeckSystem("veronika");
  const cards = orientCards(drawSpread(system, 3));
  const cardNames = cards.map((c) => formatReversedCardName(c.name, c.reversed));

  const session = await createSession(undefined, profileUserId);
  await updateSessionChatMeta(session.id, {
    characterKey: "veronika",
    intention: "custom",
    spreadType: "new",
    spreadId: "triplet",
    cards: cardNames,
  });

  const unlimited = await resolveUnlimitedAccess({
    accountId: resolved.accountId,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  let billingCharge: Awaited<ReturnType<typeof BillingService.chargeRuneAction>> | null = null;
  let runeBalance = await getRuneBalance(profileUserId);
  let charged = 0;

  if (useRuneBilling) {
    try {
      billingCharge = await BillingService.chargeRuneAction({
        userId: profileUserId,
        action: "READING",
      });
      runeBalance = billingCharge.newBalance;
      charged = billingCharge.spentRunes;
      await unlockSingleSession(session.id);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return {
          ok: false,
          error: "insufficient_runes",
          message: `Недостаточно рун: нужно ${err.required}, на балансе ${err.balance}. Пополните на сайте.`,
          runeBalance: err.balance,
          cost: err.required,
          linkUrl: botRunesShopUrl("product"),
        };
      }
      throw err;
    }
  }

  const userName = normalizePersonDisplayNameOr(
    user.name || resolved.name,
    "друг"
  );
  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const systemPrompt = buildCharacterPrompt(
    "veronika",
    {
      userName,
      gender: user.gender || "female",
      zodiac: user.zodiac || "Овен",
      birthDate: user.birth_date || "",
      today,
      tarotCards: cards.map((c) => ({ name: c.name, meaning: c.meaning })),
      isPaid: charged > 0 || !useRuneBilling,
      mainQuestion: question,
    },
    {
      intention: "custom",
      customQuestion: question,
      spreadId: "triplet",
      spreadType: "new",
      positionLabels: [...POSITIONS],
    }
  );

  try {
    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards: cards.map((c) => ({ name: c.name, meaning: c.meaning })),
      isPaid: charged > 0 || !useRuneBilling,
      characterId: "veronika",
      intention: "custom",
      spreadId: "triplet",
      positionLabels: [...POSITIONS],
      userMessage: `Вопрос клиента: ${question}`,
    });

    const reading = sanitizeReadingForClient(
      stripMemoryLeakFromReply(generated.text) || generated.text,
      cards.map((c) => c.name)
    );

    const ok =
      generated.fromLlm &&
      Boolean(reading?.trim()) &&
      isPaidSpreadTextComplete(
        reading,
        cards.map((c) => c.name)
      );

    if (!ok) {
      if (billingCharge) {
        runeBalance = await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: "READING",
          transactionId: billingCharge.transactionId,
        });
      }
      return {
        ok: false,
        error: "generation_failed",
        message: "Разбор не сложился. Руны не списаны — попробуйте ещё раз.",
        runeBalance,
      };
    }

    await createHistoryEntry({
      userId: profileUserId,
      characterName: "veronika",
      isPaid: charged > 0,
      contextData: {
        type: "reading",
        cards: cardNames,
        interpretation: reading,
        question,
        sessionId: session.id,
        source: "telegram_bot",
      },
    });

    await ensureSpreadReadingInChatMessages({
      sessionId: session.id,
      profileUserId,
      characterId: "veronika",
      reading,
      tarotCards: cards.map((c) => ({ name: c.name })),
      intention: "custom",
      spreadType: "new",
      spreadId: "triplet",
      customQuestion: question,
    });

    return {
      ok: true,
      sessionId: session.id,
      cards,
      reading,
      runeBalance,
      charged,
      free: charged === 0,
      masterId: "veronika",
      spreadId: "triplet",
      cost: charged || undefined,
    };
  } catch (err) {
    console.error("[bot-product] spread failed", err);
    if (billingCharge) {
      try {
        await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: "READING",
          transactionId: billingCharge.transactionId,
        });
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: "generation_failed",
      message: "Разбор не сложился. Попробуйте позже.",
    };
  }
}

/**
 * Full catalog intent — site geometry, recommended master, INTENTION_SPREAD pricing.
 * Partner-info intents are rejected (site_only).
 */
export async function botRunCatalogIntent(input: {
  telegramUserId: number;
  intentSlug: string;
}): Promise<BotSpreadResult> {
  const resolved = await resolveBotUser(input.telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return {
      ok: false,
      error: "needs_link",
      message: "Сначала привяжите аккаунт Zovus — тогда расклад и история будут общими с сайтом.",
      linkUrl: resolved.linkUrl,
    };
  }
  if (resolved.needsOnboarding) {
    return {
      ok: false,
      error: "needs_onboarding",
      message: "Завершите профиль (город и дата рождения) — в боте или в кабинете на сайте.",
      linkUrl: resolved.linkUrl,
    };
  }

  const intent = getSpreadIntentBySlug(input.intentSlug.trim());
  if (!intent) {
    return { ok: false, error: "not_found", message: "Расклад не найден в каталоге." };
  }
  if (intent.requiresPartnerInfo) {
    return {
      ok: false,
      error: "site_only",
      message: "Этот расклад с данными партнёра — откройте на сайте.",
      linkUrl: resolved.linkUrl,
    };
  }

  const copy = resolveIntentCopy(intent, resolved.gender);
  const question = (copy.questionTemplate || intent.questionTemplate || "").trim().slice(0, 500);
  if (question.length < 3) {
    return {
      ok: false,
      error: "site_only",
      message: "Этот расклад лучше открыть на сайте.",
      linkUrl: resolved.linkUrl,
    };
  }

  const profileUserId = resolved.profileUserId;
  const user = await getUserById(profileUserId);
  if (!user) {
    return { ok: false, error: "internal", message: "Профиль не найден." };
  }

  const spreadId = intent.spreadId;
  const spread = getSpread(spreadId);
  const masterId = resolveIntentMasterId(intent);
  const topicHint = intentTopicHint(intent.category, spreadId);
  const positionLabels = resolveSpreadPositions(spreadId, topicHint).map((p) => p.label);
  const cardCount = Math.max(1, spread.cardCount || positionLabels.length || 3);
  const system = resolveSpreadDeckSystem(spreadId, masterId);
  const cards = orientCards(drawSpread(system, cardCount), positionLabels);
  const cardNames = cards.map((c) => formatReversedCardName(c.name, c.reversed));

  const session = await createSession(undefined, profileUserId);
  await updateSessionChatMeta(session.id, {
    characterKey: masterId,
    intention: "custom",
    spreadType: "new",
    spreadId,
    cards: cardNames,
  });

  const unlimited = await resolveUnlimitedAccess({
    accountId: resolved.accountId,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);
  const spreadCost = resolveSpreadCost(spreadId, runeSettings);

  let billingCharge: BillingChargeResult | null = null;
  let runeBalance = await getRuneBalance(profileUserId);
  let charged = 0;

  if (useRuneBilling) {
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost: spreadCost,
        actionType: "INTENTION_SPREAD",
      });
      runeBalance = billingCharge.newBalance;
      charged = billingCharge.spentRunes;
      await unlockSingleSession(session.id);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return {
          ok: false,
          error: "insufficient_runes",
          message: `Недостаточно рун: нужно ${err.required}, на балансе ${err.balance}. Пополните на сайте.`,
          runeBalance: err.balance,
          cost: err.required,
          linkUrl: botRunesShopUrl("product"),
        };
      }
      throw err;
    }
  }

  const userName = normalizePersonDisplayNameOr(user.name || resolved.name, "друг");
  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isPaid = charged > 0 || !useRuneBilling;
  const systemPrompt = buildCharacterPrompt(
    masterId,
    {
      userName,
      gender: user.gender || resolved.gender || "female",
      zodiac: user.zodiac || "Овен",
      birthDate: user.birth_date || "",
      today,
      tarotCards: cards.map((c) => ({ name: c.name, meaning: c.meaning })),
      isPaid,
      mainQuestion: question,
    },
    {
      intention: "custom",
      customQuestion: question,
      spreadId,
      spreadType: "new",
      positionLabels,
    }
  );

  try {
    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards: cards.map((c) => ({ name: c.name, meaning: c.meaning })),
      isPaid,
      characterId: masterId,
      intention: "custom",
      spreadId,
      positionLabels,
      userMessage: `Вопрос клиента: ${question}`,
    });

    const reading = sanitizeReadingForClient(
      stripMemoryLeakFromReply(generated.text) || generated.text,
      cards.map((c) => c.name)
    );

    const ok =
      generated.fromLlm &&
      Boolean(reading?.trim()) &&
      isPaidSpreadTextComplete(
        reading,
        cards.map((c) => c.name)
      );

    if (!ok) {
      if (billingCharge) {
        runeBalance = await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: "INTENTION_SPREAD",
          transactionId: billingCharge.transactionId,
        });
      }
      return {
        ok: false,
        error: "generation_failed",
        message: "Разбор не сложился. Руны не списаны — попробуйте ещё раз.",
        runeBalance,
        cost: spreadCost,
      };
    }

    await createHistoryEntry({
      userId: profileUserId,
      characterName: masterId,
      isPaid: charged > 0,
      contextData: {
        type: "intention_spread",
        intention: "custom",
        spreadId,
        customQuestion: question,
        interpretation: reading,
        reading,
        cards: cardNames,
        tarotCards: cards.map((c) => ({
          name: c.name,
          meaning: `${c.positionLabel}: ${c.meaning}`,
        })),
        deckSystem: system,
        system,
        sessionId: session.id,
        source: "telegram_bot",
        intentSlug: intent.slug,
      },
    });

    await ensureSpreadReadingInChatMessages({
      sessionId: session.id,
      profileUserId,
      characterId: masterId,
      reading,
      tarotCards: cards.map((c) => ({ name: c.name })),
      intention: "custom",
      spreadType: "new",
      spreadId,
      customQuestion: question,
    });

    return {
      ok: true,
      sessionId: session.id,
      cards,
      reading,
      runeBalance,
      charged,
      free: charged === 0,
      masterId,
      spreadId,
      cost: charged || spreadCost,
      intentSlug: intent.slug,
    };
  } catch (err) {
    console.error("[bot-product] catalog intent failed", err);
    if (billingCharge) {
      try {
        await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: "INTENTION_SPREAD",
          transactionId: billingCharge.transactionId,
        });
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: "generation_failed",
      message: "Разбор не сложился. Руны не списаны — попробуйте позже.",
      cost: spreadCost,
    };
  }
}

export async function botDailyEnergy(input: {
  telegramUserId: number;
  characterKey?: string;
}): Promise<
  | { ok: true; text: string; cards: Array<{ name: string; reversed: boolean; position: string }>; cached: boolean }
  | { ok: false; error: string; message: string; linkUrl?: string }
> {
  const resolved = await resolveBotUser(input.telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return {
      ok: false,
      error: "needs_link",
      message: "Привяжите аккаунт Zovus, чтобы карта дня совпадала с сайтом.",
      linkUrl: resolved.linkUrl,
    };
  }
  const user = await getUserById(resolved.profileUserId);
  if (!user?.birth_date) {
    return {
      ok: false,
      error: "needs_onboarding",
      message: "Укажите дату рождения в кабинете на сайте.",
      linkUrl: resolved.linkUrl,
    };
  }
  try {
    const result = await getOrCreateDailyReading({
      userId: resolved.profileUserId,
      characterKey: input.characterKey || "veronika",
      name: user.name || resolved.name || "друг",
      zodiac: user.zodiac || "Овен",
      birthDate: user.birth_date,
    });
    return {
      ok: true,
      text: result.text,
      cards: result.cards.map((c) => ({
        name: c.name,
        reversed: c.reversed,
        position: c.position,
      })),
      cached: result.cached,
    };
  } catch (err) {
    if (err instanceof DailyReadingLockedError) {
      return {
        ok: false,
        error: "locked",
        message: "Дневная энергия уже открыта сегодня. Новый расклад — завтра или платный на сайте.",
      };
    }
    console.error("[bot-product] daily", err);
    return { ok: false, error: "internal", message: "Не удалось открыть карту дня." };
  }
}
