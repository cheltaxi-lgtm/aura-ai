import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  clearFlow,
  findSessionById,
  getFlow,
  setFlow,
  touchStreak,
  trackEvent,
  type BotUser,
} from "../db/repos.js";
import { validateQuestion } from "../domain/question/validate.js";
import { chunkTelegramText, siteSpread } from "../domain/site-client.js";
import {
  ctaKeyboard,
  questionKeyboard,
  salonKeyboard,
} from "../keyboards/index.js";
import { markIrreversible } from "../middleware/irreversible.js";
import { ensureOnboarded, track } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let copyCounter = 0;

export async function beginSpread(ctx: Context): Promise<void> {
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
  if (!flow || flow.flow !== "spread" || flow.step !== "await_free_text") {
    return false;
  }
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return true;
  await runSiteSpread(ctx, linked.user, text, "free");
  return true;
}

async function runSiteSpread(
  ctx: Context,
  user: BotUser,
  rawQuestion: string,
  source: "chip" | "free"
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
  setFlow(user.telegram_user_id, "spread", "drawing", { question: validated.question, source });
  markIrreversible(ctx);

  await ctx.reply(copy.pause(user.telegram_user_id, copyCounter++));
  await ctx.replyWithChatAction("typing");
  await ctx.reply(copy.shuffling(user.telegram_user_id, copyCounter++));

  let result: Awaited<ReturnType<typeof siteSpread>>;
  try {
    result = await siteSpread(user.telegram_user_id, validated.question);
  } catch (err) {
    console.error("[spread] site call failed", err);
    clearFlow(user.telegram_user_id);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return;
  }

  const data = result.data;
  if (!data.ok || !data.cards || !data.reading || !data.sessionId) {
    clearFlow(user.telegram_user_id);
    if (data.error === "insufficient_runes") {
      await ctx.reply(data.message || copy.insufficientRunes, {
        reply_markup: data.linkUrl
          ? ctaKeyboard(data.linkUrl)
          : salonKeyboard(),
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

  const cardLines = data.cards
    .map((c) => copy.cardLine(c.positionLabel, c.name, c.reversed))
    .join("\n");
  await ctx.reply(cardLines, { reply_markup: salonKeyboard() });

  track(user, "cards_shown", {
    session_id: data.sessionId,
    source: "site",
    cards: data.cards.map((c) => ({
      id: c.id,
      reversed: c.reversed,
      position: c.position,
      deck_id: botConfig.deckId,
      spread_id: botConfig.spreadId,
    })),
  });

  await ctx.replyWithChatAction("typing");
  const chunks = chunkTelegramText(data.reading);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { reply_markup: salonKeyboard() });
  }

  const bal =
    data.runeBalance != null
      ? `\nБаланс: ${data.runeBalance} рун${data.charged ? ` (−${data.charged})` : ""}.`
      : "";
  await ctx.reply(`${copy.fullReadingDone}${bal}`, {
    reply_markup: salonKeyboard(),
  });

  track(user, "teaser_shown", {
    source: "site_full_reading",
    session_id: data.sessionId,
  });
  trackEvent("site_reading_delivered", user.telegram_user_id, {
    session_id: data.sessionId,
    charged: data.charged ?? 0,
  });

  const streak = touchStreak(user.telegram_user_id);
  if ([3, 7, 30].includes(streak)) {
    await ctx.reply(copy.milestone(streak), { reply_markup: salonKeyboard() });
  }

  clearFlow(user.telegram_user_id);
}

/** Legacy CTA resend for pre-parity guest sessions still in SQLite. */
export async function handleCtaResend(ctx: Context, sessionId: string): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;

  const session = findSessionById(sessionId);
  if (!session || session.telegram_user_id !== user.telegram_user_id) {
    await ctx.answerCallbackQuery({ text: "Ссылка недоступна" });
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
  await beginSpread(ctx);
}
