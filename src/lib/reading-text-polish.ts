/**
 * Fix broken LLM markdown in spread readings — empty * *, orphan asterisks.
 */

const DEFAULT_MAX_CARDS = 10;

/** Markdown image — URL may be empty when the model emits broken `![Name]()`. */
export const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
export const MARKDOWN_IMAGE_LINE_PATTERN = /^(?:!\[[^\]]*\]\([^)]*\)\s*)+$/;

const CARD_IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/;

/** Remove all markdown card/rune images (header row already shows the spread). */
export function stripAllSpreadCardImages(content: string): string {
  return content
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(/^[ \t]*\n/gm, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove leading markdown card images (used when the spread row already shows cards). */
export function stripLeadingSpreadCardImages(content: string): string {
  const lines = content.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    if (CARD_IMAGE_LINE_RE.test(line)) {
      index += 1;
      continue;
    }
    break;
  }

  return lines.slice(index).join("\n").trim();
}

/** Extract card/rune names from leading ![Name](url) image block. */
export function cardNamesFromImageMarkdown(text: string, maxCards = DEFAULT_MAX_CARDS): string[] {
  const names: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^!\[([^\]]+)\]\(/);
    if (!m) break;
    const name = m[1]?.trim();
    if (name) names.push(name);
  }
  return names.slice(0, maxCards);
}

/** Card names from image block and/or **Name** markers in the reading body. */
export function inferSpreadCardNames(text: string, cardNames?: string[]): string[] {
  const limit = cardNames?.length ?? DEFAULT_MAX_CARDS;
  const fromImages = cardNamesFromImageMarkdown(text, limit);
  if (cardNames?.length && fromImages.length >= cardNames.length) {
    return fromImages.slice(0, limit);
  }
  if (fromImages.length >= Math.min(3, limit)) return fromImages;

  const fromBold: string[] = [];
  for (const m of text.matchAll(/\*\*([^*]{2,40})\*\*/gu)) {
    const n = m[1].trim();
    if (/^(?:ваш расклад|простыми словами|утро|день|вечер)$/iu.test(n)) continue;
    if (!fromBold.some((x) => x.toLowerCase() === n.toLowerCase())) fromBold.push(n);
  }
  return fromBold.slice(0, limit);
}

/** Latin terms allowed in Russian master voice (runes, vedic, deck names). */
const ALLOWED_LATIN_WORDS = new Set([
  "fehu", "uruz", "thurisaz", "ansuz", "raido", "raidho", "kenaz", "gebo", "wunjo",
  "hagalaz", "nauthiz", "isa", "jera", "eihwaz", "perthro", "algiz", "ehwaz", "sowilo",
  "tiwaz", "berkano", "dagaz", "othala", "ingwaz", "mannaz", "laguz", "odin",
  "shani", "rahu", "ketu", "guru", "dharma", "karma", "surya", "chandra", "mangal",
  "budha", "shukra",
  "rider", "waite", "lenormand", "tarot", "rws",
  "ace", "king", "queen", "knight", "page", "of", "wands", "cups", "swords", "pentacles",
]);

/** Common English leaks from LLM → Russian replacements. */
const ENGLISH_TO_RUSSIAN: Record<string, string> = {
  guarded: "закрыта",
  hidden: "скрыта",
  safely: "безопасно",
  safe: "безопасно",
  carefully: "аккуратно",
  careful: "осторожно",
  quietly: "тихо",
  slowly: "медленно",
  instead: "вместо этого",
  however: "однако",
  maybe: "может",
  important: "важно",
  information: "информация",
  energy: "энергия",
  shadow: "тень",
  challenge: "испытание",
  opportunity: "возможность",
  situation: "ситуация",
  focus: "фокус",
  release: "отпускание",
  blocked: "заблокировано",
  blocking: "мешает",
  inner: "внутренний",
  outer: "внешний",
  truly: "по-настоящему",
  really: "действительно",
  actually: "на самом деле",
  simply: "просто",
  clearly: "ясно",
  directly: "прямо",
  gently: "мягко",
  deeply: "глубоко",
  strongly: "сильно",
  likely: "вероятно",
  unlikely: "маловероятно",
  potential: "потенциал",
  obvious: "очевидно",
  subtle: "тонко",
  private: "личное",
  public: "публичное",
  open: "открыто",
  closed: "закрыто",
  alone: "один",
  together: "вместе",
  trust: "доверие",
  fear: "страх",
  hope: "надежда",
  truth: "правда",
  lie: "ложь",
  lies: "ложь",
  self: "себя",
  yourself: "себя",
};

/**
 * Remove or translate stray English words in predominantly Russian readings.
 * Keeps rune/vedic/deck terms; maps common leaks; drops unknown Latin tokens.
 */
export function stripEnglishLeakageFromRussianText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const cyrillic = (trimmed.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latin = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  if (cyrillic < 16 || latin < 2) return trimmed;

  let out = trimmed.replace(
    /(?<![A-Za-z0-9_/])([A-Za-z]{2,})(?![A-Za-z0-9_/])/g,
    (word) => {
      const lower = word.toLowerCase();
      if (ALLOWED_LATIN_WORDS.has(lower)) return word;
      const repl = ENGLISH_TO_RUSSIAN[lower];
      if (repl) return repl;
      return "";
    }
  );

  return out
    .replace(/\s+([.,!?;:—–-])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n /g, "\n")
    .trim();
}

