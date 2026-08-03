/** Shared quality metrics for reading audits (scripts only, no runtime imports). */

/** Filler the prompts explicitly ban — presence means the rules are not holding. */
export const FILLER_PHRASES = [
  "энерги",
  "вибраци",
  "вселенная",
  "период трансформации",
  "карты шепчут",
  "прислушайтесь к себе",
  "прислушайся к себе",
  "истинный путь",
  "высшее я",
  "зона комфорта",
  "всё будет хорошо",
  "все будет хорошо",
  "данный",
  "являться",
  "представляет собой",
  "в контексте",
  "с точки зрения",
  "необходимо отметить",
  "следует подчеркнуть",
  "позитивные тенденции",
  "благоприятные перспективы",
];

export const HEDGE_WORDS = ["возможно", "вероятно", "может быть", "не исключено"];

export function countSentences(text: string): number {
  return text.split(/[.!?…]+(?:\s|$)/u).filter((s) => s.trim().length > 2).length;
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

export function fillerHits(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLER_PHRASES.filter((p) => lower.includes(p));
}

export function hedgeHits(text: string): number {
  const lower = text.toLowerCase();
  return HEDGE_WORDS.reduce((n, w) => n + (lower.match(new RegExp(w, "gu"))?.length ?? 0), 0);
}

/** Verbatim reuse of the textbook gloss we fed the model = dictionary, not a reading. */
export function glossEchoRatio(text: string, meanings: string[]): number {
  const lower = text.toLowerCase();
  let echoed = 0;
  for (const meaning of meanings) {
    const core = meaning.replace(/^[^:]+:\s*/, "").trim().toLowerCase();
    if (!core) continue;
    const chunk = core.split(/[,;.]/)[0]?.trim();
    if (chunk && chunk.length >= 12 && lower.includes(chunk)) echoed += 1;
  }
  return meanings.length ? Math.round((echoed / meanings.length) * 100) : 0;
}

/** Distinct 5-word phrases repeated inside one reading. */
export function repeatedPhrases(text: string): number {
  const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/u).filter(Boolean);
  const seen = new Map<string, number>();
  for (let i = 0; i + 5 <= words.length; i++) {
    const key = words.slice(i, i + 5).join(" ");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.values()].filter((n) => n >= 2).length;
}

export function hasFinalBlock(text: string): boolean {
  const tail = text.trim().slice(-900).toLowerCase();
  return /итог|вывод|простыми словами|в сумме|что делать|если коротко|резюме/u.test(tail);
}

/** JS \b is ASCII-only, so Cyrillic word boundaries need explicit lookarounds. */
function wordRe(words: string[], flags = "u"): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${words.join("|")})(?!\\p{L})`, flags);
}

const VERDICT_WORDS = [
  "да",
  "нет",
  "вернётся",
  "вернется",
  "уходи",
  "оставайся",
  "бери",
  "стоит",
  "не стоит",
  "вердикт",
  "жёстк\\w*",
  "жестк\\w*",
  "смешанн\\w*",
  "в плюс",
  "шанс\\w*",
  "риск",
  "правда в том",
  "коротко",
  "не время",
];

/** Verdict should land in the opening, not after ten paragraphs of setup. */
export function verdictUpFront(text: string): boolean {
  return wordRe(VERDICT_WORDS).test(text.trim().slice(0, 420).toLowerCase());
}

/** Second person mixed inside one reading ("твои карты" + "в вашем союзе"). */
export function mixesTuVy(text: string): boolean {
  // Ignore quoted position labels («Вы») and **bold** spans.
  const lower = text
    .replace(/\*\*[^*\n]{1,120}\*\*/gu, " ")
    .replace(/[«"][^»"\n]{1,80}[»"]/gu, " ")
    .toLowerCase();
  const tu = wordRe(["ты", "тебе", "тебя", "твой", "твоя", "твои", "твоё", "твоего", "тобой"]).test(lower);
  const vy = wordRe(["вы", "вам", "вас", "ваш", "ваша", "ваши", "ваше", "вашем", "вашего", "вами"]).test(lower);
  return tu && vy;
}

/** The tarot thematic format mandates a closing "## Простыми словами" section. */
export function hasSimplyWordsSection(text: string): boolean {
  return /##\s*Простыми словами/iu.test(text);
}

/** Every reading opening with the same phrase = templated, not a master's voice. */
export function openingLine(text: string): string {
  return text.trim().split(/\n/)[0]?.slice(0, 70) ?? "";
}

/** Lexical fingerprint for cross-master voice comparison. */
export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/u)
      .filter((w) => w.length >= 6)
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Math.round((inter / union) * 100) : 0;
}
