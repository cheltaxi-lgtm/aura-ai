import { InlineKeyboard, Keyboard } from "grammy";
import { copy } from "../copy/ru.js";
import { PAIN_CHIPS } from "../domain/question/validate.js";
import {
  buildSessionChatUrl,
  isTelegramInviteUrl,
  siteMiniAppShellUrl,
} from "../domain/site-client.js";
import { encodeMiniAppStartParam } from "../domain/mini-app-link.js";
import { isShareCardEnabled } from "../flags.js";

/**
 * Site CTAs → callback that parks a path for the ONE Mini App shell.
 * Never open a second web_app / startapp window from chat buttons.
 */
export function webAppButton(
  kb: InlineKeyboard,
  label: string,
  pathOrUrl: string
): InlineKeyboard {
  if (isTelegramInviteUrl(pathOrUrl)) {
    return kb.url(label, pathOrUrl);
  }
  const payload = encodeMiniAppStartParam(pathOrUrl).slice(0, 62);
  return kb.text(label, `${CB.navPrefix}${payload}`);
}

/** Single fixed web_app launcher (same URL every time → Telegram reuses the panel). */
export function openSalonKeyboard(label = "🕯 Открыть салон"): InlineKeyboard {
  return new InlineKeyboard().webApp(label, siteMiniAppShellUrl());
}

/** Persistent bottom bar — emoji allowed on buttons only (not in message bodies). */
export const NAV = {
  matrix: "📜 Матрица",
  photo: "📷 Расклад по фото",
  spread: "🔮 Расклад",
  day: "🃏 Карта дня",
  history: "📚 История",
  profile: "👤 Профиль",
  runes: "🪙 Руны",
  more: "📂 Ещё",
  settings: "⚙️ Настройки",
  about: "✨ О салоне",
} as const;

export const NAV_LABELS = new Set<string>(Object.values(NAV));

export const CB = {
  ageYes: "age:yes",
  ageNo: "age:no",
  consentYes: "consent:yes",
  chipPrefix: "chip:",
  ownQuestion: "q:own",
  remMorning: "rem:morning",
  remEvening: "rem:evening",
  remOff: "rem:off",
  voiceText: "voice:text",
  voiceBoth: "voice:both",
  tzPrefix: "tz:",
  delAsk: "del:ask",
  delYes: "del:yes",
  delNo: "del:no",
  share: "share:spread",
  unsub: "unsub:yes",
  invite: "invite:switch",
  ctaResendPrefix: "cta:resend:",
  modNatal: "mod:natal",
  modMatrix: "mod:matrix",
  modRituals: "mod:rituals",
  modJoint: "mod:joint",
  modDiary: "mod:diary",
  modMemory: "mod:memory",
  modPhoto: "mod:photo",
  modSupport: "mod:support",
  modCabinet: "mod:cabinet",
  /** Destiny matrix album / actions */
  mxPrefix: "mx:",
  mxRun: "mx:run",
  mxNew: "mx:new",
  mxNewYes: "mx:new:yes",
  mxNewNo: "mx:new:no",
  mxCalc: "mx:calc",
  mxDel: "mx:del",
  mxDelYes: "mx:del:yes",
  mxDelNo: "mx:del:no",
  mxList: "mx:list",
  mxNoop: "mx:noop",
  mxPagePrefix: "mx:pg:",
  mxOpenPrefix: "mx:o:",
  chatAskPrefix: "chat:ask:",
  chatStop: "chat:stop",
  supportNew: "sup:new",
  supportReplyPrefix: "sup:reply:",
  histPrefix: "hist:",
  histOpenPrefix: "hist:open:",
  histAskPrefix: "hist:ask:",
  histPagePrefix: "hist:pg:",
  histDelPrefix: "hist:del:",
  histDelYesPrefix: "hist:dely:",
  histDelNo: "hist:deln",
  histNoop: "hist:noop",
  /** Photo-rasklad native flow. Keep payloads short — TG limit 64 bytes. */
  phPrefix: "ph:",
  phNew: "ph:new",
  phOk: "ph:ok",
  phCancel: "ph:cancel",
  phNoop: "ph:noop",
  phOpenPrefix: "ph:o:",
  /** Spread catalog (site /rasklady parity). Keep payloads short — TG limit 64 bytes. */
  catHome: "cat:home",
  catBack: "cat:back",
  catNoop: "cat:noop",
  catFeat: "cat:feat",
  catAll: "cat:all",
  catOwn: "cat:own",
  catRun: "cat:run",
  catPrefix: "cat:",
  catCategoryPrefix: "cat:c:",
  catPagePrefix: "cat:pg:",
  catItemPrefix: "cat:i:",
  /** Finished reading pager (one message, flip pages). */
  rdPrefix: "rd:",
  rdPagePrefix: "rd:p:",
  rdNoop: "rd:noop",
  /** Rune shop — Stars invoice. Payload: rn:buy:<packageId> */
  rnPrefix: "rn:",
  rnBuyPrefix: "rn:buy:",
  /** Park Mini App destination. Payload: n:<startapp-alias> */
  navPrefix: "n:",
  /** Bot-offer profile onboarding */
  profPrefix: "prof:",
  profGenderPrefix: "prof:g:",
} as const;

