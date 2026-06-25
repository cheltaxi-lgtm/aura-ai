import { mapDetectedToRedrawSpread, normalizeRedrawSpreadForMaster } from "../src/lib/photo-spread-redraw.ts";

const serverSpread = normalizeRedrawSpreadForMaster(
  mapDetectedToRedrawSpread({
    detectedCards: ["10 Кубков", "Королева Мечей", "Маг", "2 Жезлов", "Жрица", "Колесо Фортуны"],
    system: "tarot-veronika",
    deckType: "Rider-Waite",
  }),
  "veronika"
);

console.log("--- server spread ---");
for (const c of serverSpread.cards) {
  console.log(c.name, c.imagePath, c.placeholder);
}

const remapped = normalizeRedrawSpreadForMaster(serverSpread, "veronika");
console.log("--- after client normalize (simulated useEffect) ---");
for (const c of remapped.cards) {
  console.log(c.name, c.imagePath, c.placeholder);
}
