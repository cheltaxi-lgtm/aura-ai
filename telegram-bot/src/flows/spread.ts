import { InputFile } from "grammy";
import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { randomUUID } from "node:crypto";
import {
  canDrawTriplet,
  claimSpreadSlot,
  clearFlow,
  consumeBonusSpread,
  countTripletsToday,
  createGuestSession,
  effectiveTripletLimit,
  findSessionById,
  getFlow,
  getUser,
  markTeaserDelivered,
  needsSoftTimezonePrompt,
  releaseFailedSpreadSlot,
  setFlow,
  touchStreak,
  trackEvent,
  consumeTtsQuota,
  type BotUser,
} from "../db/repos.js";
import { isTtsEnabled } from "../flags.js";
import { deckProvider } from "../domain/deck/local-provider.js";
import { validateQuestion } from "../domain/question/validate.js";
import {
  buildTrackedCtaUrl,
  computeFingerprint,
  createSessionToken,
  hashSessionToken,
  toGuestSymbols,
} from "../domain/session/token.js";
import { generateTeaser } from "../domain/teaser/provider.js";
import { ttsProvider } from "../domain/tts/openrouter-provider.js";
import {
  ctaKeyboard,
  questionKeyboard,
  salonKeyboard,
  timezoneKeyboard,
} from "../keyboards/index.js";
import { markIrreversible } from "../middleware/irreversible.js";
import { ensureOnboarded, track } from "./helpers.js";
import { ritualReveal } from "./ritual.js";

let copyCounter = 0;

export async function beginSpread(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;

  if (!canDrawTriplet(user)) {
    await ctx.reply(copy.limitReached(user.telegram_user_id, copyCounter++), {
      reply_markup: salonKeyboard(),
    });
    return;
  }

  setFlow(user.telegram_user_id, "spread", "await_question", {});
  await ctx.reply(copy.askQuestion(user.telegram_user_id, copyCounter++), {
    reply_markup: questionKeyboard(),
  });
}

export async function handleChip(ctx: Context, chip: string): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  await runSpread(ctx, user, chip, "chip");
}

