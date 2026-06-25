import { FULL_DECK } from "../src/lib/tarot.ts";
import { RUNE_SYMBOLS } from "../src/lib/decks/runes.ts";
import { SLAVIC_SYMBOLS } from "../src/lib/decks/slavic.ts";
import { ASTROLOGY_SYMBOLS } from "../src/lib/decks/astrology.ts";
import {
  getAliasMapSize,
  normalizePhotoCardName,
  lookupPhotoCardAlias,
} from "../src/lib/photo-card-aliases.ts";

const samples = [
  "Страшный Суд",
  "le jugement",
  "2 cups",
  "2 кубков",
  "Королева Мечей",
  "queen of swords",
  "fehu",
  "Феху",
  "Перун",
  "chernobog",
  "Сурья",
  "mars planet",
];

console.log("alias map size:", getAliasMapSize());
console.log("\n--- samples ---");
for (const s of samples) {
  console.log(s, "->", normalizePhotoCardName(s) ?? lookupPhotoCardAlias(s) ?? "?");
}

const allSymbols = [
  ...FULL_DECK.map((c) => c.name),
  ...RUNE_SYMBOLS.map((s) => s.name),
  ...SLAVIC_SYMBOLS.map((s) => s.name),
  ...ASTROLOGY_SYMBOLS.map((s) => s.name),
];

const missing = allSymbols.filter((name) => !lookupPhotoCardAlias(name));
console.log("\n--- coverage ---");
console.log("symbols:", allSymbols.length);
console.log("missing direct alias:", missing.length);
if (missing.length) console.log(missing.slice(0, 10));