export function salonKeyboard(): Keyboard {
  return new Keyboard()
    .text(NAV.matrix)
    .text(NAV.photo)
    .row()
    .text(NAV.spread)
    .text(NAV.day)
    .row()
    .text(NAV.history)
    .text(NAV.profile)
    .row()
    .text(NAV.runes)
    .text(NAV.more)
    .row()
    .text(NAV.settings)
    .text(NAV.about)
    // resized only — do NOT use persistent(): it pins the bar so users cannot
    // collapse the menu or swipe away from the bot chat comfortably.
    .resized()
    .placeholder("Выберите действие или напишите вопрос…");
}

export function ageKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Мне есть 18", CB.ageYes).text("❌ Нет", CB.ageNo);
}

export function consentKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Принимаю", CB.consentYes);
}

export function questionKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  PAIN_CHIPS.forEach((chip, i) => {
    kb.text(`💬 ${chip}`, `${CB.chipPrefix}${i}`).row();
  });
  kb.text("✍️ Свой вопрос", CB.ownQuestion);
  return kb;
}

export function catalogHomeKeyboard(
  categories: Array<{ id: string; title: string; count: number }>,
  siteCatalogUrl?: string | null
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(`⭐ ${copy.catalogFeatured}`, CB.catFeat)
    .text(`📚 ${copy.catalogAll}`, CB.catAll)
    .row();
  for (const c of categories) {
    const label = c.title.length > 28 ? `${c.title.slice(0, 26)}…` : c.title;
    kb.text(`${label} (${c.count})`, `${CB.catCategoryPrefix}${c.id}`).row();
  }
  kb.text(`✍️ ${copy.catalogOwnQuestion}`, CB.catOwn);
  if (siteCatalogUrl) {
    kb.row();
    webAppButton(kb, `🕯 ${copy.catalogOnSite}`, siteCatalogUrl);
  }
  return kb;
}

export function catalogListKeyboard(
  items: Array<{ title: string }>,
  page: number,
  totalPages: number
): InlineKeyboard {
  const kb = new InlineKeyboard();
  items.forEach((item, i) => {
    const label = item.title.length > 56 ? `${item.title.slice(0, 54)}…` : item.title;
    kb.text(label, `${CB.catItemPrefix}${i}`).row();
  });
  if (totalPages > 1) {
    const prev = page > 0 ? page - 1 : totalPages - 1;
    const next = page + 1 < totalPages ? page + 1 : 0;
    kb.text("‹", `${CB.catPagePrefix}${prev}`)
      .text(`${page + 1}/${totalPages}`, CB.catNoop)
      .text("›", `${CB.catPagePrefix}${next}`)
      .row();
  }
  kb.text(copy.catalogBack, CB.catHome);
  return kb;
}

