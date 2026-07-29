import type { Bot, Context } from "grammy";
import { InputFile } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  applyReferral,
  confirmAge,
  confirmConsent,
  countSessions,
  deleteUserData,
  ensureRefCode,
  formatTimezoneLabel,
  getUser,
  listSessions,
  needsUserTimezoneForReminders,
  setReminderMode,
  setTimezoneOffset,
  skipTimezonePrompt,
  setUnsubscribed,
  setVoiceMode,
  trackEvent,
  upsertUser,
} from "../db/repos.js";
import { parseStartPayload } from "../domain/attribution.js";
import { PAIN_CHIPS } from "../domain/question/validate.js";
import type { DrawnCard } from "../domain/deck/types.js";
import {
  CB,
  NAV,
  NAV_LABELS,
  ageKeyboard,
  consentKeyboard,
  deleteConfirmKeyboard,
  deleteKeyboard,
  inviteKeyboard,
  linkAccountKeyboard,
  salonKeyboard,
  settingsKeyboard,
  timezoneKeyboard,
} from "../keyboards/index.js";
import { isShareCardEnabled } from "../flags.js";
import { renderShareCollage } from "../render/card-collage.js";
import { handleDay } from "./day.js";
import {
  beginSpread,
  handleAgain,
  handleChip,
  handleFreeTextQuestion,
  handleOwnQuestionPrompt,
} from "./spread.js";
import { attachSalonBar, ensureOnboarded, removeKeyboardMarkup, sendMenu, track } from "./helpers.js";

