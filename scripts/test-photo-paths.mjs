import {
  mapDetectedToRedrawSpread,
  normalizeRedrawSpreadForMaster,
} from "../src/lib/photo-spread-redraw.ts";
import { getDeckImagePath } from "../src/data/decks.ts";
import { findSymbolByName } from "../src/lib/decks/index.ts";

const cards = ["2 Пентаклей", "4 Мечей", "10 Пентаклей", "Сила"];
const spread = normalizeRedrawSpreadForMaster(
  mapDetectedToRedrawSpread({
    detectedCards: cards,
    system: "tarot-veronika",
    deckType: "Rider-Waite",
  }),
  "veronika"
);

console.log("--- redraw spread ---");
for (const c of spread.cards) {
  console.log(JSON.stringify({ name: c.name, imagePath: c.imagePath, placeholder: c.placeholder }));
}

console.log("\n--- direct lookup ---");
for (const name of cards) {
  const sym = findSymbolByName("tarot-veronika", name);
  const path = getDeckImagePath("tarot-veronika", name);
  console.log(name, "sym:", Boolean(sym), "path:", path);
}
