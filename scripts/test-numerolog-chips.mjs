#!/usr/bin/env node
/**
 * Verify numerology tool preset messages trigger topic-handlers.
 * Run: npx tsx scripts/test-numerolog-chips.mjs
 */
import { detectNumerologyTopics } from "../src/lib/numerology/topic-handlers.ts";
import {
  NUMEROLOG_TOOLS,
  buildNumerologToolMessage,
} from "../src/lib/numerology/tools.ts";

const PERIOD_EXPECTATIONS = {
  period_today: "personal_cycle",
  period_week: "personal_cycle",
  period_month: "personal_cycle",
};

let failed = 0;

for (const tool of NUMEROLOG_TOOLS) {
  if (tool.id === "spread_three_numbers") continue;

  const message =
    tool.id === "compatibility"
      ? buildNumerologToolMessage(tool.id, {
          partnerName: "Борис",
          partnerDate: "22.07.1988",
        })
      : tool.id === "object_number"
        ? buildNumerologToolMessage(tool.id, { objectValue: "+79991234567" })
        : buildNumerologToolMessage(tool.id);

  const expectedTopic = PERIOD_EXPECTATIONS[tool.id] ?? tool.topic;
  const topics = detectNumerologyTopics(message);
  const ok = topics.includes(expectedTopic);
  console.log(
    `${ok ? "OK" : "FAIL"}: [${tool.label}] → ${expectedTopic} in [${topics.join(", ")}]`
  );
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} tool message(s) failed topic detection.`);
  process.exit(1);
}
console.log("\nAll numerology tool messages trigger expected topics.");
