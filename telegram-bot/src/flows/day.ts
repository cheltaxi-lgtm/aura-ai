import type { Context } from "grammy";
import { copy } from "../copy/ru.js";
import { touchStreak } from "../db/repos.js";
import { isDayCardEnabled } from "../flags.js";
import { siteDaily } from "../domain/site-client.js";
import {
  drawnCardsFromSiteCards,
  presentReadingToTelegram,
  stripReadingForTelegram,
} from "../domain/reading/present.js";
import { continueOnSiteKeyboard, salonKeyboard } from "../keyboards/index.js";
import { announceWorking, track } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let dayCopyCounter = 0;

export async function handleDay(ctx: Context): Promise<void> {
  const uid = ctx.from?.id;
  if (uid) {
    await announceWorking(ctx, copy.dayPreparing(uid, dayCopyCounter++));
  }
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;

  if (!isDayCardEnabled()) {
    await ctx.reply(copy.dayDisabled, { reply_markup: salonKeyboard() });
    return;
  }
  let result: Awaited<ReturnType<typeof siteDaily>>;
  try {
    result = await siteDaily(linked.user.telegram_user_id);
  } catch (err) {
    console.error("[day] site call failed", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return;
  }

  const data = result.data;
  if (!data.ok || !data.text) {
    await ctx.reply(data.message || copy.dayAlready, {
      reply_markup: data.linkUrl
        ? continueOnSiteKeyboard(data.linkUrl)
        : salonKeyboard(),
    });
    return;
  }

  touchStreak(linked.user.telegram_user_id);
  track(linked.user, "day_card_used", { source: "site", cached: data.cached });

  const drawn = drawnCardsFromSiteCards(
    (data.cards ?? []).map((c, i) => ({
      name: c.name,
      reversed: c.reversed,
      position: i,
      positionLabel: c.position,
    }))
  );

  await ctx.replyWithChatAction("upload_photo");
  await presentReadingToTelegram(ctx, {
    reading: stripReadingForTelegram(data.text) || data.text,
    cards: drawn,
    question: "Энергия дня",
    replyMarkup: salonKeyboard(),
  });
}
