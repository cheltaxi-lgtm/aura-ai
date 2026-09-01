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
  /** Opens first delete warning (same as /delete). */
  delStart: "del:start",
  delAsk: "del:ask",
  delYes: "del:yes",
  delNo: "del:no",
  share: "share:spread",
  unsub: "unsub:yes",
  invite: "invite:switch",
  ctaResendPrefix: "cta:resend:",
  modNatal: "mod:natal",
  modHd: "mod:hd",
  modMatrix: "mod:matrix",
  modRituals: "mod:rituals",
  modJoint: "mod:joint",
  modMemory: "mod:memory",
  modPhoto: "mod:photo",
  modPalm: "mod:palm",
  modSupport: "mod:support",
  modCabinet: "mod:cabinet",
  /** Destiny matrix album / actions */
  mxPrefix: "mx:",
  mxRun: "mx:run",
  mxNew: "mx:new",
  mxNewYes: "mx:new:yes",
  mxNewNo: "mx:new:no",
  mxCalc: "mx:calc",
  mxPeriod: "mx:period",
  mxZones: "mx:zones",
  mxShare: "mx:share",
  mxDel: "mx:del",
  mxDelYes: "mx:del:yes",
  mxDelNo: "mx:del:no",
  mxList: "mx:list",
  mxSubjects: "mx:subj",
  mxSubjectNew: "mx:subj:new",
  mxSubjectKindPrefix: "mx:subj:k:",
  mxSubjectSelectPrefix: "mx:subj:s:",
  mxSubjectDeletePrefix: "mx:subj:del:",
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
  /** Photo history album pager — ph:pg:<n> */
  phPagePrefix: "ph:pg:",
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
  /** Rune shop — YooKassa. Payload: rn:buy:<packageId> | rn:custom */
  rnPrefix: "rn:",
  rnBuyPrefix: "rn:buy:",
  rnCustom: "rn:custom",
  /** Park Mini App destination. Payload: n:<startapp-alias> */
  navPrefix: "n:",
  /** Bot-offer profile onboarding + profile hub actions */
  profPrefix: "prof:",
  profGenderPrefix: "prof:g:",
  profCityPrefix: "prof:c:",
  profMemOn: "prof:mem:on",
  profMemOff: "prof:mem:off",
  profHist: "prof:hist",
  profRunes: "prof:runes",
  profSettings: "prof:set",
} as const;

