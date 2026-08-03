/**
 * Unit-style smoke tests for photo reading parsing and spread limits.
 * Run: npx tsx scripts/test-photo-reading.mjs
 */
import assert from "node:assert/strict";
import {
  parseDetectedCards,
  parsePhotoReadingResponse,
  sanitizeLandscapeReversedGuesses,
} from "../src/lib/photo-reading-prompts.ts";
import {
  parseRecognitionConfidence,
  confidenceLabel,
  MAX_PHOTO_CARDS,
} from "../src/lib/photo-reading-constants.ts";
import {
  buildPartialRedrawSpread,
  createEmptyManualRedrawSpread,
  isPhotoSpreadComplete,
  isRecognizedSpread,
  normalizeRedrawSpreadInput,
} from "../src/lib/photo-spread-redraw.ts";
import { buildPhotoSpreadKey } from "../src/lib/photo-reading-idempotency.ts";
import { buildPhotoFollowUpChips, recommendRitualForPhotoQuestion } from "../src/lib/photo-followups.ts";
import { getAllSpreadIntents } from "../src/lib/spread-intents/registry.ts";
import { photoReadingPricingFromSettings } from "../src/lib/photo-reading-billing.ts";

const jsonSample = `
КОЛОДА: Rider-Waite · уверенность: высокая
РАСКЛАД: три карты · 3 карты · прошлое-настоящее-будущее
КАРТЫ_JSON: [{"name":"Two of Swords","reversed":false},{"name":"The Sun","reversed":true}]
КАРТЫ: «Two of Swords» · «The Sun (перев.)»
`;

const cards = parseDetectedCards(jsonSample);
assert.equal(cards.length, 2, "parse JSON cards");
assert.ok(cards[1].includes("перев"), "reversed marker");

const listSample = `
КОЛОДА: Ленорман · уверенность: средняя
РАСКЛАД: 3 символа
- Всадник
- Клевер
- Корабль
`;
const listCards = parseDetectedCards(listSample);
assert.equal(listCards.length, 3, "parse markdown list cards");

const meta = parsePhotoReadingResponse(jsonSample);
assert.ok(meta.deckType?.includes("Rider-Waite"), "deck type parsed");
assert.equal(parseRecognitionConfidence(meta.deckType), "high");
assert.match(confidenceLabel("low"), /Низкая/u);

const landscapeSanitized = sanitizeLandscapeReversedGuesses(
  [
    { name: "Сила", reversed: false, confidence: "high" },
    { name: "Солнце", reversed: true, confidence: "high" },
    { name: "Луна", reversed: false, confidence: "high" },
    { name: "Башня", reversed: true, confidence: "medium" },
    { name: "Звезда", reversed: false, confidence: "high" },
  ],
  { landscapePhoto: true }
);
assert.ok(
  landscapeSanitized.every((card) => !card.reversed),
  "landscape multi-card clears false reversed flags"
);

const landscapeTriplet = sanitizeLandscapeReversedGuesses(
  [
    { name: "Сила", reversed: false, confidence: "high" },
    { name: "Солнце", reversed: true, confidence: "high" },
    { name: "Луна", reversed: false, confidence: "high" },
  ],
  { landscapePhoto: true }
);
assert.ok(
  landscapeTriplet.every((card) => !card.reversed),
  "landscape 3-card also clears false reversed"
);

const portraitPartialClears = sanitizeLandscapeReversedGuesses(
  [
    { name: "Сила", reversed: false, confidence: "high" },
    { name: "Солнце", reversed: true, confidence: "high" },
    { name: "Луна", reversed: false, confidence: "high" },
  ],
  { landscapePhoto: false }
);
assert.ok(
  portraitPartialClears.every((card) => !card.reversed),
  "portrait multi-card with partial reverses clears (row artifact)"
);

const portraitPairKeepsOne = sanitizeLandscapeReversedGuesses(
  [
    { name: "Сила", reversed: false, confidence: "high" },
    { name: "Солнце", reversed: true, confidence: "high" },
  ],
  { landscapePhoto: false }
);
assert.equal(
  portraitPairKeepsOne[1].reversed,
  true,
  "portrait 2-card keeps a single real reversed card"
);