export function catalogItemKeyboard(opts: {
  native: boolean;
  url: string;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  // Prefer in-bot run whenever API marks native (question-ready intents).
  if (opts.native !== false) {
    kb.text(`🔮 ${copy.catalogRunHere}`, CB.catRun).row();
  }
  webAppButton(kb, `🕯 ${copy.catalogOpenSite}`, opts.url).row();
  // Back to the same list page (edit in place), not a new home message.
  kb.text(copy.catalogBack, CB.catBack);
  return kb;
}

export function ctaKeyboard(url: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  webAppButton(kb, `🕯 ${copy.ctaLinkButton}`, url);
  if (isShareCardEnabled()) {
    kb.row().text("📤 Поделиться раскладом", CB.share);
  }
  return kb;
}

export function linkAccountKeyboard(url: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  return webAppButton(kb, `🔗 ${copy.ctaLinkButton}`, url);
}

export function resendCtaKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard().text(
    `🔗 ${copy.ctaResendButton}`,
    `${CB.ctaResendPrefix}${sessionId}`
  );
}

export function continueOnSiteKeyboard(url: string, label: string = copy.continueOnSite): InlineKeyboard {
  const kb = new InlineKeyboard();
  return webAppButton(kb, `🕯 ${label}`, url);
}

export function modulesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✨ Натал", CB.modNatal)
    .text("🕯 Обряды", CB.modRituals)
    .row()
    .text("🔗 Совместный", CB.modJoint)
    .text("📝 Дневник", CB.modDiary)
    .row()
    .text("💬 Память", CB.modMemory)
    .text("✉️ Поддержка", CB.modSupport)
    .row()
    .text("📂 Кабинет", CB.modCabinet);
}

/** Site deep-link only — follow-up chat in the bot is closed. */
export function chatFollowUpKeyboard(sessionId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  return webAppButton(
    kb,
    `🕯 ${copy.continueDiscussionOnSite}`,
    buildSessionChatUrl(sessionId)
  );
}

/** Premium reading album: flip pages in one message. Follow-up only via site URL. */
export function readingPagerKeyboard(opts: {
  page: number;
  total: number;
  chatUrl?: string | null;
  /** Destiny matrix actions on the same album keyboard (not a second bubble). */
  matrixActions?: boolean;
  matrixSiteUrl?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const total = Math.max(1, opts.total);
  const page = Math.min(Math.max(0, opts.page), total - 1);

  if (total > 1) {
    if (page > 0) kb.text("‹", `${CB.rdPagePrefix}${page - 1}`);
    else kb.text("·", CB.rdNoop);
    kb.text(`${page + 1} / ${total}`, CB.rdNoop);
    if (page + 1 < total) kb.text("›", `${CB.rdPagePrefix}${page + 1}`);
    else kb.text("·", CB.rdNoop);
    kb.row();
  }

  // One site CTA only — prefer session chat; otherwise matrix/cabinet URL.
  if (opts.chatUrl) {
    webAppButton(kb, `🕯 ${copy.continueDiscussionOnSite}`, opts.chatUrl).row();
  } else if (opts.matrixSiteUrl) {
    webAppButton(kb, `🕯 ${copy.continueOnSite}`, opts.matrixSiteUrl).row();
  }

  if (opts.matrixActions) {
    // Owned full report: renew or delete — not "calculate" (that's the free teaser).
    kb.text("✨ Новая матрица", CB.mxNew).text("🗑 Удалить", CB.mxDel);
  }
  return kb;
}

export function dialogStopKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Закончить диалог", CB.chatStop);
}

