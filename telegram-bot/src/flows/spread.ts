import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  clearFlow,
  findSessionById,
  getFlow,
  getUser,
  markTimezonePromptShown,
  needsSoftTimezonePrompt,
  setFlow,
  touchStreak,
  trackEvent,
  type BotUser,
} from "../db/repos.js";
import { validateQuestion } from "../domain/question/validate.js";
import { siteCatalogSpread, siteSpread } from "../domain/site-client.js";
import {
  drawnCardsFromSiteCards,
  presentReadingToTelegram,
} from "../domain/reading/present.js";
import {
  ctaKeyboard,
  questionKeyboard,
  salonKeyboard,
  timezoneKeyboard,
} from "../keyboards/index.js";
import { markIrreversible } from "../middleware/irreversible.js";
import { ensureOnboarded, track } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";
import { SPREAD_QUESTION_STEPS } from "./spread-steps.js";
import { pendingOperation, savePaidResult, deliveredOperation } from '../domain/paid-operation.js';

let copyCounter = 0;

/** Pain-chips / free-text entry (from catalog «Свой вопрос»). */
export async function beginCustomQuestion(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;

  setFlow(linked.user.telegram_user_id, "spread", "await_question", {});
  const bal =
    linked.site.runeBalance != null ? `\nБаланс: ${linked.site.runeBalance} рун.` : "";
  await ctx.reply(`${copy.askQuestion(linked.user.telegram_user_id, copyCounter++)}${bal}`, {
    reply_markup: questionKeyboard(),
  });
}

export async function handleChip(ctx: Context, chip: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await runSiteSpread(ctx, linked.user, chip, "chip");
}

export async function handleOwnQuestionPrompt(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  setFlow(linked.user.telegram_user_id, "spread", "await_free_text", {});
  await ctx.reply(copy.ownQuestion(linked.user.telegram_user_id, copyCounter++), {
    reply_markup: salonKeyboard(),
  });
}

export async function handleFreeTextQuestion(ctx: Context, text: string): Promise<boolean> {
  const user = await ensureOnboarded(ctx);
  if (!user) return true;
  const flow = getFlow(user.telegram_user_id);
  if (!flow || flow.flow !== "spread" || !SPREAD_QUESTION_STEPS.has(flow.step)) {
    return false;
  }
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return true;
  await runSiteSpread(ctx, linked.user, text, "free");
  return true;
}

export async function runSpreadQuestion(
  ctx: Context,
  user: BotUser,
  rawQuestion: string,
  source: "chip" | "free" | "catalog"
): Promise<void> {
  await runSiteSpread(ctx, user, rawQuestion, source);
}

/** Catalog item: full geometry + site INTENTION_SPREAD price. */
export async function runCatalogIntent(
  ctx: Context,
  user: BotUser,
  intentSlug: string,
  questionHint?: string
): Promise<void> {
  const slug = intentSlug.trim();
  if (!slug) {
    await ctx.reply(copy.spreadFailed, { reply_markup: salonKeyboard() });
    return;
  }

  track(user, "question_submitted", {
    source: "catalog",
    intent_slug: slug,
    channel: "site",
  });
  const operation = pendingOperation(user.telegram_user_id, 'catalog', { slug, question: questionHint || '' });
  const catalogEventId = operation.id;
  setFlow(user.telegram_user_id, "spread", "drawing", {
    intentSlug: slug,
    question: questionHint || "",
    source: "catalog",
    clientEventId: catalogEventId,
  });

  await ctx.reply(operation.result ? 'Открываю сохранённый ответ. Повторного списания нет.' : copy.shuffling(user.telegram_user_id, copyCounter++)).catch(() => undefined);
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  // Point of no return: the next call may charge runes.
  markIrreversible(ctx);

  let result: Awaited<ReturnType<typeof siteCatalogSpread>>;
  try {
    result = operation.result ? { data: JSON.parse(operation.result), ok: true, status: 200 } as typeof result
      : await siteCatalogSpread(user.telegram_user_id, slug, catalogEventId);
    savePaidResult(operation.id, result.data);
  } catch (err) {
    console.error("[spread] catalog intent failed", err);
    // Keep the drawing flow: re-tapping the same catalog item reuses
    // catalogEventId, so a request that reached the site is not charged twice.
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return;
  }

  try {
    await deliverSiteSpreadResult(ctx, user, operation.result ? { ...result.data, charged: 0, runeBalance: undefined } : result.data, {
      source: "catalog",
      question: questionHint || "",
      spreadIdFallback: result.data.spreadId,
    });
    deliveredOperation(operation.id);
  } catch (err) {
    console.error("[spread] catalog delivery failed after site success", err);
    trackEvent("spread_delivery_failed", user.telegram_user_id, {
      session_id: result.data.sessionId ?? null,
      source: "catalog",
    });
    await ctx
      .reply(copy.spreadSavedOnSite, { reply_markup: salonKeyboard() })
      .catch(() => undefined);
  }
}

