/**
 * Regression: dictionary-style teaser must fail quality gate.
 */
import assert from "node:assert/strict";
import { validateGuestTeaserQuality } from "@/lib/guest-triplet-teaser-service";

const OLD_PROD_TEXT =
  "В вашем прошлом, символизируемом шестёркой Мечей, вы преодолевали трудности и искали новые горизонты, что дало вам опыт и понимание того, что перемены могут быть необходимы. В настоящем Император указывает на необходимость стабильности и контроля в вашей жизни, однако это может означать и жесткие рамки, которые сдерживают вас. В будущем десять Кубков обещают эмоциональное удовлетворение и гармонию, но для этого требуется сделать важный выбор сейчас. Напряжение выбора заключается в том, что вам предстоит сбалансировать стремление к стабильности с желанием полного удовлетворения — это может быть не очевидным, но именно здесь скрыта ваша истинная дорога.";

const cardNames = ["6 Мечей", "Император", "10 Кубков"];

const rejected = validateGuestTeaserQuality(OLD_PROD_TEXT, cardNames);
assert.equal(rejected.ok, false, "old prod dictionary teaser must be rejected");
console.log("old_prod_rejected_reason:", rejected.ok ? "none" : rejected.reason);

const good = validateGuestTeaserQuality(
  "Смена работы у вас уже не про деньги, а про то, что привычная роль перестала совпадать с тем, кем вы хотите быть. Сейчас вы держитесь за опору статуса, хотя внутри уже ушли дальше текущего места. Неясным остаётся, готовы ли вы потерять эту опору ради движения — или снова убедите себя подождать.",
  cardNames
);
assert.equal(good.ok, true, "topic-first conflict teaser must pass");

console.log("verify-guest-teaser-quality: OK");
