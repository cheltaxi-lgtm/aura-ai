/**
 * Regression: dictionary-style / card-ungrounded teaser must fail quality gate.
 */
import assert from "node:assert/strict";
import {
  matchesBannedPhrase,
  validateGuestTeaserQuality,
} from "@/lib/guest-triplet-teaser-service";
import { buildGuestNarrativeFallback } from "@/lib/guest-triplet-teaser";

const cardNames = ["Туз Кубков", "Императрица", "9 Мечей"];
const meaningHints = [
  "Начало новых чувств, любовь, эмоциональный поток",
  "Изобилие, забота, творчество",
  "Тревога, бессонница, тяжёлые мысли",
];

assert.equal(
  matchesBannedPhrase("у вас сильный внутренний конфликт сейчас", "зона комфорта"),
  false,
  "unrelated text must not match a multi-word ban"
);
assert.equal(
  matchesBannedPhrase("он ушёл в зону комфорта снова", "зона комфорта"),
  true,
  "inflected multi-word ban must still hit"
);

const OLD_PROD_TEXT =
  "В вашем прошлом, символизируемом шестёркой Мечей, вы преодолевали трудности и искали новые горизонты, что дало вам опыт и понимание того, что перемены могут быть необходимы. В настоящем Император указывает на необходимость стабильности и контроля в вашей жизни, однако это может означать и жесткие рамки, которые сдерживают вас. В будущем десять Кубков обещают эмоциональное удовлетворение и гармонию, но для этого требуется сделать важный выбор сейчас. Напряжение выбора заключается в том, что вам предстоит сбалансировать стремление к стабильности с желанием полного удовлетворения — это может быть не очевидным, но именно здесь скрыта ваша истинная дорога.";

const rejected = validateGuestTeaserQuality(OLD_PROD_TEXT, ["6 Мечей", "Император", "10 Кубков"], [
  "Переход",
  "Структура, власть, опора",
  "Семейное счастье",
]);
assert.equal(rejected.ok, false, "old prod dictionary teaser must be rejected");
console.log("old_prod_rejected_reason:", rejected.ok ? "none" : rejected.reason);

const ungrounded =
  "Вы думаете о чувствах и о том, что будет дальше. Пока всё зыбко и тревожно, и непонятно, куда это ведёт. Неясным остаётся, готовы ли вы смотреть правде в глаза.";
const ungroundedRejected = validateGuestTeaserQuality(ungrounded, cardNames, meaningHints);
assert.equal(ungroundedRejected.ok, false, "card-ungrounded coaching must be rejected");
console.log(
  "ungrounded_rejected_reason:",
  ungroundedRejected.ok ? "none" : ungroundedRejected.reason
);

const good = validateGuestTeaserQuality(
  "Вопрос про чувства у вас уже не про надежду, а про то, хватит ли сил выдержать тревогу рядом с новым теплом. Туз Кубков открывает поток чувств, Императрица держит изобилием и заботой, а 9 Мечей давит бессонницей и тяжёлыми мыслями. Неясным остаётся, это страх перед близостью — или предупреждение, что поток уже отравляет сон.",
  cardNames,
  meaningHints
);
assert.equal(good.ok, true, "all-three-cards grounded teaser must pass");

const narrative = buildGuestNarrativeFallback("Что между нами?", [
  { name: "Туз Кубков", meaning: "Начало новых чувств, любовь" },
  { name: "Императрица", meaning: "Изобилие, забота, творчество" },
  { name: "9 Мечей", meaning: "Тревога, бессонница, тяжёлые мысли" },
]);
assert.equal(narrative.includes("Прошлое:"), false);
assert.equal(narrative.includes("Что между нами?"), true);
assert.equal(narrative.includes("Туз Кубков"), true);
console.log("narrative_fallback_ok");

console.log("verify-guest-teaser-quality: OK");