export async function handleOwnQuestionPrompt(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  setFlow(user.telegram_user_id, "spread", "await_free_text", {});
  await ctx.reply(copy.ownQuestion(user.telegram_user_id, copyCounter++), {
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
  await runSpread(ctx, user, text, "free");
  return true;
}

async function runSpread(
  ctx: Context,
  user: BotUser,
  rawQuestion: string,
  source: "chip" | "free"
): Promise<void> {
  if (!canDrawTriplet(user)) {
    clearFlow(user.telegram_user_id);
    await ctx.reply(copy.limitReached(user.telegram_user_id, copyCounter++), {
      reply_markup: salonKeyboard(),
    });
    return;
  }

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

  track(user, "question_submitted", { source, question_len: validated.question.length });
  setFlow(user.telegram_user_id, "spread", "drawing", { question: validated.question, source });

  let sessionId = randomUUID();
  let claim = claimSpreadSlot(user.telegram_user_id, validated.question, sessionId, user);
  if (!claim.claimed) {
    // Stuck undelivered claim within 15m → release and retry once.
    const rescued = releaseFailedSpreadSlot({
      telegramUserId: user.telegram_user_id,
      question: validated.question,
      sessionId: claim.sessionId,
      user,
    });
    if (rescued.released || rescued.reason === "already_failed") {
      sessionId = randomUUID();
      claim = claimSpreadSlot(user.telegram_user_id, validated.question, sessionId, user);
    }
  }
  if (!claim.claimed) {
    clearFlow(user.telegram_user_id);
    const existing = findSessionById(claim.sessionId);
    if (existing?.teaser_text && existing.teaser_delivered_at) {
      await ctx.reply(existing.teaser_text, { reply_markup: salonKeyboard() });
      await ctx.reply(copy.teaserFooter(user.telegram_user_id, copyCounter++), {
        reply_markup: salonKeyboard(),
      });
    } else {
      await ctx.reply(copy.limitReached(user.telegram_user_id, copyCounter++), {
        reply_markup: salonKeyboard(),
      });
    }
    return;
  }

  // Point of no return for update_id: claim reserved — do not release update on later errors.
  markIrreversible(ctx);

  let token = "";
  let teaserText = "";
  try {
    await ctx.reply(copy.pause(user.telegram_user_id, copyCounter++));
    await ctx.replyWithChatAction("typing");
    await ctx.reply(copy.shuffling(user.telegram_user_id, copyCounter++));

    const cards = deckProvider.drawTriplet();

    try {
      await ritualReveal(ctx, cards, sessionId, user.telegram_user_id);
    } catch (err) {
      console.error("[spread] ritual failed", err);
      await ctx.reply(
        cards.map((c) => copy.cardLine(c.positionLabel, c.name, c.reversed)).join("\n"),
        { reply_markup: salonKeyboard() }
      );
    }

    track(user, "cards_shown", {
      session_id: sessionId,
      cards: cards.map((c) => ({
        id: c.id,
        reversed: c.reversed,
        position: c.position,
        deck_id: botConfig.deckId,
        spread_id: botConfig.spreadId,
      })),
    });

    await ctx.replyWithChatAction("typing");
    const teaser = await generateTeaser(validated.question, cards, user.telegram_user_id);
    teaserText = teaser.text;

    token = createSessionToken();
    const symbols = toGuestSymbols(cards);
    const usedBonus =
      countTripletsToday(user.telegram_user_id, user) >= botConfig.tripletDailyLimit &&
      (user.bonus_spreads ?? 0) > 0;

    createGuestSession({
      id: sessionId,
      telegramUserId: user.telegram_user_id,
      question: validated.question,
      cards: symbols,
      teaserText: teaser.text,
      teaserPromptVersion: teaser.promptVersion,
      teaserModel: teaser.model,
      teaserSeed: teaser.seed,
      tokenHash: hashSessionToken(token),
      plainToken: token,
      fingerprint: computeFingerprint(symbols),
      questionSource: source,
      collageCacheKey: sessionId,
    });

    if (usedBonus) consumeBonusSpread(user.telegram_user_id);

    await ctx.reply(teaser.text, { reply_markup: salonKeyboard() });
    markTeaserDelivered(sessionId);
    track(user, "teaser_shown", {
      source: teaser.source,
      model: teaser.model,
      session_id: sessionId,
    });
  } catch (err) {
    console.error("[spread] failed before teaser delivery", err);
    const released = releaseFailedSpreadSlot({
      telegramUserId: user.telegram_user_id,
      question: validated.question,
      sessionId,
      user,
    });
    clearFlow(user.telegram_user_id);
    await ctx.reply(copy.spreadFailed, { reply_markup: salonKeyboard() });
    if (!released.released) {
      trackEvent("spread_failed_uncompensated", user.telegram_user_id, {
        session_id: sessionId,
        reason: released.reason,
      });
    }
    return;
  }

  // After delivery: voice/CTA failures must NOT return the slot.
  const voiceMode = user.voice_mode ?? "text_voice";
  if (
    voiceMode === "text_voice" &&
    isTtsEnabled() &&
    consumeTtsQuota(user.telegram_user_id)
  ) {
    const short = teaserText.length > 500 ? `${teaserText.slice(0, 480)}…` : teaserText;
    const voice = await ttsProvider.synthesize(short);
    if (voice.ok) {
      try {
        await ctx.replyWithVoice(new InputFile(voice.ogg, "teaser.ogg"));
        trackEvent("voice_sent", user.telegram_user_id, { session_id: sessionId });
      } catch {
        trackEvent("voice_failed", user.telegram_user_id, { session_id: sessionId });
      }
    } else {
      trackEvent("voice_failed", user.telegram_user_id, {
        session_id: sessionId,
        reason: voice.reason,
      });
    }
  }

  await new Promise((r) => setTimeout(r, botConfig.ritual.ctaPauseMs));
  const ctaUrl = buildTrackedCtaUrl(token);
  await ctx.reply(copy.teaserFooter(user.telegram_user_id, copyCounter++), {
    reply_markup: ctaKeyboard(ctaUrl),
  });

  const streak = touchStreak(user.telegram_user_id);
  if ([3, 7, 30].includes(streak)) {
    await ctx.reply(copy.milestone(streak), { reply_markup: salonKeyboard() });
  }

  clearFlow(user.telegram_user_id);

  const fresh = getUser(user.telegram_user_id);
  if (fresh && needsSoftTimezonePrompt(fresh)) {
    await ctx.reply(copy.timezoneAskSoft, {
      reply_markup: timezoneKeyboard({ allowSkip: true }),
    });
  }

  void effectiveTripletLimit;
}

export async function handleAgain(ctx: Context): Promise<void> {
  await beginSpread(ctx);
}
