/**
 * Unit checks for spread registry — run: npx tsx scripts/verify-spread-registry.ts
 */
import { DEFAULT_RUNE_COSTS } from "../src/lib/rune-costs";
import {
  SPREAD_REGISTRY,
  getSpread,
  listSpreads,
  normalizeSpreadId,
  resolveSpreadPositions,
  MAX_SPREAD_CARD_COUNT,
  limitSpreadKeyCards,
} from "../src/lib/spreads/registry";
import { resolveSpreadCost } from "../src/lib/spreads/spread-pricing";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

for (const spread of Object.values(SPREAD_REGISTRY)) {
  assert(spread.positions.length === spread.cardCount, `${spread.id}: positions match cardCount`);
  assert(
    typeof spread.seoSlug === "string" && spread.seoSlug.trim().length > 0,
    `${spread.id}: has seoSlug`
  );
  const keys = new Set(spread.positions.map((p) => p.key));
  assert(keys.size === spread.positions.length, `${spread.id}: unique position keys`);
}

assert(normalizeSpreadId(null) === "triplet", "null → triplet");
assert(normalizeSpreadId("unknown") === "triplet", "unknown → triplet");

const lovePositions = resolveSpreadPositions("triplet", "love");
assert(lovePositions[0]?.label === "Вы", "triplet+love → Вы");

const testRuneSettings = {
  enabled: true,
  costs: DEFAULT_RUNE_COSTS,
  freeQuestions: 2,
  rubPerRune: 2,
  starterRunes: 0,
};

const cost5 = resolveSpreadCost("situation-5", testRuneSettings);
assert(cost5 === 30, `situation-5 cost = 30 (got ${cost5})`);

const costSingle = resolveSpreadCost("single", testRuneSettings);
assert(costSingle === 10, `single cost = 10 (got ${costSingle})`);

const all = listSpreads({ system: "tarot-veronika" });
assert(all.some((s) => s.id === "yes-no"), "yes-no available for tarot");
assert(all.some((s) => s.id === "triplet"), "triplet always listed");

const runesOnly = listSpreads({ system: "runes" });
assert(!runesOnly.some((s) => s.id === "yes-no"), "yes-no hidden for runes");

assert(getSpread("celtic-cross").cardCount === 10, "celtic-cross has 10 cards");
assert(MAX_SPREAD_CARD_COUNT === 10, `MAX_SPREAD_CARD_COUNT = 10 (got ${MAX_SPREAD_CARD_COUNT})`);
assert(
  limitSpreadKeyCards(Array.from({ length: 12 }, (_, i) => `C${i}`)).length === 10,
  "limitSpreadKeyCards caps at 10"
);
assert(
  limitSpreadKeyCards(["A"]).length === 1,
  "limitSpreadKeyCards keeps short spreads"
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll spread registry checks passed.");
