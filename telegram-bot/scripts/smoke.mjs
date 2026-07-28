import { migrate } from "../src/db/client.ts";
import { deckProvider } from "../src/domain/deck/local-provider.ts";
import { createSessionToken, hashSessionToken } from "../src/domain/session/token.ts";
import { renderTripletCollage } from "../src/render/card-collage.ts";

migrate();
const cards = deckProvider.drawTriplet();
const buf = await renderTripletCollage(cards);
const t = createSessionToken();
console.log(
  JSON.stringify({
    cards: cards.map((c) => ({
      id: c.id,
      name: c.name,
      pos: c.positionLabel,
      rev: c.reversed,
    })),
    collageBytes: buf.length,
    tokenHashLen: hashSessionToken(t).length,
  })
);