const portraitSingleKeeps = sanitizeLandscapeReversedGuesses(
  [{ name: "Солнце", reversed: true, confidence: "high" }],
  { landscapePhoto: false }
);
assert.equal(portraitSingleKeeps[0].reversed, true, "single portrait card keeps reversed");

const portraitAllReversedKeeps = sanitizeLandscapeReversedGuesses(
  [
    { name: "Сила", reversed: true, confidence: "high" },
    { name: "Солнце", reversed: true, confidence: "high" },
  ],
  { landscapePhoto: false, horizontalRowSuspect: false }
);
assert.ok(
  portraitAllReversedKeeps.every((card) => card.reversed),
  "portrait all-reversed 2-card keeps when not row-suspect"
);

const landscapeParsed = parsePhotoReadingResponse(
  `КОЛОДА: Rider-Waite · уверенность: высокая
РАСКЛАД: пять карт · 5 символов
КАРТЫ_JSON: [
  {"name":"Сила","reversed":false,"confidence":"высокая"},
  {"name":"Солнце","reversed":true,"confidence":"высокая"},
  {"name":"Луна","reversed":false,"confidence":"высокая"},
  {"name":"Башня","reversed":true,"confidence":"средняя"},
  {"name":"Звезда","reversed":false,"confidence":"высокая"}
]`,
  { landscapePhoto: true }
);
assert.ok(
  landscapeParsed.detectedCards.every((card) => !/\(перев/i.test(card)),
  "landscape parse clears reversed markers"
);

const partial = buildPartialRedrawSpread("veronika", ["Сила", "Императрица"], "RWS");
assert.equal(partial.cards.length, 2, "partial redraw");
assert.ok(partial.cards.every((c) => c.name), "partial cards named");

const manual = createEmptyManualRedrawSpread("veronika");
assert.equal(manual.cards.length, 0, "manual spread empty");

const normalized = normalizeRedrawSpreadInput(
  {
    system: "tarot-veronika",
    cards: Array.from({ length: MAX_PHOTO_CARDS + 3 }, (_, i) => ({
      name: `Card ${i + 1}`,
    })),
  },
  "veronika"
);
assert.equal(normalized.cards.length, MAX_PHOTO_CARDS, "server-side card cap");

assert.equal(
  isRecognizedSpread({ detectedCards: ["Сила"], deckType: "tarot" }).ok,
  true,
  "single card recognized"
);
assert.equal(
  isRecognizedSpread({ detectedCards: [], deckType: "tarot" }).ok,
  false,
  "empty spread rejected"
);
assert.equal(
  isRecognizedSpread({ detectedCards: ["не удалось распознать"], deckType: "tarot" }).ok,
  false,
  "failure label rejected"
);

const failedRedraw = buildPartialRedrawSpread("veronika", ["не удалось распознать"], "RWS");
assert.equal(failedRedraw.cards.length, 1, "legacy partial still maps label");
assert.equal(
  isPhotoSpreadComplete(failedRedraw),
  false,
  "unrecognized placeholder is not a complete spread"
);
assert.equal(
  isRecognizedSpread({ detectedCards: ["Сила", "не удалось распознать"], deckType: "tarot" }).ok,
  true,
  "mixed spread keeps valid cards"
);

const spreadKeyA = buildPhotoSpreadKey("veronika", normalized, "test");
const spreadKeyB = buildPhotoSpreadKey("veronika", normalized, "other");
assert.notEqual(spreadKeyA, spreadKeyB, "spread key differs by question");

const pricing = photoReadingPricingFromSettings(0);
assert.ok(pricing.firstPhotoDiscount, "first photo discount for new user");
assert.ok(pricing.effectiveCost < pricing.baseCost, "discounted cost lower");

const chips = buildPhotoFollowUpChips("любовь и отношения");
assert.ok(chips.length >= 3, "follow-up chips generated");
assert.equal(recommendRitualForPhotoQuestion("как вернуть любовь"), "love");

const intentCount = getAllSpreadIntents().length;
assert.ok(intentCount >= 40, `intent catalog >= 40 (got ${intentCount})`);

console.log("All photo-reading tests passed.");
