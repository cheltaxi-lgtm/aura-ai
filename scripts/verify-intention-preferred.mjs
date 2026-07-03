/** Validate INTENTION_PREFERRED names exist in deck registry. */
import { readFileSync } from "node:fs";
import { DECK_REGISTRY } from "../src/lib/decks/index.ts";

const src = readFileSync("src/lib/intention-draw.ts", "utf8");
const block = src.match(/const INTENTION_PREFERRED[\s\S]*?= (\{[\s\S]*?\n\});/);
if (!block) throw new Error("INTENTION_PREFERRED not found");

const INTENTION_PREFERRED = eval(`(${block[1]})`);

function norm(n) {
  return n.trim().replace(/ё/g, "е").toLowerCase();
}

function findInDeck(system, name) {
  const n = norm(name);
  return DECK_REGISTRY[system].symbols.find(
    (s) => norm(s.name) === n || norm(s.name).includes(n) || n.includes(norm(s.name))
  );
}

let invalid = 0;
for (const [intention, bySystem] of Object.entries(INTENTION_PREFERRED)) {
  for (const [system, names] of Object.entries(bySystem)) {
    if (!DECK_REGISTRY[system]) continue;
    for (const name of names) {
      if (!findInDeck(system, name)) {
        console.error(`INVALID [${intention}] ${system}: «${name}»`);
        invalid++;
      }
    }
  }
}

if (invalid > 0) {
  throw new Error(`${invalid} invalid preferred names`);
}

if (!src.includes("  Любовь: {")) {
  throw new Error("Любовь key still broken");
}

console.log("OK: all INTENTION_PREFERRED names resolve in deck");
