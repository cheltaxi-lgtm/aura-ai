/**
 * Regression: dictionary-style / card-ungrounded teaser must fail quality gate.
 */
import assert from "node:assert/strict";
import { validateGuestTeaserQuality } from "@/lib/guest-triplet-teaser-service";

const cardNames = ["6 Мечей", "Император", "10 Кубков"];
const meaningHints = [
  "Переход к спокойствию, движение прочь от трудностей",
  "Структура, власть, опора",
  "Семейное счастье, гармония в доме, эмоциональная полнота",
];

const OLD_PROD_TEXT =
  "В вашем прошлом, символизируемом шестёркой Мечей, вы преодолевали трудности и искали новые горизонты, что дало вам опыт и понимание того, что перемены могут быть необходимы. В настоящем Император указывает на необходимость стабильности и контроля в вашей жизни, однако это может означать и жесткие рамки, которые сдерживают вас. В будущем десять Кубков обещают эмоциональное удовлетворение и гармонию, но для этого требуется сделать важный выбор сейчас. Напряжение выбора заключается в том, что вам предстоит сбалансировать стремление к стабильности с желанием полного удовлетворения — это может быть не очевидным, но именно здесь скрыта ваша истинная дорога.";

const rejected = validateGuestTeaserQuality(OLD_PROD_TEXT, cardNames, meaningHints);
assert.equal(rejected.ok, false, "old prod dictionary teaser must be rejected");
console.log("old_prod_rejected_reason:", rejected.ok ? "none" : rejected.reason);

const ungrounded =
  "Вы находитесь в ситуации, когда мысли о смене работы уже не просто идеи, а желание перейти к действиям. Внутренние силы подсказывают, что вы способны справиться с вызовами нового этапа, но в то же время возникает неопределенность относительно того, что именно вам нужно — оставить привычное или рискнуть ради чего-то нового. Неясным остаётся, действительно ли новое место работы станет тем, что вы ищете, или это просто способ избежать текущих трудностей.";
const ungroundedRejected = validateGuestTeaserQuality(ungrounded, cardNames, meaningHints);
assert.equal(ungroundedRejected.ok, false, "card-ungrounded coaching must be rejected");
console.log(
  "ungrounded_rejected_reason:",
  ungroundedRejected.ok ? "none" : ungroundedRejected.reason
);

const oneCardOnly =
  "Смена работы у вас уже назрела как уход от того, что больше не кормит. Император держит вас статусом и рамками, хотя внутри вы уже в переходе прочь от трудностей. Неясно, уходите ли вы к своей опоре — или просто прочь от давления.";
const oneCardRejected = validateGuestTeaserQuality(oneCardOnly, cardNames, meaningHints);
assert.equal(oneCardRejected.ok, false, "single-card teaser must be rejected");
console.log(
  "one_card_rejected_reason:",
  oneCardRejected.ok ? "none" : oneCardRejected.reason
);

const good = validateGuestTeaserQuality(
  "Смена работы у вас уже не про деньги, а про то, что привычная роль перестала совпадать с тем, кем вы хотите быть. 6 Мечей тянет к переходу прочь от трудностей, Император держит опорой статуса и власти, а 10 Кубков манит гармонией, где наконец тепло. Неясным остаётся, готовы ли вы потерять эту опору ради движения — или снова убедите себя подождать.",
  cardNames,
  meaningHints
);
assert.equal(good.ok, true, "all-three-cards grounded teaser must pass");

console.log("verify-guest-teaser-quality: OK");
