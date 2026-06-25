/**
 * Exhaustive vision-label → Aura symbol name aliases for photo reading.
 * Built programmatically from deck data + hand-curated vision variants.
 */
import { FULL_DECK, MAJOR_ARCANA, findTarotCardByName } from "@/lib/tarot";
import { RUNE_SYMBOLS } from "@/lib/decks/runes";
import { SLAVIC_SYMBOLS } from "@/lib/decks/slavic";
import { ASTROLOGY_SYMBOLS } from "@/lib/decks/astrology";
import {
  ASTROLOGY_VISION_ALIASES,
  MAJOR_RU_VISION_ALIASES,
  MAJOR_VISION_ALIASES,
  MINOR_VISION_ALIASES,
  RUNE_VISION_ALIASES,
  SLAVIC_VISION_ALIASES,
} from "@/lib/photo-card-alias-corpus";

export function foldAliasKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[-–—_/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function add(map: Map<string, string>, alias: string, canonical: string) {
  const key = foldAliasKey(alias);
  if (!key) return;
  map.set(key, canonical);
}

const ROMAN_BY_ID = [
  "0",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
  "XXI",
];

const MAJOR_SLUG_ALIASES: [string, string][] = [
  ["the fool", "Шут"],
  ["fool", "Шут"],
  ["the magician", "Маг"],
  ["magician", "Маг"],
  ["the high priestess", "Жрица"],
  ["high priestess", "Жрица"],
  ["priestess", "Жрица"],
  ["papess", "Жрица"],
  ["popess", "Жрица"],
  ["la papessa", "Жрица"],
  ["the empress", "Императрица"],
  ["empress", "Императрица"],
  ["the emperor", "Император"],
  ["emperor", "Император"],
  ["the hierophant", "Иерофант"],
  ["hierophant", "Иерофант"],
  ["high priest", "Иерофант"],
  ["pope", "Иерофант"],
  ["the lovers", "Влюблённые"],
  ["lovers", "Влюблённые"],
  ["the chariot", "Колесница"],
  ["chariot", "Колесница"],
  ["strength", "Сила"],
  ["force", "Сила"],
  ["the hermit", "Отшельник"],
  ["hermit", "Отшельник"],
  ["wheel of fortune", "Колесо Фортуны"],
  ["wheel", "Колесо Фортуны"],
  ["fortune", "Колесо Фортуны"],
  ["justice", "Справедливость"],
  ["the hanged man", "Повешенный"],
  ["hanged man", "Повешенный"],
  ["hangman", "Повешенный"],
  ["death", "Смерть"],
  ["temperance", "Умеренность"],
  ["the devil", "Дьявол"],
  ["devil", "Дьявол"],
  ["the tower", "Башня"],
  ["tower", "Башня"],
  ["the star", "Звезда"],
  ["star", "Звезда"],
  ["the moon", "Луна"],
  ["moon", "Луна"],
  ["the sun", "Солнце"],
  ["sun", "Солнце"],
  ["judgement", "Суд"],
  ["judgment", "Суд"],
  ["the world", "Мир"],
  ["world", "Мир"],
];

const MAJOR_RU_ALIASES: [string, string][] = [
  ["шут", "Шут"],
  ["дурак", "Шут"],
  ["безумец", "Шут"],
  ["маг", "Маг"],
  ["волшебник", "Маг"],
  ["фокусник", "Маг"],
  ["жрица", "Жрица"],
  ["верховная жрица", "Жрица"],
  ["высшая жрица", "Жрица"],
  ["папесса", "Жрица"],
  ["императрица", "Императрица"],
  ["император", "Император"],
  ["иерофант", "Иерофант"],
  ["верховный жрец", "Иерофант"],
  ["великий иерофант", "Иерофант"],
  ["первосвященник", "Иерофант"],
  ["жрец", "Иерофант"],
  ["влюбленные", "Влюблённые"],
  ["любовники", "Влюблённые"],
  ["колесница", "Колесница"],
  ["колесо фортуны", "Колесо Фортуны"],
  ["колесофортуны", "Колесо Фортуны"],
  ["фортуна", "Колесо Фортуны"],
  ["сила", "Сила"],
  ["отшельник", "Отшельник"],
  ["справедливость", "Справедливость"],
  ["правосудие", "Справедливость"],
  ["повешенный", "Повешенный"],
  ["смерть", "Смерть"],
  ["умеренность", "Умеренность"],
  ["ангел", "Умеренность"],
  ["дьявол", "Дьявол"],
  ["башня", "Башня"],
  ["молния", "Башня"],
  ["звезда", "Звезда"],
  ["луна", "Луна"],
  ["солнце", "Солнце"],
  ["суд", "Суд"],
  ["последний суд", "Суд"],
  ["страшный суд", "Суд"],
  ["мир", "Мир"],
  ["вселенная", "Мир"],
];

const RANK_EN: Record<string, string> = {
  ace: "Туз",
  one: "Туз",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  page: "Паж",
  knave: "Паж",
  jack: "Паж",
  valet: "Паж",
  knight: "Рыцарь",
  queen: "Королева",
  king: "Король",
};

const RANK_RU: Record<string, string> = {
  туз: "Туз",
  "1": "Туз",
  двойка: "2",
  "2": "2",
  тройка: "3",
  "3": "3",
  четверка: "4",
  "4": "4",
  пятерка: "5",
  "5": "5",
  шестерка: "6",
  "6": "6",
  семерка: "7",
  "7": "7",
  восьмерка: "8",
  "8": "8",
  девятка: "9",
  "9": "9",
  десятка: "10",
  "10": "10",
  паж: "Паж",
  рыцарь: "Рыцарь",
  королева: "Королева",
  король: "Король",
};

const SUIT_EN: Record<string, string> = {
  cups: "Кубков",
  cup: "Кубков",
  chalices: "Кубков",
  chalice: "Кубков",
  wands: "Жезлов",
  wand: "Жезлов",
  rods: "Жезлов",
  rod: "Жезлов",
  staves: "Жезлов",
  stave: "Жезлов",
  staffs: "Жезлов",
  staff: "Жезлов",
  batons: "Жезлов",
  baton: "Жезлов",
  swords: "Мечей",
  sword: "Мечей",
  blades: "Мечей",
  pentacles: "Пентаклей",
  pentacle: "Пентаклей",
  coins: "Пентаклей",
  coin: "Пентаклей",
  disks: "Пентаклей",
  disk: "Пентаклей",
  diamonds: "Пентаклей",
  clubs: "Жезлов",
  spades: "Мечей",
  hearts: "Кубков",
};

const SUIT_RU: Record<string, string> = {
  кубков: "Кубков",
  кубки: "Кубков",
  чаш: "Кубков",
  чаши: "Кубков",
  жезлов: "Жезлов",
  жезлы: "Жезлов",
  посохов: "Жезлов",
  посохи: "Жезлов",
  мечей: "Мечей",
  мечи: "Мечей",
  меч: "Мечей",
  пентаклей: "Пентаклей",
  пентакл: "Пентаклей",
  пентакли: "Пентаклей",
  монет: "Пентаклей",
  монеты: "Пентаклей",
  монета: "Пентаклей",
  денариев: "Пентаклей",
  денарий: "Пентаклей",
};

const PLANET_EN: Record<string, string> = {
  sun: "Сурья",
  surya: "Сурья",
  moon: "Чандра",
  chandra: "Чандра",
  mars: "Мангала",
  mangala: "Мангала",
  mercury: "Будха",
  budha: "Будха",
  budh: "Будха",
  jupiter: "Гуру",
  guru: "Гуру",
  brihaspati: "Гуру",
  venus: "Шукра",
  shukra: "Шукра",
  saturn: "Шани",
  shani: "Шани",
  rahu: "Раху",
  ketu: "Кету",
  "north node": "Раху",
  "south node": "Кету",
};

const ZODIAC_EN: Record<string, string> = {
  aries: "Овен",
  taurus: "Телец",
  gemini: "Близнецы",
  cancer: "Рак",
  leo: "Лев",
  virgo: "Дева",
  libra: "Весы",
  scorpio: "Скорпион",
  sagittarius: "Стрелец",
  capricorn: "Козерог",
  aquarius: "Водолей",
  pisces: "Рыбы",
};

const MAJOR_NUMERAL_PREFIX = /^(0|[1-9]|1[0-9]|2[01]|X{0,3}(?:IX|IV|V?I{0,3}))[.\s\-–—]+(.+)$/i;

const TITLE_PREFIX =
  /^(?:верховн(?:ая|ый|ое)|высш(?:ая|ий|ее)|велик(?:ая|ий|ое)|стар(?:шая|ый)|младш(?:ая|ый)|старш(?:ий|ая)\s+аркан|младш(?:ий|ая)\s+аркан|таро|карт(?:а)?|the|arcana|arkana|major|minor|arcano|\d+\s*(?:аркан|arcana))\s+/i;

function buildMinorCanonical(rankKey: string, suitKey: string): string | undefined {
  const rank = RANK_EN[rankKey];
  const suit = SUIT_EN[suitKey];
  if (!rank || !suit) return undefined;
  return rank === "Туз" ? `Туз ${suit}` : `${rank} ${suit}`;
}

const RANK_NUM: Record<string, string> = {
  ace: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function ruRankWordForLabel(rankLabel: string): string | undefined {
  const word = Object.entries(RANK_RU).find(
    ([k, v]) => v === rankLabel && !/^\d+$/.test(k)
  );
  if (word) return word[0];
  return Object.entries(RANK_RU).find(([, v]) => v === rankLabel)?.[0];
}

function registerMinorAliases(map: Map<string, string>) {
  const rankKeys = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "page", "knight", "queen", "king"] as const;
  const suitKeys = ["cups", "wands", "swords", "pentacles"] as const;

  for (const suitKey of suitKeys) {
    for (const rankKey of rankKeys) {
      const canonical = buildMinorCanonical(rankKey, suitKey);
      if (!canonical || !findTarotCardByName(canonical)) continue;

      add(map, canonical, canonical);
      add(map, `${rankKey} of ${suitKey}`, canonical);
      add(map, `${rankKey} ${suitKey}`, canonical);
      add(map, `${suitKey} ${rankKey}`, canonical);
      add(map, `${rankKey}-of-${suitKey}`, canonical);

      const num = RANK_NUM[rankKey];
      if (num) {
        add(map, `${num} of ${suitKey}`, canonical);
        add(map, `${num} ${suitKey}`, canonical);
        add(map, `${suitKey} ${num}`, canonical);
      }

      const rankRu = RANK_EN[rankKey];
      const suitRu = SUIT_EN[suitKey];
      if (rankRu && suitRu) {
        add(map, `${rankRu} ${suitRu}`, canonical);
        const ruRankWord = ruRankWordForLabel(rankRu);
        const ruSuitWord = Object.entries(SUIT_RU).find(([, v]) => v === suitRu)?.[0];
        if (ruRankWord && ruSuitWord) {
          add(map, `${ruRankWord} ${ruSuitWord}`, canonical);
          add(map, `${ruSuitWord} ${ruRankWord}`, canonical);
        }
      }
    }
  }
}

function registerMajorAliases(map: Map<string, string>) {
  for (const card of MAJOR_ARCANA) {
    add(map, card.name, card.name);
    add(map, card.name.replace(/ё/g, "е"), card.name);

    const roman = ROMAN_BY_ID[card.id];
    if (roman) {
      add(map, `${roman} ${card.name}`, card.name);
      add(map, `${roman}. ${card.name}`, card.name);
    }
    add(map, `${card.id} ${card.name}`, card.name);
  }

  for (const [alias, canonical] of MAJOR_SLUG_ALIASES) add(map, alias, canonical);
  for (const [alias, canonical] of MAJOR_RU_ALIASES) add(map, alias, canonical);
}

function registerSymbolDeck(
  map: Map<string, string>,
  symbols: Array<{ name: string; slug?: string }>
) {
  for (const sym of symbols) {
    add(map, sym.name, sym.name);
    if (sym.slug) {
      add(map, sym.slug, sym.name);
      add(map, sym.slug.replace(/-/g, " "), sym.name);
    }
  }
}

function registerCuratedPairs(
  map: Map<string, string>,
  pairs: readonly (readonly [string, string])[]
) {
  for (const [alias, canonical] of pairs) {
    add(map, alias, canonical);
  }
}

function registerFullDeckSymbolVariants(map: Map<string, string>) {
  for (const card of FULL_DECK) {
    add(map, card.name, card.name);
    add(map, card.name.replace(/ё/g, "е"), card.name);
  }
  for (const sym of [...RUNE_SYMBOLS, ...SLAVIC_SYMBOLS, ...ASTROLOGY_SYMBOLS]) {
    add(map, sym.name, sym.name);
    add(map, sym.name.replace(/ё/g, "е"), sym.name);
    if (sym.slug) {
      add(map, sym.slug, sym.name);
      add(map, sym.slug.replace(/-/g, " "), sym.name);
    }
  }
}

function resolveRankLabel(token: string): string | undefined {
  const t = foldAliasKey(token);
  if (RANK_RU[t]) return RANK_RU[t];
  if (RANK_EN[t]) return RANK_EN[t];
  if (/^\d+$/.test(t)) {
    const n = Number.parseInt(t, 10);
    if (n === 1) return "Туз";
    if (n >= 2 && n <= 10) return String(n);
  }
  for (const [key, label] of Object.entries(RANK_RU)) {
    if (foldAliasKey(key) === t) return label;
  }
  return undefined;
}

const SUIT_GENITIVES = new Set(["Кубков", "Жезлов", "Мечей", "Пентаклей"]);

function resolveSuitGenitive(token: string): string | undefined {
  const mapped = lookupPhotoCardAlias(token);
  if (mapped && SUIT_GENITIVES.has(mapped)) return mapped;
  const t = foldAliasKey(token);
  for (const gen of SUIT_GENITIVES) {
    if (foldAliasKey(gen) === t) return gen;
  }
  for (const gen of Object.values(SUIT_EN)) {
    if (foldAliasKey(gen) === t) return gen;
  }
  for (const [key, gen] of Object.entries(SUIT_RU)) {
    if (key === t || foldAliasKey(gen) === t) return gen;
  }
  return undefined;
}

function minorFromRankAndSuitTokens(rankToken: string, suitToken: string): string | undefined {
  const rankLabel = resolveRankLabel(rankToken);
  const suitGen = resolveSuitGenitive(suitToken);
  if (!rankLabel || !suitGen) return undefined;
  const name = rankLabel === "Туз" ? `Туз ${suitGen}` : `${rankLabel} ${suitGen}`;
  return findTarotCardByName(name) ? name : undefined;
}

function matchMinorArcanaFromLabel(folded: string): string | undefined {
  const cleaned = folded.replace(/\s*\(перев\.?\)\s*$/i, "").trim();
  const fold = foldAliasKey(cleaned);

  const direct = lookupPhotoCardAlias(cleaned);
  if (direct && findTarotCardByName(direct)) return direct;

  const ofMatch = fold.match(/^(.+?)\s+(?:of|из)\s+(.+)$/);
  if (ofMatch) {
    const fromOf = minorFromRankAndSuitTokens(ofMatch[1], ofMatch[2]);
    if (fromOf) return fromOf;
  }

  const words = fold.split(/\s+/).filter(Boolean);
  for (let suitLen = 1; suitLen <= 2 && suitLen < words.length; suitLen++) {
    const rankPart = words.slice(0, words.length - suitLen).join(" ");
    const suitPart = words.slice(-suitLen).join(" ");
    const name = minorFromRankAndSuitTokens(rankPart, suitPart);
    if (name) return name;
  }

  return undefined;
}

function registerAstrologyAliases(map: Map<string, string>) {
  registerSymbolDeck(map, ASTROLOGY_SYMBOLS);
  for (const [en, ru] of Object.entries(PLANET_EN)) add(map, en, ru);
  for (const [en, ru] of Object.entries(ZODIAC_EN)) add(map, en, ru);
  add(map, "марс", "Мангала");
  add(map, "mars", "Мангала");
  add(map, "mars planet", "Мангала");
  add(map, "меркурий", "Будха");
  add(map, "mercury", "Будха");
  add(map, "mercury planet", "Будха");
  add(map, "юпiter", "Гуру");
  add(map, "юпитер", "Гуру");
  add(map, "jupiter", "Гуру");
  add(map, "jupiter planet", "Гуру");
  add(map, "венера", "Шукра");
  add(map, "venus", "Шукра");
  add(map, "venus planet", "Шукра");
  add(map, "сатурн", "Шани");
  add(map, "saturn", "Шани");
  add(map, "saturn planet", "Шани");
  add(map, "sun planet", "Сурья");
  add(map, "moon planet", "Чандра");
  add(map, "north node", "Раху");
  add(map, "south node", "Кету");
}

function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  registerMajorAliases(map);
  registerMinorAliases(map);
  registerSymbolDeck(map, RUNE_SYMBOLS);
  registerSymbolDeck(map, SLAVIC_SYMBOLS);
  registerAstrologyAliases(map);
  registerCuratedPairs(map, MAJOR_VISION_ALIASES);
  registerCuratedPairs(map, MAJOR_RU_VISION_ALIASES);
  registerCuratedPairs(map, MINOR_VISION_ALIASES);
  registerCuratedPairs(map, RUNE_VISION_ALIASES);
  registerCuratedPairs(map, SLAVIC_VISION_ALIASES);
  registerCuratedPairs(map, ASTROLOGY_VISION_ALIASES);
  registerFullDeckSymbolVariants(map);
  return map;
}

