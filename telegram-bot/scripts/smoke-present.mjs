import { writeFileSync, mkdirSync } from "node:fs";
import { FULL_DECK, TRIPLET_POSITIONS } from "../src/domain/deck/cards.ts";
import { renderTripletCollage } from "../src/render/card-collage.ts";
import { buildTelegramReadingMessages } from "../src/domain/reading/present.ts";

const cards = [0, 22, 13].map((id, i) => {
  const d = FULL_DECK.find((c) => c.id === id) || FULL_DECK[id];
  return {
    id: d.id,
    name: d.name,
    meaning: d.meaning,
    slug: d.slug,
    position: i,
    reversed: false,
    positionLabel: TRIPLET_POSITIONS[i],
    deck_id: "tarot-veronika",
    spread_id: "triplet",
  };
});

const buf = await renderTripletCollage(cards, { revealedCount: 3 });
mkdirSync("data", { recursive: true });
writeFileSync("data/collage-smoke.jpg", buf);

const msgs = buildTelegramReadingMessages(
  [
    "Геннадий, расклад о работе.",
    "",
    `${cards[0].name} говорит о начале и смелости шага.`,
    "",
    `${cards[1].name} — про чувство и открытый канал.`,
    "",
    `${cards[2].name} — обновление формы, не конец пути.`,
    "",
    "Простыми словами: двигайся дальше без старых якорей.",
    "",
    "Шаги на 7 дней: 1) ясный план 2) разговор с партнёром.",
  ].join("\n"),
  cards
);

console.log(
  JSON.stringify(
    { collageBytes: buf.length, messages: msgs.length, titles: msgs.map((m) => m.slice(0, 60)) },
    null,
    2
  )
);
