/**
 * Telegram sizes bubbles by content width. Short captions look narrow next to
 * long reading pages — pad with Braille blanks (invisible, still counted).
 */
const PAD_CHAR = "\u2800"; // BRAILLE PATTERN BLANK
/** ~ phone-chat full width for typical Cyrillic UI fonts */
const PAD_LEN = 42;

export function telegramWidthPad(): string {
  return PAD_CHAR.repeat(PAD_LEN);
}

/** Append width pad once (safe for HTML / plain). */
export function widenTelegramText(text: string): string {
  const t = (text || "").replace(/\s+$/u, "");
  if (!t) return telegramWidthPad();
  if (t.includes(PAD_CHAR.repeat(8))) return t;
  return `${t}\n${telegramWidthPad()}`;
}
