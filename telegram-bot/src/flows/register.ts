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
  profileKeyboard,
  salonKeyboard,
  settingsKeyboard,
  timezoneKeyboard,
} from "../keyboards/index.js";
import { isShareCardEnabled } from "../flags.js";
import { renderShareCollage } from "../render/card-collage.js";
import { renderProfileCardImage } from "../render/profile-card.js";
import { siteCabinet, siteDeleteAccount, siteHistory } from "../domain/site-client.js";
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
import {
  handlePhotoCallback,
  handlePhotoMessage,
} from "./photo.js";
import { handleDay } from "./day.js";
import { beginCatalog, handleCatalogCallback } from "./catalog.js";
import { handleReadingPagerCallback } from "../domain/reading/present.js";
import {
  handleRunesCallback,
  registerRunePayments,
  showRunes,
} from "./runes.js";
import { handleMiniAppNavCallback } from "./miniapp-nav.js";
import {
  handleAgain,
  handleChip,
  handleCtaResend,
  handleFreeTextQuestion,
  handleOwnQuestionPrompt,
} from "./spread.js";
import {
  ensureBotOfferAccount,
  ensureSiteLinked,
  issueSiteLinkUrl,
  syncSiteAccount,
} from "./site-account.js";
import {
  beginProfileOnboarding,
  continueProfileAfterTimezone,
  handleProfileCallback,
  handleProfileFlowText,
} from "./profile-onboarding.js";
import {
  ensureOnboarded,
  removeKeyboardMarkup,
  sendMenu,
  showSalonHome,
  track,
} from "./helpers.js";

