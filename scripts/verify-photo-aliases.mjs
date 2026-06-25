/**
 * Verify photo card alias coverage — run: node scripts/verify-photo-aliases.mjs
 */
import { FULL_DECK, MAJOR_ARCANA } from "../src/lib/tarot.ts";
import { RUNE_SYMBOLS } from "../src/lib/decks/runes.ts";
import { SLAVIC_SYMBOLS } from "../src/lib/decks/slavic.ts";
import { ASTROLOGY_SYMBOLS } from "../src/lib/decks/astrology.ts";
import {
  expandPhotoCardCandidates,
  getAliasMapSize,
  lookupPhotoCardAlias,
  normalizePhotoCardName,
} from "../src/lib/photo-card-aliases.ts";

const VISION_SAMPLES = [
  ["XX Суд", "Суд"],
  ["0 Шут", "Шут"],
  ["XIV Умеренность", "Умеренность"],
  ["II Жрица", "Жрица"],
  ["Верховная Жрица", "Жрица"],
  ["High Priestess", "Жрица"],
  ["The Magician", "Маг"],
  ["Queen of Swords", "Королева Мечей"],
  ["10 of Cups", "10 Кубков"],
  ["6 Жезлов", "6 Жезлов"],
  ["Two of Pentacles", "2 Пентаклей"],
  ["Двойка Мечей", "2 Мечей"],
  ["Королева Мечей", "Королева Мечей"],
  ["Колесо Фортуны", "Колесо Фортуны"],
  ["Wheel of Fortune", "Колесо Фортуны"],
  ["Влюблённые", "Влюблённые"],
  ["The Lovers", "Влюблённые"],
  ["Повешенный", "Повешенный"],
  ["The Hanged Man", "Повешенный"],
  ["fehu", "Феху"],
  ["Райдо", "Райдо"],
  ["rahu", "Раху"],
  ["Сурья", "Сурья"],
  ["Jupiter", "Гуру"],
  ["Aries", "Овен"],
  ["Берегиня", "Берегиня"],
  ["Перун", "Перун"],
];

let failed = 0;

console.log(`Alias map entries: ${getAliasMapSize()}`);

for (const card of MAJOR_ARCANA) {
  const n = normalizePhotoCardName(card.name);
  if (n !== card.name) {
    console.error(`FAIL major self: ${card.name} -> ${n}`);
    failed++;
  }
}

for (const card of FULL_DECK.filter((c) => c.arcana === "minor")) {
  const n = normalizePhotoCardName(card.name);
  if (n !== card.name) {
    console.error(`FAIL minor self: ${card.name} -> ${n}`);
    failed++;
  }
}

for (const [input, expected] of VISION_SAMPLES) {
  const got = normalizePhotoCardName(input);
  if (got !== expected) {
    console.error(`FAIL sample: "${input}" -> "${got}" (expected "${expected}")`);
    failed++;
  } else {
    console.log(`OK: "${input}" -> "${got}"`);
  }
}

for (const sym of [...RUNE_SYMBOLS, ...SLAVIC_SYMBOLS, ...ASTROLOGY_SYMBOLS]) {
  if (lookupPhotoCardAlias(sym.name) !== sym.name) {
    console.error(`FAIL symbol self: ${sym.name}`);
    failed++;
  }
  if (sym.slug && lookupPhotoCardAlias(sym.slug) !== sym.name) {
    console.error(`FAIL slug: ${sym.slug} -> ${lookupPhotoCardAlias(sym.slug)} (expected ${sym.name})`);
    failed++;
  }
}

const expanded = expandPhotoCardCandidates("Верховная Жрица");
if (!expanded.includes("Жрица")) {
  console.error(`FAIL expand: Верховная Жрица -> ${expanded.join(", ")}`);
  failed++;
}

console.log(failed ? `\n${failed} failure(s)` : "\nAll alias checks passed");
process.exit(failed ? 1 : 0);