export function registerFlows(bot: Bot): void {
  bot.command("start", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const payload = typeof ctx.match === "string" ? ctx.match : "";
    const attribution = parseStartPayload(payload);
    const user = upsertUser({
      telegramUserId: ctx.from.id,
      chatId: ctx.chat.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      languageCode: ctx.from.language_code,
      attribution,
    });
    if (attribution.ref?.startsWith("r") || payload.startsWith("ref_")) {
      const code = attribution.ref?.startsWith("ref_")
        ? attribution.ref.slice(4)
        : attribution.ref || payload.replace(/^ref_/, "");
      if (code) applyReferral(ctx.from.id, code);
    }
    ensureRefCode(ctx.from.id);
    track(user, "bot_start", { has_payload: Boolean(payload) });

    const name = ctx.from.first_name?.trim() || "друг";
    await ctx.reply(copy.greeting(name));

    const fresh = getUser(ctx.from.id)!;
    if (!fresh.age_confirmed_at) {
      await ctx.reply(copy.ageAsk, { reply_markup: ageKeyboard() });
      return;
    }
    if (!fresh.terms_accepted_at || !fresh.privacy_accepted_at) {
      await ctx.reply(copy.consentAsk(botConfig.siteUrl), { reply_markup: consentKeyboard() });
      return;
    }
    await attachSalonBar(ctx);
  });

  bot.callbackQuery(CB.ageYes, async (ctx) => {
    if (!ctx.from) return;
    confirmAge(ctx.from.id);
    const user = getUser(ctx.from.id)!;
    track(user, "age_gate_pass", {});
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Возраст подтверждён.");
    await ctx.reply(copy.consentAsk(botConfig.siteUrl), { reply_markup: consentKeyboard() });
  });

  bot.callbackQuery(CB.ageNo, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.ageNo, { reply_markup: removeKeyboardMarkup() });
  });

  bot.callbackQuery(CB.consentYes, async (ctx) => {
    if (!ctx.from) return;
    confirmConsent(ctx.from.id);
    const user = getUser(ctx.from.id)!;
    track(user, "consent_given", {});
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Согласие принято.");
    await attachSalonBar(ctx);
  });

  bot.callbackQuery(/^tz:(.+)$/, async (ctx) => {
    if (!ctx.from) return;
    const raw = ctx.match?.[1];
    if (!raw) {
      await ctx.answerCallbackQuery({ text: "Не удалось сохранить пояс" });
      return;
    }
    if (raw === "ask") {
      await ctx.answerCallbackQuery();
      await ctx.reply(copy.timezoneAsk, { reply_markup: timezoneKeyboard() });
      return;
    }
    if (raw === "skip") {
      skipTimezonePrompt(ctx.from.id);
      await ctx.answerCallbackQuery({ text: "Пропущено" });
      try {
        await ctx.editMessageText(copy.timezoneSkipped);
      } catch {
        await ctx.reply(copy.timezoneSkipped, { reply_markup: salonKeyboard() });
      }
      return;
    }
    const minutes = Number(raw);
    if (!Number.isFinite(minutes)) {
      await ctx.answerCallbackQuery({ text: "Некорректный пояс" });
      return;
    }
    try {
      setTimezoneOffset(ctx.from.id, minutes);
      await ctx.answerCallbackQuery({ text: "Сохранено" });
      try {
        await ctx.editMessageText(`Часовой пояс выбран (UTC${minutes >= 0 ? "+" : ""}${minutes / 60}).`);
      } catch {
        // message may already be edited
      }
      await ctx.reply(copy.timezoneSet, { reply_markup: salonKeyboard() });
    } catch (err) {
      console.error("[tz]", err);
      await ctx.answerCallbackQuery({ text: "Не удалось сохранить" });
      await ctx.reply("Не удалось сохранить пояс. Откройте Настройки и выберите ещё раз.", {
        reply_markup: salonKeyboard(),
      });
    }
  });

  bot.command("menu", async (ctx) => {
    if (!(await ensureOnboarded(ctx))) return;
    await sendMenu(ctx);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(copy.help, { reply_markup: salonKeyboard() });
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(copy.about, { reply_markup: salonKeyboard() });
  });

  bot.command("spread", async (ctx) => beginSpread(ctx));
  bot.command("again", async (ctx) => handleAgain(ctx));
  bot.command("day", async (ctx) => handleDay(ctx));
  bot.command("daily", async (ctx) => handleDay(ctx));
  bot.command("profile", async (ctx) => showProfile(ctx));
  bot.command("history", async (ctx) => showHistory(ctx));
  bot.command("settings", async (ctx) => showSettings(ctx));

  bot.command("stop", async (ctx) => {
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    setReminderMode(user.telegram_user_id, "off", null);
    await ctx.reply(copy.stopOk, { reply_markup: salonKeyboard() });
  });

  bot.callbackQuery(/^chip:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chip = PAIN_CHIPS[Number(ctx.match[1])];
    if (!chip) return;
    await handleChip(ctx, chip);
  });

  bot.callbackQuery(CB.ownQuestion, async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleOwnQuestionPrompt(ctx);
  });

  bot.callbackQuery(CB.remMorning, async (ctx) => {
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    if (needsUserTimezoneForReminders(user)) {
      await ctx.answerCallbackQuery();
      await ctx.reply(copy.timezoneAskReminders, { reply_markup: timezoneKeyboard() });
      return;
    }
    setReminderMode(user.telegram_user_id, "morning", 9);
    await ctx.answerCallbackQuery();
    await ctx.reply("Напоминания: утро.", { reply_markup: salonKeyboard() });
  });
  bot.callbackQuery(CB.remEvening, async (ctx) => {
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    if (needsUserTimezoneForReminders(user)) {
      await ctx.answerCallbackQuery();
      await ctx.reply(copy.timezoneAskReminders, { reply_markup: timezoneKeyboard() });
      return;
    }
    setReminderMode(user.telegram_user_id, "evening", 20);
    await ctx.answerCallbackQuery();
    await ctx.reply("Напоминания: вечер.", { reply_markup: salonKeyboard() });
  });
  bot.callbackQuery(CB.remOff, async (ctx) => {
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    setReminderMode(user.telegram_user_id, "off", null);
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.stopOk, { reply_markup: salonKeyboard() });
  });

  bot.callbackQuery(CB.voiceText, async (ctx) => {
    if (!ctx.from) return;
    setVoiceMode(ctx.from.id, "text");
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.voiceText, { reply_markup: salonKeyboard() });
  });
  bot.callbackQuery(CB.voiceBoth, async (ctx) => {
    if (!ctx.from) return;
    setVoiceMode(ctx.from.id, "text_voice");
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.voiceBoth, { reply_markup: salonKeyboard() });
  });

  bot.callbackQuery(CB.share, async (ctx) => {
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    if (!isShareCardEnabled()) {
      await ctx.answerCallbackQuery({ text: copy.shareDisabled, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const rows = listSessions(user.telegram_user_id, 1);
    if (!rows[0]) {
      await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
      return;
    }
    trackEvent("share_clicked", user.telegram_user_id, { session_id: rows[0].id });
    const cards = JSON.parse(rows[0].cards) as DrawnCard[];
    const enriched = cards.map((c, i) => ({
      ...c,
      meaning: c.meaning || "",
      slug: (c as { slug?: string }).slug || `card-${c.id}`,
      positionLabel: ["Прошлое", "Настоящее", "Будущее"][i] || String(i),
    }));
    try {
      const img = await renderShareCollage(enriched, rows[0].question);
      const code = ensureRefCode(user.telegram_user_id);
      await ctx.replyWithPhoto(new InputFile(img, "share.jpg"), {
        caption: `Zovus · t.me/${botConfig.botUsername}?start=ref_${code}`,
        reply_markup: inviteKeyboard(),
      });
    } catch (err) {
      console.error("[share]", err);
      await ctx.reply(copy.shareHint, { reply_markup: inviteKeyboard() });
    }
  });

  bot.callbackQuery(CB.unsub, async (ctx) => {
    if (!ctx.from) return;
    setUnsubscribed(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.unsubscribeOk, { reply_markup: salonKeyboard() });
  });

  bot.command("delete", async (ctx) => {
    if (!(await ensureOnboarded(ctx))) return;
    await ctx.reply(copy.deleteAsk, { reply_markup: deleteKeyboard() });
  });

  bot.callbackQuery(CB.delAsk, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.deleteConfirm, { reply_markup: deleteConfirmKeyboard() });
  });
  bot.callbackQuery(CB.delNo, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Отменено.", { reply_markup: salonKeyboard() });
  });
  bot.callbackQuery(CB.delYes, async (ctx) => {
    if (!ctx.from) return;
    trackEvent("deleted", ctx.from.id, {});
    deleteUserData(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply(copy.deleteDone, { reply_markup: removeKeyboardMarkup() });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    if (NAV_LABELS.has(text)) {
      await routeNav(ctx, text);
      return;
    }
    const handled = await handleFreeTextQuestion(ctx, text);
    if (!handled && (await ensureOnboarded(ctx))) {
      await ctx.reply(copy.navHint, { reply_markup: salonKeyboard() });
    }
  });
}

