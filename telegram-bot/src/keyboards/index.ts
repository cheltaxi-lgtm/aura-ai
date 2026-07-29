import { InlineKeyboard, Keyboard } from "grammy";
import { copy } from "../copy/ru.js";
import { PAIN_CHIPS } from "../domain/question/validate.js";
import { isShareCardEnabled } from "../flags.js";

/** Persistent bottom bar — emoji allowed on buttons only (not in message bodies). */
export const NAV = {
  spread: "🔮 Расклад",
  day: "🃏 Карта дня",
  history: "📜 История",
  profile: "👤 Профиль",
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
} as const;

export function salonKeyboard(): Keyboard {
  return new Keyboard()
    .text(NAV.spread)
    .text(NAV.day)
    .row()
    .text(NAV.history)
    .text(NAV.profile)
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