async function runSiteSpread(
  ctx: Context,
  user: BotUser,
  rawQuestion: string,
  source: "chip" | "free" | "catalog"
): Promise<void> {
  const validated = validateQuestion(rawQuestion);
  if (!validated.ok) {
    if (validated.code === "crisis") {
      trackEvent("crisis_detected", user.telegram_user_id, { source });
      clearFlow(user.telegram_user_id);
      await ctx.reply(copy.crisis(user.telegram_user_id, copyCounter++), {
        reply_markup: salonKeyboard(),
      });
      return;
    }
    const reason =
      validated.code === "medical"
        ? copy.medical
        : validated.code === "minor" || validated.code === "third_party"
          ? copy.thirdParty
          : validated.reason;
    await ctx.reply(reason, { reply_markup: salonKeyboard() });
    return;
  }

  track(user, "question_submitted", { source, question_len: validated.question.length, channel: "site" });
  const operation = pendingOperation(user.telegram_user_id, 'spread', { question: validated.question });
  const clientEventId = operation.id;
  setFlow(user.telegram_user_id, "spread", "drawing", {
    question: validated.question,
    source,
    clientEventId,
  });

  await ctx.reply(operation.result ? 'Открываю сохранённый ответ. Повторного списания нет.' : copy.shuffling(user.telegram_user_id, copyCounter++)).catch(() => undefined);
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  // Point of no return: the next call may charge runes. Telegram retries of
  // this update must stay no-ops from here on.
  markIrreversible(ctx);

  let result: Awaited<ReturnType<typeof siteSpread>>;
  try {
    result = operation.result ? { data: JSON.parse(operation.result), ok: true, status: 200 } as typeof result
      : await siteSpread(user.telegram_user_id, validated.question, clientEventId);
    savePaidResult(operation.id, result.data);
  } catch (err) {
    console.error("[spread] site call failed", err);
    // Do NOT clearFlow: restore the entry step with the same event id so a
    // user retry of the same question is idempotent on the site.
    setFlow(
      user.telegram_user_id,
      "spread",
      source === "free" ? "await_free_text" : "await_question",
      { failedQuestion: validated.question, clientEventId }
    );
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return;
  }

  try {
    await deliverSiteSpreadResult(ctx, user, operation.result ? { ...result.data, charged: 0, runeBalance: undefined } : result.data, {
      source,
      question: validated.question,
    });
    deliveredOperation(operation.id);
  } catch (err) {
    // Runes may be charged and the session saved on the site — never leave
    // the user in silence. The reading is waiting in history.
    console.error("[spread] delivery failed after site success", err);
    trackEvent("spread_delivery_failed", user.telegram_user_id, {
      session_id: result.data.sessionId ?? null,
      source,
    });
    await ctx
      .reply(copy.spreadSavedOnSite, { reply_markup: salonKeyboard() })
      .catch(() => undefined);
  }
}