export function salonKeyboard(): Keyboard {
  return new Keyboard()
    .text(NAV.spread)
    .text(NAV.day)
    .row()
    .text(NAV.photo)
    .text(NAV.matrix)
    .row()
    .text(NAV.profile)
    .text(NAV.about)
    // resized only — do NOT use persistent(): it pins the bar so users cannot
    // collapse the menu or swipe away from the bot chat comfortably.
    // История и Руны — в Профиле (inline), не в нижней панели.
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
  /** exact | site_only — controls in-bot button (approx = legacy alias for exact). */
  runMode?: "exact" | "approx" | "site_only";
  botCost?: number;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const mode = opts.runMode ?? (opts.native !== false ? "exact" : "site_only");
  const botCost = Math.max(0, Math.round(opts.botCost ?? 15));
  if (mode === "exact" || mode === "approx") {
    kb.text(`🔮 Сделать в боте · ${botCost}ᚢ`, CB.catRun).row();
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
    // Living cycle: zones · period · share · replace · delete.
    kb.text("🗺 Зоны", CB.mxZones)
      .text("📅 Узел периода", CB.mxPeriod)
      .row()
      .text("📤 Карточка зоны", CB.mxShare)
      .row()
      .text("✨ Новая матрица", CB.mxNew)
      .row()
      .text("🗑 Удалить разбор", CB.mxDel);
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

/**
 * Profile hub — buttons by demand:
 * History → Runes → Settings → site → invite → support → delete.
 */
export function profileKeyboard(opts: {
  linked: boolean;
  cabinetUrl?: string | null;
  loginMethodsUrl?: string | null;
  linkUrl?: string | null;
  inviteUrl?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("📚 История", CB.profHist).row();
  kb.text("🧬 Дизайн Человека", CB.modHd).row();
  kb.text("✋ Ладонь", CB.modPalm).row();
  kb.text("🪙 Руны", CB.profRunes).text("⚙️ Настройки", CB.profSettings).row();
  if (!opts.linked && opts.linkUrl) {
    webAppButton(kb, `🔗 ${copy.ctaLinkButton}`, opts.linkUrl).row();
  } else if (opts.loginMethodsUrl) {
    // OAuth (Yandex/VK) needs a full browser — Mini App WebView often breaks it.
    kb.url("🔑 Вход с сайта", opts.loginMethodsUrl).row();
    if (opts.cabinetUrl) {
      webAppButton(kb, `🕯 ${copy.continueOnSite}`, opts.cabinetUrl).row();
    }
  } else if (opts.cabinetUrl) {
    webAppButton(kb, `🕯 ${copy.continueOnSite}`, opts.cabinetUrl).row();
  }
  if (opts.inviteUrl) {
    // Open Telegram share sheet (plain t.me/bot?start= only reopens own chat).
    kb.url("✨ Пригласить", telegramShareUrl(opts.inviteUrl)).row();
  }
  kb.text("✉️ Поддержка", CB.modSupport).row();
  kb.text("🗑 Удалить аккаунт", CB.delStart);
  return kb;
}

/** Telegram native “Share” dialog with deep-link + short pitch. */
export function telegramShareUrl(
  inviteUrl: string,
  text = "Zovus — приватный цифровой салон"
): string {
  const params = new URLSearchParams({ url: inviteUrl, text });
  return `https://t.me/share/url?${params.toString()}`;
}

/** Birth-city suggestions during registration (index into flow.data.places). */
export function birthCityKeyboard(places: Array<{ label: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < Math.min(places.length, 6); i++) {
    const label = places[i]!.label.slice(0, 60);
    kb.text(label, `${CB.profCityPrefix}${i}`).row();
  }
  return kb;
}

/** Personal memory first choice during registration. */
export function memoryChoiceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✨ С памятью", CB.profMemOn)
    .row()
    .text("Без памяти", CB.profMemOff);
}

/** Rune shop: package → YooKassa (callback creates payment URL). */
export function runesShopKeyboard(opts: {
  packages: Array<{
    id: string;
    name: string;
    totalRunes: number;
    priceRub: number;
    isPopular?: boolean;
  }>;
  shopUrl?: string | null;
  customAmount?: boolean;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of opts.packages.slice(0, 4)) {
    const mark = p.isPopular ? " · ⭐" : "";
    const rub = Math.max(0, Math.round(p.priceRub || 0));
    const label = `${p.name} · ${p.totalRunes}ᚢ · ${rub} ₽${mark}`.slice(0, 64);
    kb.text(label, `${CB.rnBuyPrefix}${p.id}`).row();
  }
  if (opts.customAmount !== false) {
    kb.text("✍️ Своя сумма", CB.rnCustom).row();
  }
  if (opts.shopUrl) {
    kb.url("🕯 Кабинет · все пакеты", opts.shopUrl);
  }
  return kb;
}

/** One-shot pay button after YooKassa payment is created. */
export function runesPayKeyboard(paymentUrl: string, priceRub: number): InlineKeyboard {
  const rub = Math.max(0, Math.round(priceRub || 0));
  return new InlineKeyboard().url(`💳 Оплатить · ${rub} ₽`, paymentUrl);
}

/** Photo history album: pager + single Open action. */
export function photoPagerKeyboard(opts: {
  page: number;
  total: number;
  historyId?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const total = Math.max(1, opts.total);
  const page = Math.min(Math.max(0, opts.page), total - 1);

  if (total > 1) {
    if (page > 0) kb.text("‹", `${CB.phPagePrefix}${page - 1}`);
    else kb.text("·", CB.phNoop);
    kb.text(`${page + 1} / ${total}`, CB.phNoop);
    if (page + 1 < total) kb.text("›", `${CB.phPagePrefix}${page + 1}`);
    else kb.text("·", CB.phNoop);
    kb.row();
  }

  if (opts.historyId) {
    kb.text("📜 Открыть", `${CB.phOpenPrefix}${opts.historyId}`);
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

/**
 * Not owned yet: one primary CTA.
 * «Пополнить» only when balance is known and below cost — иначе шум и дубль с меню «Руны».
 */
export function matrixGetKeyboard(opts: {
  cost: number;
  shopUrl?: string | null;
  runeBalance?: number | null;
}): InlineKeyboard {
  const cost = Math.max(0, Math.round(opts.cost || 0));
  const kb = new InlineKeyboard()
    .text(`✨ Получить полный разбор · ${cost}ᚢ`, CB.mxRun)
    .row()
    .text("📅 Узел периода", CB.mxPeriod)
    .row()
    .text("👥 Чья матрица", CB.mxSubjects);
  const bal = opts.runeBalance;
  const needTopUp =
    typeof bal === "number" && Number.isFinite(bal) && bal < cost && Boolean(opts.shopUrl);
  if (needTopUp && opts.shopUrl) {
    kb.row();
    webAppButton(kb, "🪙 Пополнить руны", opts.shopUrl);
  }
  return kb;
}

/** Owned full report actions (standalone; pager uses readingPagerKeyboard). */
export function matrixOwnedKeyboard(opts?: { siteUrl?: string | null }): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("🗺 Зоны", CB.mxZones)
    .text("📅 Узел периода", CB.mxPeriod)
    .row()
    .text("📤 Карточка зоны", CB.mxShare)
    .row()
    .text("👥 Чья матрица", CB.mxSubjects)
    .text("📚 Мои отчёты", CB.mxList)
    .row()
    .text("✨ Новая матрица", CB.mxNew)
    .row()
    .text("🗑 Удалить разбор", CB.mxDel);
  if (opts?.siteUrl) {
    kb.row();
    webAppButton(kb, `🕯 ${copy.continueDiscussionOnSite}`, opts.siteUrl);
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
  return new InlineKeyboard().text("🗑 Удалить аккаунт Zovus", CB.delAsk);
}

export function deleteConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑 Да, удалить навсегда", CB.delYes)
    .text("↩ Отмена", CB.delNo);
}

export function reactivationKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔕 Больше не беспокоить", CB.unsub);
}

export function inviteKeyboard(inviteUrl?: string | null): InlineKeyboard {
  if (inviteUrl) {
    return new InlineKeyboard().url("✉️ Пригласить в салон", telegramShareUrl(inviteUrl));
  }
  // Fallback when ref link is unavailable — requires inline mode on the bot.
  return new InlineKeyboard().switchInline(
    "✉️ Пригласить в салон",
    "Zovus — приватный цифровой салон"
  );
}