export function supportListKeyboard(
  tickets: Array<{ id: string }>,
  siteUrl?: string | null
): InlineKeyboard {
  const kb = new InlineKeyboard().text("✍️ Новое обращение", CB.supportNew);
  for (const t of tickets.slice(0, 5)) {
    kb.row().text(`💬 Ответить · ${t.id.slice(0, 8)}`, `${CB.supportReplyPrefix}${t.id}`);
  }
  if (siteUrl) {
    kb.row();
    webAppButton(kb, `🕯 ${copy.continueOnSite}`, siteUrl);
  }
  return kb;
}

export function historyItemKeyboard(sessionId: string): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("📜 Открыть", `${CB.histOpenPrefix}${sessionId}`)
    .row();
  return webAppButton(
    kb,
    `🕯 ${copy.continueDiscussionOnSite}`,
    buildSessionChatUrl(sessionId)
  );
}

/** Premium profile album actions — site SoT. */
export function profileKeyboard(opts: {
  linked: boolean;
  cabinetUrl?: string | null;
  runesUrl?: string | null;
  linkUrl?: string | null;
  inviteUrl?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!opts.linked && opts.linkUrl) {
    webAppButton(kb, `🔗 ${copy.ctaLinkButton}`, opts.linkUrl).row();
  }
  if (opts.cabinetUrl) {
    webAppButton(kb, `🕯 ${copy.continueOnSite}`, opts.cabinetUrl);
    if (opts.runesUrl) webAppButton(kb, "🪙 Руны", opts.runesUrl);
    kb.row();
  } else if (opts.runesUrl) {
    webAppButton(kb, "🪙 Руны", opts.runesUrl).row();
  }
  if (opts.inviteUrl) {
    // t.me invites must stay .url(); webAppButton handles that.
    webAppButton(kb, "✨ Пригласить", opts.inviteUrl).row();
  }
  return kb;
}

/** Rune shop: one package per row + cabinet card checkout. */
export function runesShopKeyboard(opts: {
  packages: Array<{
    id: string;
    name: string;
    totalRunes: number;
    stars: number;
    isPopular?: boolean;
  }>;
  shopUrl?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of opts.packages.slice(0, 4)) {
    const mark = p.isPopular ? " · выбор" : "";
    const label = `${p.name} · ${p.totalRunes}ᚢ${mark}`.slice(0, 64);
    kb.text(label, `${CB.rnBuyPrefix}${p.id}`).row();
  }
  if (opts.shopUrl) {
    webAppButton(kb, "🕯 Кабинет · картой", opts.shopUrl);
  }
  return kb;
}

/** History album: one entry per page with ‹ ›. */
export function historyPagerKeyboard(opts: {
  page: number;
  total: number;
  sessionId?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const total = Math.max(1, opts.total);
  const page = Math.min(Math.max(0, opts.page), total - 1);

  if (total > 1) {
    if (page > 0) kb.text("‹", `${CB.histPagePrefix}${page - 1}`);
    else kb.text("·", CB.histNoop);
    kb.text(`${page + 1} / ${total}`, CB.histNoop);
    if (page + 1 < total) kb.text("›", `${CB.histPagePrefix}${page + 1}`);
    else kb.text("·", CB.histNoop);
    kb.row();
  }

  if (opts.sessionId) {
    kb.text("📜 Открыть", `${CB.histOpenPrefix}${opts.sessionId}`)
      .text("🗑", `${CB.histDelPrefix}${opts.sessionId}`)
      .row();
    webAppButton(
      kb,
      `🕯 ${copy.continueDiscussionOnSite}`,
      buildSessionChatUrl(opts.sessionId)
    );
  }
  return kb;
}

export function historyDeleteConfirmKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑 Удалить", `${CB.histDelYesPrefix}${sessionId}`)
    .text("Оставить", CB.histDelNo);
}