async function routeNav(ctx: Context, label: string): Promise<void> {
  switch (label) {
    case NAV.spread:
      await beginSpread(ctx);
      return;
    case NAV.day:
      await handleDay(ctx);
      return;
    case NAV.history:
      await showHistory(ctx);
      return;
    case NAV.profile:
      await showProfile(ctx);
      return;
    case NAV.settings:
      await showSettings(ctx);
      return;
    case NAV.about:
      if (!(await ensureOnboarded(ctx))) return;
      await ctx.reply(copy.about, { reply_markup: salonKeyboard() });
      return;
    default:
      return;
  }
}

async function showProfile(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  const code = ensureRefCode(user.telegram_user_id);
  const linked = Boolean(user.zovus_user_id);
  const linkUrl = `${botConfig.siteUrl}/cabinet`;
  await ctx.reply(
    copy.profile({
      since: user.created_at.slice(0, 10),
      streak: user.streak_days,
      spreads: countSessions(user.telegram_user_id),
      age: Boolean(user.age_confirmed_at),
      consent: Boolean(user.terms_accepted_at && user.privacy_accepted_at),
      refLink: `https://t.me/${botConfig.botUsername}?start=ref_${code}`,
      invites: user.referral_count ?? 0,
      timezone: formatTimezoneLabel(user),
      zovusLinked: linked,
    }),
    {
      reply_markup: linked
        ? inviteKeyboard()
        : linkAccountKeyboard(linkUrl),
    }
  );
}

async function showHistory(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  const rows = listSessions(user.telegram_user_id, 5);
  if (!rows.length) {
    await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
    return;
  }
  const blocks = rows.map((r, i) => {
    const cards = JSON.parse(r.cards) as Array<{ name: string; reversed: boolean }>;
    const cardLine = cards
      .map((c) => `${c.name}${c.reversed ? " (перевёрнута)" : ""}`)
      .join(" · ");
    const teaser = r.teaser_text ? `\n${r.teaser_text}` : "";
    return `${i + 1}. ${r.question}\n${cardLine}${teaser}`;
  });
  await ctx.reply(blocks.join("\n\n").slice(0, 3500), { reply_markup: salonKeyboard() });
}

async function showSettings(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  await ctx.reply(
    [
      copy.settingsTitle,
      "",
      copy.settingsHint,
      `Сейчас: напоминания ${user.reminder_mode}, голос ${user.voice_mode ?? "text_voice"}.`,
      `Часовой пояс: ${formatTimezoneLabel(user)}.`,
      "Сменить пояс — кнопка ниже.",
    ].join("\n"),
    { reply_markup: settingsKeyboard() }
  );
}