async function deliverSiteSpreadResult(
  ctx: Context,
  user: BotUser,
  data: {
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
    masterId?: string;
    spreadId?: string;
    error?: string;
    message?: string;
    linkUrl?: string;
    cost?: number;
  },
  meta: {
    source: string;
    question: string;
    spreadIdFallback?: string;
  }
): Promise<void> {
  if (!data.ok || !data.cards || !data.reading || !data.sessionId) {
    clearFlow(user.telegram_user_id);
    if (data.error === "insufficient_runes") {
      await ctx.reply(data.message || copy.insufficientRunes, {
        reply_markup: data.linkUrl ? ctaKeyboard(data.linkUrl) : salonKeyboard(),
      });
      return;
    }
    if (data.error === "needs_link" || data.error === "needs_onboarding") {
      await ctx.reply(data.message || copy.needSiteAccount, {
        reply_markup: data.linkUrl ? ctaKeyboard(data.linkUrl) : salonKeyboard(),
      });
      return;
    }
    await ctx.reply(data.message || copy.spreadFailed, { reply_markup: salonKeyboard() });
    return;
  }

  const drawn = drawnCardsFromSiteCards(data.cards);
  const spreadId = data.spreadId || meta.spreadIdFallback || botConfig.spreadId;
  track(user, "cards_shown", {
    session_id: data.sessionId,
    source: "site",
    cards: data.cards.map((c) => ({
      id: c.id,
      reversed: c.reversed,
      position: c.position,
      deck_id: botConfig.deckId,
      spread_id: spreadId,
    })),
    master_id: data.masterId,
    card_count: data.cards.length,
  });

  await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
  const footer =
    data.runeBalance != null
      ? `Баланс: ${data.runeBalance} рун${data.charged ? ` (−${data.charged})` : ""}.`
      : undefined;
  await presentReadingToTelegram(ctx, {
    reading: data.reading,
    cards: drawn,
    question: meta.question,
    sessionId: data.sessionId,
    footer,
  });

  track(user, "teaser_shown", {
    source: "site_full_reading",
    session_id: data.sessionId,
  });
  trackEvent("site_reading_delivered", user.telegram_user_id, {
    session_id: data.sessionId,
    charged: data.charged ?? 0,
    source: meta.source,
    spread_id: spreadId,
    master_id: data.masterId,
  });

  const streak = touchStreak(user.telegram_user_id);
  if ([3, 7, 30].includes(streak)) {
    await ctx.reply(copy.milestone(streak), { reply_markup: salonKeyboard() });
  }

  const fresh = getUser(user.telegram_user_id) ?? user;
  if (needsSoftTimezonePrompt(fresh)) {
    // Persist "shown" immediately — ignore/skip must not re-prompt every spread.
    markTimezonePromptShown(fresh.telegram_user_id);
    await ctx.reply(copy.timezoneAskSoft, {
      reply_markup: timezoneKeyboard({ allowSkip: true }),
    });
  }
  // reading_view flow kept for ‹ › album pager — do not clearFlow here.
}

/** Legacy CTA resend for pre-parity guest sessions still in SQLite. */
export async function handleCtaResend(ctx: Context, sessionId: string): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;

  const session = findSessionById(sessionId);
  if (!session || session.telegram_user_id !== user.telegram_user_id) {
    // Row may already be purged — still answer with the friendly expired copy.
    await ctx.answerCallbackQuery({ text: "Ссылка недоступна" });
    await ctx.reply(copy.ctaExpired, { reply_markup: salonKeyboard() });
    return;
  }
  if (session.claimed_at) {
    await ctx.answerCallbackQuery({ text: "Уже привязано" });
    await ctx.reply(copy.profileLinked, { reply_markup: salonKeyboard() });
    return;
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await ctx.answerCallbackQuery({ text: "Срок истёк" });
    await ctx.reply(copy.ctaExpired, { reply_markup: salonKeyboard() });
    return;
  }
  if (!session.cta_url) {
    await ctx.answerCallbackQuery({ text: "Ссылка недоступна" });
    await ctx.reply(copy.spreadFailed, { reply_markup: salonKeyboard() });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Отправляю" });
  await ctx.reply(copy.teaserFooter(user.telegram_user_id, copyCounter++), {
    reply_markup: ctaKeyboard(session.cta_url),
  });
  trackEvent("cta_resent", user.telegram_user_id, {
    session_id: session.id,
    source: "button",
  });
}

export async function handleAgain(ctx: Context): Promise<void> {
  const { beginCatalog } = await import("./catalog.js");
  await beginCatalog(ctx);
}
