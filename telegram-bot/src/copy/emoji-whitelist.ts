/**
 * Emoji allowed on button labels only (never in message bodies).
 * Sourced from keyboards/index.ts NAV + inline controls.
 */
export const BUTTON_EMOJI_WHITELIST = [
  "\u{1F52E}", // crystal ball
  "\u{1F0CF}", // joker
  "\u{1F4DC}", // scroll
  "\u{1F4DA}", // books
  "\u{1F4F7}", // camera
  "\u{1F464}", // bust
  "\u{1FA99}", // coin
  "\u{1F4C2}", // open folder
  "\u{2699}\u{FE0F}", // gear
  "\u{2728}", // sparkles
  "\u{1F517}", // link
  "\u{2705}", // check
  "\u{274C}", // cross
  "\u{1F4AC}", // speech
  "\u{270D}\u{FE0F}", // writing hand
  "\u{1F56F}\u{FE0F}", // candle
  "\u{1F4E4}", // outbox
  "\u{1F305}", // sunrise
  "\u{1F319}", // moon
  "\u{1F515}", // bell off
  "\u{1F4DD}", // memo
  "\u{1F399}\u{FE0F}", // studio mic
  "\u{1F30D}", // globe
  "\u{1F5D1}\u{FE0F}", // wastebasket
  "\u{21A9}\u{FE0F}", // return
  "\u{2709}\u{FE0F}", // envelope
  "\u{1F4B0}", // money bag (matrix get)
  "\u{1F49E}", // revolving hearts
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