/** Not owned yet: get full matrix + recalculate free scheme. */
export function matrixGetKeyboard(opts: {
  cost: number;
  shopUrl?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(`✨ Получить матрицу · ${opts.cost}ᚢ`, CB.mxRun)
    .row()
    .text("🔮 Рассчитать матрицу", CB.mxCalc);
  if (opts.shopUrl) {
    kb.row();
    webAppButton(kb, "🪙 Пополнить руны", opts.shopUrl);
  }
  return kb;
}

/** Owned full report actions. */
export function matrixOwnedKeyboard(opts?: { siteUrl?: string | null }): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✨ Новая матрица", CB.mxNew)
    .text("🗑 Удалить", CB.mxDel);
  if (opts?.siteUrl) {
    kb.row();
    webAppButton(kb, `🕯 ${copy.continueOnSite}`, opts.siteUrl);
  }
  return kb;
}

export function matrixDeleteConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑 Да, удалить", CB.mxDelYes)
    .text("↩ Отмена", CB.mxDelNo);
}

export function matrixNewConfirmKeyboard(cost = 20): InlineKeyboard {
  return new InlineKeyboard()
    .text(`✨ Да, новая · ${cost}ᚢ`, CB.mxNewYes)
    .text("↩ Отмена", CB.mxNewNo);
}

/** @deprecated use matrixGetKeyboard / matrixOwnedKeyboard */
export function matrixSummaryKeyboard(opts: {
  owned: boolean;
  cost: number;
  savedReports: number;
  siteUrl?: string | null;
  shopUrl?: string | null;
}): InlineKeyboard {
  if (opts.owned) return matrixOwnedKeyboard({ siteUrl: opts.siteUrl });
  return matrixGetKeyboard({ cost: opts.cost, shopUrl: opts.shopUrl });
}

/** Matrix reports album: one report preview per page. */
export function matrixListPagerKeyboard(opts: {
  page: number;
  total: number;
  reportId?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const total = Math.max(1, opts.total);
  const page = Math.min(Math.max(0, opts.page), total - 1);

  if (total > 1) {
    if (page > 0) kb.text("‹", `${CB.mxPagePrefix}${page - 1}`);
    else kb.text("·", CB.mxNoop);
    kb.text(`${page + 1} / ${total}`, CB.mxNoop);
    if (page + 1 < total) kb.text("›", `${CB.mxPagePrefix}${page + 1}`);
    else kb.text("·", CB.mxNoop);
    kb.row();
  }

  if (opts.reportId) {
    kb.text("📜 Открыть отчёт", `${CB.mxOpenPrefix}${opts.reportId}`);
  }
  return kb;
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌅 Утро", CB.remMorning)
    .text("🌙 Вечер", CB.remEvening)
    .row()
    .text("🔕 Выкл", CB.remOff)
    .row()
    .text("📝 Только текст", CB.voiceText)
    .text("🎙 Текст и голос", CB.voiceBoth)
    .row()
    .text("🌍 Часовой пояс", `${CB.tzPrefix}ask`);
}

export function timezoneKeyboard(opts?: { allowSkip?: boolean }): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("🌍 Калининград (UTC+2)", `${CB.tzPrefix}120`)
    .row()
    .text("🌍 Москва (UTC+3)", `${CB.tzPrefix}180`)
    .row()
    .text("🌍 Самара (UTC+4)", `${CB.tzPrefix}240`)
    .row()
    .text("🌍 Екатеринбург (UTC+5)", `${CB.tzPrefix}300`)
    .row()
    .text("🌍 Новосибирск (UTC+7)", `${CB.tzPrefix}420`)
    .row()
    .text("🌍 Владивосток (UTC+10)", `${CB.tzPrefix}600`);
  if (opts?.allowSkip) {
    kb.row().text("Пропустить", `${CB.tzPrefix}skip`);
  }
  return kb;
}

export function deleteKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🗑 Удалить данные", CB.delAsk);
}

export function deleteConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🗑 Да, удалить", CB.delYes).text("↩ Отмена", CB.delNo);
}

export function reactivationKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔕 Больше не беспокоить", CB.unsub);
}

export function inviteKeyboard(): InlineKeyboard {
  return new InlineKeyboard().switchInline("✉️ Пригласить в салон", "Zovus — приватный цифровой салон");
}