export function registerFlows(bot: Bot): void {
  registerRunePayments(bot);

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
      await showSalonHome(ctx, { name: freshAuth.first_name });
      return;
    }

    // Gates first, then premium salon home.
    const fresh = getUser(ctx.from.id)!;
    if (!fresh.age_confirmed_at) {
      await ctx.reply(copy.ageAsk, { reply_markup: ageKeyboard() });
      return;
    }
    if (!fresh.terms_accepted_at || !fresh.privacy_accepted_at) {
      await ctx.reply(copy.consentAsk(botConfig.siteUrl), { reply_markup: consentKeyboard() });
      return;
    }
    await showSalonHome(ctx, { name: fresh.first_name });
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
    const ensured = await ensureBotOfferAccount(ctx, user);
    if (ensured?.linked) {
      await ctx.reply(copy.accountOpened, { reply_markup: salonKeyboard() });
      if (ensured.needsOnboarding) {
        await beginProfileOnboarding(ctx);
        return;
      }
    }
    await showSalonHome(ctx, { name: user.first_name });
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
      await ctx.answerCallbackQuery({ text: "Сохранено" });
      try {
        await ctx.editMessageText(
          `Часовой пояс выбран (UTC${minutes >= 0 ? "+" : ""}${minutes / 60}).`
        );
      } catch {
        // message may already be edited
      }
      if (await continueProfileAfterTimezone(ctx, minutes)) return;
      setTimezoneOffset(ctx.from.id, minutes);
      await ctx.reply(copy.timezoneSet, { reply_markup: salonKeyboard() });
    } catch (err) {
      console.error("[tz]", err);
      await ctx.answerCallbackQuery({ text: "Не удалось сохранить" });
      await ctx.reply(
        "Не удалось сохранить пояс. Откройте Профиль → Настройки и выберите ещё раз.",
        { reply_markup: salonKeyboard() }
      );
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
    const user = await ensureOnboarded(ctx);
    if (!user) return;
    await showSalonHome(ctx, { name: user.first_name });
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
      const inviteUrl = `https://t.me/${botConfig.botUsername}?start=ref_${code}`;
      await ctx.replyWithPhoto(new InputFile(img, "share.jpg"), {
        caption: `Zovus · t.me/${botConfig.botUsername}?start=ref_${code}`,
        reply_markup: inviteKeyboard(inviteUrl),
      });
    } catch (err) {
      console.error("[share]", err);
      const code = ensureRefCode(user.telegram_user_id);
      const inviteUrl = `https://t.me/${botConfig.botUsername}?start=ref_${code}`;
      await ctx.reply(copy.shareHint, { reply_markup: inviteKeyboard(inviteUrl) });
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

  bot.callbackQuery(CB.delStart, async (ctx) => {
    await ctx.answerCallbackQuery();
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
    await ctx.answerCallbackQuery({ text: "Удаляю аккаунт…" }).catch(() => undefined);
    const tid = ctx.from.id;
    try {
      const site = await siteDeleteAccount(tid);
      if (!site.ok) {
        if (site.error === "not_linked") {
          trackEvent("deleted", tid, { scope: "bot_local_only" });
          deleteUserData(tid);
          await ctx.reply(copy.deleteLocalOnly, { reply_markup: removeKeyboardMarkup() });
          return;
        }
        await ctx.reply(site.message || copy.deleteSiteFailed, {
          reply_markup: salonKeyboard(),
        });
        return;
      }
      trackEvent("deleted", tid, { scope: "full_account" });
      deleteUserData(tid);
      await ctx.reply(copy.deleteDone, { reply_markup: removeKeyboardMarkup() });
    } catch (err) {
      console.error("[delete] site", err);
      await ctx.reply(copy.deleteSiteFailed, { reply_markup: salonKeyboard() });
    }
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

  bot.callbackQuery(new RegExp(`^${CB.phPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handlePhotoCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.rnPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleRunesCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.navPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!(await handleMiniAppNavCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.profPrefix}`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === CB.profHist) {
      await ctx.answerCallbackQuery().catch(() => undefined);
      await showHistory(ctx);
      return;
    }
    if (data === CB.profRunes) {
      await ctx.answerCallbackQuery().catch(() => undefined);
      await showRunes(ctx);
      return;
    }
    if (data === CB.profSettings) {
      await ctx.answerCallbackQuery().catch(() => undefined);
      await showSettings(ctx);
      return;
    }
    if (!(await handleProfileCallback(ctx, data))) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  bot.on(["message:photo", "message:document"], async (ctx) => {
    if (await handlePhotoMessage(ctx)) return;
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;
    if (await handleProfileFlowText(ctx, text)) return;
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
      {
        const aboutUser = await ensureOnboarded(ctx);
        if (!aboutUser) return;
        await showSalonHome(ctx, { name: aboutUser.first_name });
      }
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
  const inviteUrl = `https://t.me/${botConfig.botUsername}?start=ref_${code}`;
  const linked = Boolean(site?.linked || user.zovus_user_id);
  const pending = findLatestUnclaimedCtaSession(user.telegram_user_id);
  let linkUrl = site?.linkUrl || pending?.cta_url || `${botConfig.siteUrl}/cabinet`;
  if (!linked) {
    linkUrl = (await issueSiteLinkUrl(ctx, user)) || linkUrl;
  }

  const timezone = formatTimezoneLabel(user);
  let card = {
    name: user.first_name || "Гость",
    linked,
    unlimited: false,
    zodiac: null as string | null,
    birthDate: null as string | null,
    memberSince: user.created_at,
    runeBalance: site?.runeBalance ?? 0,
    totalSessions: countSessions(user.telegram_user_id),
    totalCards: 0,
    daysWithUs: user.streak_days || 1,
    favoriteMasterName: null as string | null,
    natalLabel: null as string | null,
    matrices: 0,
    photos: 0,
    rituals: 0,
    timezone,
    streak: user.streak_days,
  };

  let cabinetUrl = `${botConfig.siteUrl}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=profile`;

  if (linked) {
    try {
      const { data } = await siteCabinet(user.telegram_user_id);
      if (data.ok) {
        card = {
          name: data.profile?.name || card.name,
          linked: true,
          unlimited: Boolean(data.profile?.unlimited),
          zodiac: data.profile?.zodiac ?? null,
          birthDate: data.profile?.birthDate ?? null,
          memberSince: data.profile?.memberSince || card.memberSince,
          runeBalance: data.runeBalance ?? card.runeBalance,
          totalSessions: data.stats?.totalSessions ?? card.totalSessions,
          totalCards: data.stats?.totalCards ?? 0,
          daysWithUs: data.stats?.daysWithUs ?? card.daysWithUs,
          favoriteMasterName: data.stats?.favoriteMasterName ?? null,
          natalLabel: data.natal?.hasChart
            ? (data.natal.bigThree || []).slice(0, 3).join(" · ") || "есть карта"
            : "не построена",
          matrices: data.stats?.matrices ?? data.numerology?.matrices?.length ?? 0,
          photos: data.stats?.photos ?? data.photo?.items?.length ?? 0,
          rituals: data.stats?.rituals ?? data.rituals?.recent?.length ?? 0,
          timezone,
          streak: user.streak_days,
        };
        if (data.urls?.cabinet) cabinetUrl = data.urls.cabinet;
      }
    } catch (err) {
      console.error("[profile] site cabinet", err);
    }
  }

  try {
    await ctx.replyWithChatAction("upload_photo");
    const buf = await renderProfileCardImage(card);
    await ctx.replyWithPhoto(new InputFile(buf, "profile.jpg"), {
      reply_markup: profileKeyboard({
        linked,
        cabinetUrl: linked ? cabinetUrl : null,
        linkUrl: linked ? null : linkUrl,
        inviteUrl,
      }),
    });
    if (!linked && pending?.cta_url) {
      await ctx.reply(copy.profileContinueHint, { reply_markup: ctaKeyboard(pending.cta_url) });
    } else if (!linked) {
      await ctx.reply(copy.profileLinkHint);
    }
  } catch (err) {
    console.error("[profile] render failed, text fallback", err);
    const body = copy.profile({
      since: (card.memberSince || "").slice(0, 10),
      streak: user.streak_days,
      spreads: card.totalSessions,
      age: Boolean(user.age_confirmed_at),
      consent: Boolean(user.terms_accepted_at && user.privacy_accepted_at),
      refLink: inviteUrl,
      invites: user.referral_count ?? 0,
      timezone,
      zovusLinked: linked,
    });
    await ctx.reply(`${body}\nРуны: ${card.runeBalance}`, {
      reply_markup: linked
        ? continueOnSiteKeyboard(cabinetUrl, copy.continueOnSite)
        : linkAccountKeyboard(linkUrl),
    });
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