const ALIAS_MAP = buildAliasMap();

function matchMajorArcanaWord(folded: string): string | undefined {
  const words = folded.split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  const sorted = [...MAJOR_ARCANA].sort(
    (a, b) => foldAliasKey(b.name).length - foldAliasKey(a.name).length
  );
  for (const card of sorted) {
    const nameFolded = foldAliasKey(card.name);
    const nameWords = nameFolded.split(/\s+/).filter(Boolean);

    if (nameWords.length === 1 && nameFolded.length >= 3 && words.includes(nameFolded)) {
      return card.name;
    }
    if (nameWords.length > 1 && nameWords.every((w) => words.includes(w))) {
      return card.name;
    }
    if (nameFolded.length >= 4 && folded.includes(nameFolded)) {
      return card.name;
    }
  }
  return undefined;
}

function resolveAliasToSymbolName(alias: string): string | undefined {
  if (findTarotCardByName(alias)) return alias;
  const allSymbols = [...RUNE_SYMBOLS, ...SLAVIC_SYMBOLS, ...ASTROLOGY_SYMBOLS];
  if (allSymbols.some((s) => s.name === alias)) return alias;
  return matchMinorArcanaFromLabel(foldAliasKey(alias));
}

export function lookupPhotoCardAlias(raw: string): string | undefined {
  return ALIAS_MAP.get(foldAliasKey(raw));
}

