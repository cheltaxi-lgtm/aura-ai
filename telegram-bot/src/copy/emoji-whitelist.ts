/**
 * Emoji allowed on button labels only (never in message bodies).
 * Sourced from keyboards/index.ts NAV + inline controls.
 */
export const BUTTON_EMOJI_WHITELIST = [
  "🔮",
  "🃏",
  "📜",
  "👤",
  "🪙",
  "📂",
  "⚙️",
  "✨",
  "🔗",
  "✅",
  "❌",
  "💬",
  "✍️",
  "🕯",
  "📤",
  "🌅",
  "🌙",
  "🔕",
  "📝",
  "🎙",
  "🌍",
  "🗑",
  "↩",
  "✉️",
] as const;

export const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

export function stripWhitelistedEmoji(text: string): string {
  let out = text;
  for (const e of BUTTON_EMOJI_WHITELIST) {
    out = out.split(e).join("");
  }
  return out;
}

export function hasDisallowedEmoji(text: string): boolean {
  return EMOJI_RE.test(stripWhitelistedEmoji(text));
}
