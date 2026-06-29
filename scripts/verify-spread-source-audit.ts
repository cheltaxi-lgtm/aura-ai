/**
 * Static audit for N-card spread integration — run via npm run test:spreads
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const onboarding = read("src/hooks/useOnboardingFlow.ts");
const homePage = read("src/components/HomePage.tsx");
const sessionMemory = read("src/lib/session-memory.ts");
const spreadCardsKey = read("src/lib/spreads/spread-cards-key.ts");
const metrics = read("src/lib/spreads/metrics.ts");

// Recovery paths must use hasCompleteSpread, not triplet-only gates.
assert(
  !/openChatWithSessionParams[\s\S]*catch[\s\S]*cardNames\.length >= 3/.test(onboarding),
  "openChatWithSessionParams recovery avoids cardNames.length >= 3"
);
assert(
  onboarding.includes("if (hasCompleteSpread(cardNames, recoverySpreadId, \"new\"))"),
  "openChatWithSessionParams recovery uses hasCompleteSpread"
);

function pollBlocksHaveSpreadId(source: string, label: string) {
  const re = /pollIntentionSpreadReading\(\{[\s\S]*?\}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    assert(match[0].includes("spreadId"), `${label}: poll includes spreadId`);
    assert(
      match[0].includes("cardCount") || match[0].includes("cardNames"),
      `${label}: poll includes cardCount or cardNames`
    );
  }
}

pollBlocksHaveSpreadId(onboarding, "useOnboardingFlow");
pollBlocksHaveSpreadId(homePage, "HomePage");

assert(
  !sessionMemory.includes("slice(0, 5)") || sessionMemory.includes("limitSpreadKeyCards"),
  "session-memory keyCards use limitSpreadKeyCards not slice(0,5)"
);
assert(sessionMemory.includes("limitSpreadKeyCards"), "session-memory imports limitSpreadKeyCards");

assert(
  !spreadCardsKey.includes("slice(0, 3)"),
  "spread-cards-key has no hardcoded triplet slice(0,3)"
);

assert(metrics.includes("/api/metrics/spread"), "metrics client posts to /api/metrics/spread");

assert(
  fs.existsSync(path.join(root, "src/app/api/metrics/spread/route.ts")),
  "metrics spread API route exists"
);

const formatTs = read("src/lib/prompts/format.ts");
assert(
  formatTs.includes("export const SPREAD_FINAL_CONCLUSION_RULES = spreadFinalConclusionRules(3)"),
  "SPREAD_FINAL_CONCLUSION_RULES aliases dynamic N-card rules"
);

if (failed > 0) {
  console.error(`\n${failed} source audit check(s) failed`);
  process.exit(1);
}
console.log("\nAll spread source audits passed.");