export function stripPhotoLabelDecorations(raw: string): string[] {
  const cleaned = raw.replace(/[«»"'`]/g, "").trim();
  const out = new Set<string>([cleaned]);

  const numeral = cleaned.match(MAJOR_NUMERAL_PREFIX);
  if (numeral?.[2]) out.add(numeral[2].trim());

  let text = cleaned;
  for (let i = 0; i < 3; i++) {
    const next = text.replace(TITLE_PREFIX, "").trim();
    if (next === text) break;
    text = next;
    out.add(text);
  }

  if (numeral?.[2]) {
    let t = numeral[2].trim();
    for (let i = 0; i < 3; i++) {
      const next = t.replace(TITLE_PREFIX, "").trim();
      if (next === t) break;
      t = next;
      out.add(t);
    }
  }

  return [...out].filter(Boolean);
}

export function expandPhotoCardCandidates(raw: string): string[] {
  const out = new Set<string>();

  for (const variant of stripPhotoLabelDecorations(raw)) {
    out.add(variant);
    const alias = lookupPhotoCardAlias(variant);
    if (alias) out.add(alias);

    const tarot = findTarotCardByName(variant);
    if (tarot) out.add(tarot.name);

    const wordMajor = matchMajorArcanaWord(foldAliasKey(variant));
    if (wordMajor) out.add(wordMajor);

    const wordMinor = matchMinorArcanaFromLabel(foldAliasKey(variant));
    if (wordMinor) out.add(wordMinor);

    const folded = foldAliasKey(variant);
    const sorted = [...MAJOR_ARCANA].sort((a, b) => b.name.length - a.name.length);
    for (const card of sorted) {
      const n = foldAliasKey(card.name);
      if (n.length >= 4 && folded.includes(n)) out.add(card.name);
    }
  }

  return [...out];
}

export function normalizePhotoCardName(raw: string): string | undefined {
  for (const variant of stripPhotoLabelDecorations(raw)) {
    const alias = lookupPhotoCardAlias(variant);
    if (alias) {
      const resolved = resolveAliasToSymbolName(alias);
      if (resolved) return resolved;
    }
    const tarot = findTarotCardByName(variant);
    if (tarot) return tarot.name;
    const wordMajor = matchMajorArcanaWord(foldAliasKey(variant));
    if (wordMajor) return wordMajor;
    const wordMinor = matchMinorArcanaFromLabel(foldAliasKey(variant));
    if (wordMinor) return wordMinor;
  }
  return matchMinorArcanaFromLabel(foldAliasKey(raw)) ?? matchMajorArcanaWord(foldAliasKey(raw));
}

export function getAliasMapSize(): number {
  return ALIAS_MAP.size;
}
