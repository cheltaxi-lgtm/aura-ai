import { InputFile } from "grammy";
import type { Context } from "grammy";
import { copy } from "../copy/ru.js";
import { getDayCard, saveDayCard, touchStreak } from "../db/repos.js";
import { isDayCardEnabled } from "../flags.js";
import { deckProvider } from "../domain/deck/local-provider.js";
import { dayCardText } from "../domain/teaser/provider.js";
import { salonKeyboard } from "../keyboards/index.js";
import { renderDayCardImage } from "../render/card-collage.js";
import { ensureOnboarded, track } from "./helpers.js";

export async function handleDay(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;

  if (!isDayCardEnabled()) {
    await ctx.reply(copy.dayDisabled, { reply_markup: salonKeyboard() });
    return;
  }

  const existing = getDayCard(user.telegram_user_id);
  if (existing) {
    await ctx.reply(copy.dayAlready, { reply_markup: salonKeyboard() });
    await ctx.reply(
      `${existing.card.positionLabel}: ${existing.card.name}${existing.card.reversed ? " (перевёрнута)" : ""}\n\n${existing.text}`,
      { reply_markup: salonKeyboard() }
    );
    return;
  }

  await ctx.replyWithChatAction("typing");
  const card = deckProvider.drawOne();
  const text = dayCardText(card);
  saveDayCard(user.telegram_user_id, card, text);
  touchStreak(user.telegram_user_id);
  track(user, "day_card_used", { card_id: card.id, reversed: card.reversed });

  try {
    const img = await renderDayCardImage(card);
    await ctx.replyWithPhoto(new InputFile(img, "day.jpg"), {
      caption: text,
      reply_markup: salonKeyboard(),
    });
  } catch (err) {
    console.error("[day] image failed", err);
    await ctx.reply(`Карта дня: ${card.name}${card.reversed ? " (перевёрнута)" : ""}\n\n${text}`, {
      reply_markup: salonKeyboard(),
    });
  }
}
