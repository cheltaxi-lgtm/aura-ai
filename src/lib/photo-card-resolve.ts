import type { DeckSystem } from "@/lib/decks/types";
import { findSymbolByName } from "@/lib/decks";
import { findTarotCardByName } from "@/lib/tarot";

const RANK_ALIASES: Record<string, string> = {
  ace: "Туз",
  туз: "Туз",
  "1": "Туз",
  two: "2",
  двойка: "2",
  "2": "2",
  ii: "2",
  three: "3",
  тройка: "3",
  "3": "3",
  iii: "3",
  four: "4",
  четверка: "4",
  четвёрка: "4",
  "4": "4",
  iv: "4",
  five: "5",
  пятерка: "5",
  пятёрка: "5",
  "5": "5",
  v: "5",
  six: "6",
  шестерка: "6",
  шестёрка: "6",
  "6": "6",
  vi: "6",
  seven: "7",
  семерка: "7",
  семёрка: "7",
  "7": "7",
  vii: "7",
  eight: "8",
  восьмерка: "8",
  восьмёрка: "8",
  "8": "8",
  viii: "8",
  nine: "9",
  девятка: "9",
  "9": "9",
  ix: "9",
  ten: "10",
  десятка: "10",
  "10": "10",
  x: "10",
  page: "Паж",
  паж: "Паж",
  knight: "Рыцарь",
  рыцарь: "Рыцарь",
  queen: "Королева",
  королева: "Королева",
  king: "Король",
  король: "Король",
  jack: "Паж",
  вalet: "Паж",
};

const SUIT_ALIASES: Record<string, string> = {
  cups: "Кубков",
  cup: "Кубков",
  chalice: "Кубков",
  кубков: "Кубков",
  кубки: "Кубков",
  чаш: "Кубков",
  чаши: "Кубков",
  wands: "Жезлов",
  wand: "Жезлов",
  rod: "Жезлов",
  rods: "Жезлов",
  жезлов: "Жезлов",
  жезлы: "Жезлов",
  посохов: "Жезлов",
  посохи: "Жезлов",
  swords: "Мечей",
  sword: "Мечей",
  мечей: "Мечей",
  мечи: "Мечей",
  pentacles: "Пентаклей",
  pentacle: "Пентаклей",
  coin: "Пентаклей",
  coins: "Пентаклей",
  disk: "Пентаклей",
  disks: "Пентаклей",
  пентаклей: "Пентаклей",
  пентакл: "Пентаклей",
  пентакли: "Пентаклей",
  монет: "Пентаклей",
  монеты: "Пентаклей",
};

const MAJOR_EN: Record<string, string> = {
  fool: "Шут",
  "the fool": "Шут",
  magician: "Маг",
  "the magician": "Маг",
  "high priestess": "Жрица",
  "the high priestess": "Жрица",
  priestess: "Жрица",
  empress: "Императрица",
  "the empress": "Императрица",
  emperor: "Император",
  "the emperor": "Император",
  hierophant: "Иерофант",
  "the hierophant": "Иерофант",
  lovers: "Влюблённые",
  "the lovers": "Влюблённые",
  chariot: "Колесница",
  "the chariot": "Колесница",
  strength: "Сила",
  hermit: "Отшельник",
  "the hermit": "Отшельник",
  "wheel of fortune": "Колесо Фортуны",
  justice: "Справедливость",
  "hanged man": "Повешенный",
  "the hanged man": "Повешенный",
  death: "Смерть",
  temperance: "Умеренность",
  devil: "Дьявол",
  "the devil": "Дьявол",
  tower: "Башня",
  "the tower": "Башня",
  star: "Звезда",
  "the star": "Звезда",
  moon: "Луна",
  "the moon": "Луна",
  sun: "Солнце",
  "the sun": "Солнце",
  judgement: "Суд",
  judgment: "Суд",
  world: "Мир",
  "the world": "Мир",
};

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "");
}

function buildMinorName(rankKey: string, suitKey: string): string | undefined {
  const rank = RANK_ALIASES[rankKey];
  const suit = SUIT_ALIASES[suitKey];
  if (!rank || !suit) return undefined;
  if (rank === "Туз") return `Туз ${suit}`;
  return `${rank} ${suit}`;
}

function normalizeTarotName(raw: string): string | undefined {
  const cleaned = raw.replace(/[«»"']/g, "").trim();
  const lower = normKey(cleaned);

  const major = MAJOR_EN[lower] ?? MAJOR_EN[`the ${lower}`];
  if (major) return major;

  const enMinor = lower.match(
    /^(ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king|jack)\s+of\s+(wands|cups|swords|pentacles)$/
  );
  if (enMinor) {
    return buildMinorName(enMinor[1], enMinor[2]);
  }

  const ruMinor = lower
    .replace(/ё/g, "е")
    .match(
      /^(туз|двойка|тройка|четверка|четверка|пятерка|шестерка|семерка|восьмерка|девятка|десятка|паж|рыцарь|королева|король|[2-9]|10)\s+(кубков|жезлов|мечей|пентаклей|пентакл|монет|чаш|посохов)$/
    );
  if (ruMinor) {
    return buildMinorName(ruMinor[1], ruMinor[2]);
  }

  const numSuit = lower.match(/^([2-9]|10)\s+(кубков|жезлов|мечей|пентаклей|пентакл|монет|мечи|чаш|жезлы)$/);
  if (numSuit) {
    return buildMinorName(numSuit[1], numSuit[2]);
  }

  const tarot = findTarotCardByName(cleaned);
  if (tarot) return tarot.name;

  return undefined;
}

function fuzzyFindSymbol(system: DeckSystem, raw: string) {
  const direct = findSymbolByName(system, raw);
  if (direct) return direct;

  const isTarot = system === "tarot-marina" || system === "tarot-veronika";
  if (isTarot) {
    const normalized = normalizeTarotName(raw);
    if (normalized) {
      const sym = findSymbolByName(system, normalized);
      if (sym) return sym;
      const card = findTarotCardByName(normalized);
      if (card) return findSymbolByName(system, card.name);
    }
  }

  const relaxed = raw.trim().replace(/ё/g, "е");
  const symbols = findSymbolByName(system, relaxed);
  if (symbols) return symbols;

  return undefined;
}

export function resolveDetectedSymbolName(system: DeckSystem, rawName: string): string {
  const symbol = fuzzyFindSymbol(system, rawName);
  if (symbol) return symbol.name;

  const isTarot = system === "tarot-marina" || system === "tarot-veronika";
  if (isTarot) {
    const normalized = normalizeTarotName(rawName);
    if (normalized) return normalized;
  }

  return rawName.trim();
}
