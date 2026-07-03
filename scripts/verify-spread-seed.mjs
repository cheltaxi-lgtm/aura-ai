/** Seeded spread draw — deterministic per user profile + session context. */
import assert from "node:assert/strict";
import { DECK_REGISTRY } from "../src/lib/decks/index.ts";
import { buildSpreadSeed, createSeededRng } from "../src/lib/spread-seed.ts";
import { drawSeededIntentionSpread, drawSeededUniformSpread } from "../src/lib/intention-draw.ts";
import {
  buildSeededTableDeck,
  drawSeededSessionSpread,
  resolveNumerologPickedSpread,
  resolvePickedSpread,
  resolveTableSize,
} from "../src/lib/spread-draw.ts";
import { buildNumerologPickTable } from "../src/lib/spread-table.ts";

const seedA = buildSpreadSeed({
  userId: "user-a",
  birthDate: "1990-01-15",
  masterId: "veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  spreadId: "triplet",
});

const seedB = buildSpreadSeed({
  userId: "user-b",
  birthDate: "1990-01-15",
  masterId: "veronika",
  topic: "\u0414\u0435\u043d\u044c\u0433\u0438",
  spreadId: "triplet",
});

assert.notEqual(seedA, seedB, "different users -> different seeds");

const draw1 = drawSeededSessionSpread({
  system: "tarot-veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  cardCount: 3,
  seed: seedA,
}).cards.map((c) => c.name);

const draw2 = drawSeededSessionSpread({
  system: "tarot-veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  cardCount: 3,
  seed: seedA,
}).cards.map((c) => c.name);

assert.deepEqual(draw1, draw2, "same seed -> same spread");

const single = drawSeededSessionSpread({
  system: "tarot-veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  cardCount: 3,
  seed: seedA,
  drawIndex: 1,
}).cards[0].name;

assert.equal(single, draw1[1], "drawIndex matches full spread");

const tableSize = resolveTableSize("tarot-veronika");
const table = buildSeededTableDeck({
  system: "tarot-veronika",
  seed: seedA,
});
assert.equal(table.length, tableSize);
assert.equal(table.length, 78);

const pickedDefault = drawSeededSessionSpread({
  system: "tarot-veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  cardCount: 3,
  seed: seedA,
  pickedIndices: [0, 1, 2],
  tableSize,
}).cards.map((c) => c.name);

const pickedAlt = resolvePickedSpread(table, [2, 5, 0]).map((c) => c.name);
assert.notDeepEqual(pickedDefault, pickedAlt, "different picks -> different spread");

const pickedSame = drawSeededSessionSpread({
  system: "tarot-veronika",
  topic: "\u041b\u044e\u0431\u043e\u0432\u044c",
  cardCount: 3,
  seed: seedA,
  pickedIndices: [2, 5, 0],
  tableSize,
}).cards.map((c) => c.name);
assert.deepEqual(pickedAlt, pickedSame, "pickedIndices resolve via table");

const computed = [
  { name: "7", meaning: "seven" },
  { name: "3", meaning: "three" },
  { name: "9", meaning: "nine" },
];
const numTable = buildNumerologPickTable(computed, seedA);
assert.equal(numTable.length, 3);
const numResolved = resolveNumerologPickedSpread(numTable, [2, 0, 1], computed);
assert.equal(numResolved.length, 3);
assert.deepEqual(
  numResolved.map((c) => c.name),
  [numTable[2].name, numTable[0].name, numTable[1].name]
);

const rng = createSeededRng(seedA);
const r1 = rng();
const r2 = rng();
assert.ok(r1 >= 0 && r1 < 1 && r2 >= 0 && r2 < 1);

const love = drawSeededIntentionSpread("runes", "\u041b\u044e\u0431\u043e\u0432\u044c", 3, seedA);
assert.equal(love.length, 3);
for (const sym of love) {
  assert.ok(DECK_REGISTRY.runes.symbols.some((s) => s.name === sym.name));
}

const custom = drawSeededUniformSpread("tarot-veronika", 3, seedA);
assert.equal(custom.length, 3);

console.log("OK: seeded spread draw");
