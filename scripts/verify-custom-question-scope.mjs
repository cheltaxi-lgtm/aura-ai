/** Smoke tests for custom question scope heuristics. */
import assert from "node:assert/strict";
import {
  customQuestionSpreadRules,
  isThirdPartyCustomQuestion,
} from "../src/lib/custom-question-scope.ts";

assert.equal(
  isThirdPartyCustomQuestion("брат родной жены ушел на СВО"),
  true,
  "brother-in-law SVO"
);

assert.equal(
  isThirdPartyCustomQuestion("что со мной происходит на самом деле"),
  false,
  "self-focused question"
);

assert.equal(
  isThirdPartyCustomQuestion("стоит ли мне менять работу"),
  false,
  "self career question"
);

assert.equal(
  isThirdPartyCustomQuestion("жив ли он"),
  true,
  "is-he-alive without trailing space after он"
);
assert.equal(
  isThirdPartyCustomQuestion("жив ли он?"),
  true,
  "is-he-alive with question mark"
);
assert.equal(
  isThirdPartyCustomQuestion("жив ли я"),
  false,
  "is-he-alive about self"
);

const rules = customQuestionSpreadRules("что с братом жены на СВО");
assert.ok(rules.includes("СУБЪЕКТ РАСКЛАДА"), "third-party rules present");
assert.ok(rules.includes("что с братом жены на СВО"), "question echoed");
assert.ok(rules.includes("ИМЯ КЛИЕНТА ≠ СУБЪЕКТ ВОПРОСА"), "client name is not subject");

const aliveRules = customQuestionSpreadRules("жив ли он");
assert.ok(aliveRules.includes("ИМЯ КЛИЕНТА ≠ СУБЪЕКТ ВОПРОСА"), "alive question keeps client name out");

console.log("OK: custom-question-scope");
