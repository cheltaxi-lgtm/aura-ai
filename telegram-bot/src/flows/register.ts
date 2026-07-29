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
  findLatestUnclaimedCtaSession,
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
  continueOnSiteKeyboard,
  ctaKeyboard,
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
import {
  beginChatFollowUp,
  beginSupportReply,
  handleCabinetText,
  handleHistoryCallback,
  handleMatrixCallback,
  routeModuleCallback,
  showHistory,
  showMatrix,
  showModulesMenu,
  showPhoto,
} from "./cabinet.js";
import { siteHistory } from "../domain/site-client.js";
import { handleDay } from "./day.js";
import { beginCatalog, handleCatalogCallback } from "./catalog.js";
import { handleReadingPagerCallback } from "../domain/reading/present.js";
import {
  handleAgain,
  handleChip,
  handleCtaResend,
  handleFreeTextQuestion,
  handleOwnQuestionPrompt,
} from "./spread.js";
import { ensureSiteLinked, issueSiteLinkUrl, syncSiteAccount } from "./site-account.js";
import { attachSalonBar, ensureOnboarded, removeKeyboardMarkup, sendMenu, track } from "./helpers.js";
import { siteRunes } from "../domain/site-client.js";

export function registerFlows(bot: Bot): void {
  bot.command("start", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const payload = typeof ctx.match === "string" ? ctx.match : "";

    // Legacy site→bot login deep links are disabled (149-FZ). Offer bind-only link-code instead.
    const legacyAuth = /^a_[a-f0-9]{32}$/i.test(payload);
    const wantsLink = legacyAuth || /^link(?:_|$)/i.test(payload) || payload.toLowerCase() === "link";

    const attribution = wantsLink && !payload.startsWith("ref_") ? {} : parseStartPayload(payload);
    const user = upsertUser({
      telegramUserId: ctx.from.id,
      chatId: ctx.chat.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      languageCode: ctx.from.language_code,
      attribution,
    });
    if (!wantsLink && (attribution.ref?.startsWith("r") || payload.startsWith("ref_"))) {
      const code = attribution.ref?.startsWith("ref_")
        ? attribution.ref.slice(4)
        : attribution.ref || payload.replace(/^ref_/, "");
      if (code) applyReferral(ctx.from.id, code);
    }
    ensureRefCode(ctx.from.id);
    track(user, "bot_start", { has_payload: Boolean(payload), link_flow: wantsLink });

    if (wantsLink) {
      if (legacyAuth) {
        await ctx.reply(copy.authBridgeRetired);
      }
      const linkUrl = await issueSiteLinkUrl(ctx, user);
      if (!linkUrl) {
        await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
        return;
      }
      trackEvent("link_code_issued", ctx.from.id, {});
      await ctx.reply(copy.linkCodeIssued, {
        reply_markup: linkAccountKeyboard(linkUrl),
      });
      const freshAuth = getUser(ctx.from.id)!;
      if (!freshAuth.age_confirmed_at) {
        await ctx.reply(copy.ageAsk, { reply_markup: ageKeyboard() });
        return;
      }
      if (!freshAuth.terms_accepted_at || !freshAuth.privacy_accepted_at) {
        await ctx.reply(copy.consentAsk(botConfig.siteUrl), { reply_markup: consentKeyboard() });
        return;
      }
      await attachSalonBar(ctx);
      return;
    }

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

  bot.command("spread", async (ctx) => beginCatalog(ctx));
  bot.command("again", async (ctx) => handleAgain(ctx));
  bot.command("day", async (ctx) => handleDay(ctx));
  bot.command("daily", async (ctx) => handleDay(ctx));
  bot.command("profile", async (ctx) => showProfile(ctx));
  bot.command("history", async (ctx) => showHistory(ctx));
  bot.command("settings", async (ctx) => showSettings(ctx));

  bot.callbackQuery(new RegExp(`^${CB.ctaResendPrefix}(.+)$`), async (ctx) => {
    const sessionId = ctx.match?.[1];
    if (!sessionId) {
      await ctx.answerCallbackQuery({ text: "Ссылка недоступна" });
      return;
    }
    await handleCtaResend(ctx, sessionId);
  });

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

    let question = "";
    let cardNames: string[] = [];
    let sessionKey = "";

    try {
      const hist = await siteHistory(user.telegram_user_id, 8);
      const withCards = hist.data.items?.find((i) => (i.cards?.length ?? 0) > 0);
      if (hist.data.ok && withCards) {
        cardNames = withCards.cards;
        question = withCards.topic || "";
        sessionKey = withCards.sessionId;
      }
    } catch {
      /* fall back to local guest sessions */
    }

    if (!cardNames.length) {
      const rows = listSessions(user.telegram_user_id, 1);
      if (!rows[0]) {
        await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
        return;
      }
      sessionKey = rows[0].id;
      question = rows[0].question;
      cardNames = (JSON.parse(rows[0].cards) as DrawnCard[]).map((c) => c.name);
    }

    trackEvent("share_clicked", user.telegram_user_id, { session_id: sessionKey });
    const enriched = cardNames.slice(0, 3).map((name, i) => ({
      id: i + 1,
      name,
      reversed: false,
      meaning: "",
      slug: `card-${i + 1}`,
      positionLabel: ["Прошлое", "Настоящее", "Будущее"][i] || String(i),
      position: i,
    }));
    try {
      const img = await renderShareCollage(enriched as DrawnCard[], question);
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

  bot.callbackQuery(new RegExp(`^${CB.rdPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleReadingPagerCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.catPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleCatalogCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(/^mod:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    if (!(await routeModuleCallback(ctx, data))) {
      await ctx.reply(copy.modulesPick, { reply_markup: salonKeyboard() });
    }
  });

  bot.callbackQuery(CB.chatStop, async (ctx) => {
    await ctx.answerCallbackQuery();
    await routeModuleCallback(ctx, CB.chatStop);
  });

  bot.callbackQuery(CB.supportNew, async (ctx) => {
    await ctx.answerCallbackQuery();
    await routeModuleCallback(ctx, CB.supportNew);
  });

  bot.callbackQuery(new RegExp(`^${CB.chatAskPrefix}(.+)$`), async (ctx) => {
    const sessionId = ctx.match?.[1];
    await ctx.answerCallbackQuery();
    if (!sessionId) return;
    await beginChatFollowUp(ctx, sessionId);
  });

  bot.callbackQuery(new RegExp(`^${CB.supportReplyPrefix}(.+)$`), async (ctx) => {
    const ticketId = ctx.match?.[1];
    await ctx.answerCallbackQuery();
    if (!ticketId) return;
    await beginSupportReply(ctx, ticketId);
  });

  bot.callbackQuery(new RegExp(`^${CB.histPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleHistoryCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.mxPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleMatrixCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    if (NAV_LABELS.has(text)) {
      await routeNav(ctx, text);
      return;
    }
    if (await handleCabinetText(ctx, text)) return;
    const handled = await handleFreeTextQuestion(ctx, text);
    if (!handled && (await ensureOnboarded(ctx))) {
      await ctx.reply(copy.navHint, { reply_markup: salonKeyboard() });
    }
  });
}

async function routeNav(ctx: Context, label: string): Promise<void> {
  switch (label) {
    case NAV.matrix:
      await showMatrix(ctx);
      return;
    case NAV.photo:
      await showPhoto(ctx);
      return;
    case NAV.spread:
      await beginCatalog(ctx);
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
    case NAV.runes:
      await showRunes(ctx);
      return;
    case NAV.more:
      await showModulesMenu(ctx);
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
  let site;
  try {
    site = await syncSiteAccount(user);
  } catch {
    site = null;
  }
  const code = ensureRefCode(user.telegram_user_id);
  const linked = Boolean(site?.linked || user.zovus_user_id);
  const pending = findLatestUnclaimedCtaSession(user.telegram_user_id);
  let linkUrl = site?.linkUrl || pending?.cta_url || `${botConfig.siteUrl}/cabinet`;
  if (!linked) {
    linkUrl = (await issueSiteLinkUrl(ctx, user)) || linkUrl;
  }
  const bal =
    site?.runeBalance != null ? `\nРуны: ${site.runeBalance}` : "";
  let spreads = countSessions(user.telegram_user_id);
  if (linked) {
    try {
      const hist = await siteHistory(user.telegram_user_id, 1);
      if (hist.data.ok && typeof hist.data.total === "number") {
        spreads = hist.data.total;
      }
    } catch {
      /* keep local count */
    }
  }
  const body = copy.profile({
    since: user.created_at.slice(0, 10),
    streak: user.streak_days,
    spreads,
    age: Boolean(user.age_confirmed_at),
    consent: Boolean(user.terms_accepted_at && user.privacy_accepted_at),
    refLink: `https://t.me/${botConfig.botUsername}?start=ref_${code}`,
    invites: user.referral_count ?? 0,
    timezone: formatTimezoneLabel(user),
    zovusLinked: linked,
  });
  const withHint =
    pending && !linked
      ? `${body}${bal}\n\n${copy.profileContinueHint}`
      : `${body}${bal}`;

  await ctx.reply(withHint, {
    reply_markup: linked
      ? continueOnSiteKeyboard(linkUrl, copy.continueOnSite)
      : pending?.cta_url
        ? ctaKeyboard(pending.cta_url)
        : linkAccountKeyboard(linkUrl),
  });
}

async function showRunes(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteRunes(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return;
    }
    await ctx.reply(copy.runesBalance(data.runeBalance ?? 0), {
      reply_markup: data.shopUrl
        ? continueOnSiteKeyboard(data.shopUrl, "Пополнить руны")
        : salonKeyboard(),
    });
  } catch (err) {
    console.error("[runes] site", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
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
