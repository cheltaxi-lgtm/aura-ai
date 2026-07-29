import { InlineKeyboard, Keyboard } from "grammy";
import { copy } from "../copy/ru.js";
import { PAIN_CHIPS } from "../domain/question/validate.js";
import { buildSessionChatUrl } from "../domain/site-client.js";
import { isShareCardEnabled } from "../flags.js";

/** Persistent bottom bar — emoji allowed on buttons only (not in message bodies). */
export const NAV = {
  spread: "🔮 Расклад",
  day: "🃏 Карта дня",
  history: "📜 История",
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
  chatAskPrefix: "chat:ask:",
  chatStop: "chat:stop",
  supportNew: "sup:new",
  supportReplyPrefix: "sup:reply:",
  histPrefix: "hist:",
  histOpenPrefix: "hist:open:",
  histAskPrefix: "hist:ask:",
  histPagePrefix: "hist:pg:",
  histNoop: "hist:noop",
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
} as const;

export function salonKeyboard(): Keyboard {
  return new Keyboard()
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
    .resized()
    .persistent()
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
    kb.row().url(`🕯 ${copy.catalogOnSite}`, siteCatalogUrl);
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
  kb.url(`🕯 ${copy.catalogOpenSite}`, opts.url).row();
  // Back to the same list page (edit in place), not a new home message.
  kb.text(copy.catalogBack, CB.catBack);
  return kb;
}

export function ctaKeyboard(url: string): InlineKeyboard {
  const kb = new InlineKeyboard().url(`🕯 ${copy.ctaLinkButton}`, url);
  if (isShareCardEnabled()) {
    kb.row().text("📤 Поделиться раскладом", CB.share);
  }
  return kb;
}

export function linkAccountKeyboard(url: string): InlineKeyboard {
  return new InlineKeyboard().url(`🔗 ${copy.ctaLinkButton}`, url);
}

export function resendCtaKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard().text(
    `🔗 ${copy.ctaResendButton}`,
    `${CB.ctaResendPrefix}${sessionId}`
  );
}

export function continueOnSiteKeyboard(url: string, label: string = copy.continueOnSite): InlineKeyboard {
  return new InlineKeyboard().url(`🕯 ${label}`, url);
}

export function modulesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✨ Натал", CB.modNatal)
    .text("📜 Матрица", CB.modMatrix)
    .row()
    .text("🕯 Обряды", CB.modRituals)
    .text("🔗 Совместный", CB.modJoint)
    .row()
    .text("📝 Дневник", CB.modDiary)
    .text("💬 Память", CB.modMemory)
    .row()
    .text("🃏 Фото", CB.modPhoto)
    .text("✉️ Поддержка", CB.modSupport)
    .row()
    .text("📂 Кабинет", CB.modCabinet);
}

/** Site deep-link only — follow-up chat in the bot is closed. */
export function chatFollowUpKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard().url(
    `🕯 ${copy.continueDiscussionOnSite}`,
    buildSessionChatUrl(sessionId)
  );
}

/** Premium reading album: flip pages in one message. Follow-up only via site URL. */
export function readingPagerKeyboard(opts: {
  page: number;
  total: number;
  chatUrl?: string | null;
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

  if (opts.chatUrl) {
    kb.url(`🕯 ${copy.continueDiscussionOnSite}`, opts.chatUrl);
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
    kb.row().url(`🕯 ${copy.continueOnSite}`, siteUrl);
  }
  return kb;
}

export function historyItemKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📜 Открыть", `${CB.histOpenPrefix}${sessionId}`)
    .row()
    .url(`🕯 ${copy.continueDiscussionOnSite}`, buildSessionChatUrl(sessionId));
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
    kb.text("📜 Открыть расклад", `${CB.histOpenPrefix}${opts.sessionId}`).row();
    kb.url(`🕯 ${copy.continueDiscussionOnSite}`, buildSessionChatUrl(opts.sessionId));
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