/** Drop duplicated trailing chat-invite hooks from model + prompt. */
function dedupeTrailingChatHooks(text: string): string {
  const re =
    /Останутся сомнения[^\n.]{0,120}(?:разберём|разберем) глубже\.?/giu;
  const matches = [...text.matchAll(re)];
  if (matches.length <= 1) return text;
  let out = text;
  for (const m of matches.slice(0, -1)) {
    out = out.replace(m[0], "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Spaces around em/en dashes glued by the model: «настоящем—здесь» → «настоящем — здесь». */
export function normalizeDashSpacing(text: string): string {
  return text
    .replace(/([^\s—–])([—–])/gu, "$1 $2")
    .replace(/([—–])([^\s—–])/gu, "$1 $2");
}

const NUM_WORD_TO_RANK: Record<string, string> = {
  два: "Двойка",
  две: "Двойка",
  три: "Тройка",
  четыре: "Четвёрка",
  пять: "Пятёрка",
  шесть: "Шестёрка",
  семь: "Семёрка",
  восемь: "Восьмёрка",
  девять: "Девятка",
  десять: "Десятка",
};

const SUIT_TO_GENITIVE: Record<string, string> = {
  кубки: "Кубков",
  кубков: "Кубков",
  жезлы: "Жезлов",
  жезлов: "Жезлов",
  мечи: "Мечей",
  мечей: "Мечей",
  пентакли: "Пентаклей",
  пентаклей: "Пентаклей",
  монеты: "Пентаклей",
  монет: "Пентаклей",
};

/** JS \\b is ASCII-only — use unicode letter boundaries for Cyrillic. */
const WB_L = "(?<![\\p{L}\\p{N}_])";
const WB_R = "(?![\\p{L}\\p{N}_])";

/**
 * Fix spoken numeral+suit mistakes: «Три Кубки» / «Шесть Мечей» → «Тройка Кубков» / «Шестёрка Мечей».
 * Leaves canonical deck labels like «3 Кубков» and already-correct «Тройка Кубков» alone.
 */
export function fixSpokenMinorArcanaNames(text: string): string {
  const re = new RegExp(
    `${WB_L}(два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\\s+(кубки|кубков|жезлы|жезлов|мечи|мечей|пентакли|пентаклей|монеты|монет)${WB_R}`,
    "giu"
  );
  return text.replace(re, (full, numRaw: string, suitRaw: string) => {
    const rank = NUM_WORD_TO_RANK[numRaw.toLowerCase()];
    const suit = SUIT_TO_GENITIVE[suitRaw.toLowerCase()];
    if (!rank || !suit) return full;
    const titled =
      full[0] && full[0] === full[0].toUpperCase() ? rank : rank.toLowerCase();
    return `${titled} ${suit}`;
  });
}

/** Keep ## Простыми словами on its own lines when the model glues it mid-paragraph. */
function ensureSimplyHeadingBreaks(text: string): string {
  return text
    .replace(/([^\n])[ \t]*(##\s*Простыми словами)/giu, "$1\n\n$2")
    .replace(/(##\s*Простыми словами)[ \t]+(?=\S)/giu, "$1\n\n");
}

/** Frequent LLM slips that make readings look illiterate. */
function fixCommonReadingTypos(text: string): string {
  const pairs: Array<[string, string]> = [
    ["верталось", "возвращалось"],
    ["вертался", "возвращался"],
    ["верталась", "возвращалась"],
    ["пресыть", "приесться"],
  ];
  let out = text;
  for (const [from, to] of pairs) {
    out = out.replace(new RegExp(`${WB_L}${from}${WB_R}`, "giu"), (m) =>
      m[0] && m[0] === m[0].toUpperCase()
        ? to[0]!.toUpperCase() + to.slice(1)
        : to
    );
  }
  return out;
}

/** Replace empty emphasis / orphan stars; optionally inject spread card names. */
export function polishSpreadReadingText(text: string, cardNames?: string[]): string {
  let out = text.replace(/\r\n/g, "\n");
  const cards = (cardNames ?? []).map((c) => c.trim()).filter(Boolean);
  let cardIdx = 0;

  const nextCard = (): string => {
    if (cardIdx < cards.length) return `**${cards[cardIdx++]}**`;
    return "";
  };

  // Empty emphasis placeholders → real card names (must run before orphan stripping).
  out = out.replace(/\*\s+\*/g, nextCard);
  out = out.replace(/\*\*(?:\s|\u00a0)+\*\*/g, nextCard);

  // Leftover empty emphasis only — keep valid **Name** pairs intact.
  out = out.replace(/\*\s+\*/g, "");
  out = out.replace(/\*\*(?:\s|\u00a0)*\*\*/g, "");

  out = stripEnglishLeakageFromRussianText(out);
  out = fixSpokenMinorArcanaNames(out);
  out = normalizeDashSpacing(out);
  out = ensureSimplyHeadingBreaks(out);
  out = fixCommonReadingTypos(out);
  out = dedupeTrailingChatHooks(out);

  return out.replace(/  +/g, " ").trim();
}
