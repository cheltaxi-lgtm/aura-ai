#!/usr/bin/env node
/**
 * Smoke tests for numerolog session spread card counts — run: npx tsx scripts/test-numerolog-spread-tools.mjs
 */
import {
  NUMEROLOG_SESSION_TOOLS,
  buildNumerologSpreadCards,
  decodeNumerologSpreadId,
  encodeNumerologSpreadId,
  numerologSpreadComplete,
  numerologSessionNeedsBirthDate,
  numerologSessionNeedsFullName,
  getNumerologTool,
} from "../src/lib/numerology/tools.ts";
import {
  drawNumerologSessionSpread,
  resolveNumerologSpreadCardNames,
} from "../src/lib/numerology/session-draw.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
    return;
  }
  console.log("OK:", msg);
}

for (const tool of NUMEROLOG_SESSION_TOOLS) {
  const names = Array.from({ length: Math.max(tool.drawCount, 0) }, (_, i) =>
    String((i % 9) + 1)
  );
  const encoded = encodeNumerologSpreadId(tool.id);
  assert(decodeNumerologSpreadId(encoded) === tool.id, `encode/decode ${tool.id}`);
  assert(
    numerologSpreadComplete(names, tool.id),
    `${tool.id} complete with ${tool.drawCount} cards`
  );
  if (tool.drawCount > 0) {
    assert(
      !numerologSpreadComplete(names.slice(0, tool.drawCount - 1), tool.id),
      `${tool.id} incomplete with ${tool.drawCount - 1} cards`
    );
    const built = buildNumerologSpreadCards("numerolog", names, tool.id);
    assert(
      built.spreadCards.length === tool.drawCount,
      `${tool.id} buildNumerologSpreadCards length=${built.spreadCards.length}`
    );
  }
}

assert(numerologSpreadComplete([], "pythagoras"), "pythagoras complete with 0 cards");
assert(getNumerologTool("pythagoras").drawCount === 0, "pythagoras drawCount is 0");

const personalYearNames = resolveNumerologSpreadCardNames("personal_year", "15.03.1990");
assert(personalYearNames?.length === 1, "personal_year computed 1 number");

const forecastNames = resolveNumerologSpreadCardNames("forecast_9y", "15.03.1990");
assert(forecastNames?.length === 9, "forecast_9y computed 9 numbers");

const compatNames = resolveNumerologSpreadCardNames("compatibility", "15.03.1990", {
  partnerDate: "22.07.1988",
});
assert(compatNames?.length === 2, "compatibility computed 2 numbers");

const objectNames = resolveNumerologSpreadCardNames("object_number", null, {
  objectValue: "+79991234567",
});
assert(objectNames?.length === 1, "object_number computed 1 number");

const drawnForecast = drawNumerologSessionSpread("forecast_9y", {
  birthDate: "15.03.1990",
});
assert(drawnForecast.length === 9, "drawNumerologSessionSpread forecast_9y returns 9");

assert(numerologSessionNeedsBirthDate("favorable_dates"), "favorable_dates needs birth date");
assert(numerologSessionNeedsBirthDate("compatibility"), "compatibility needs birth date");
assert(numerologSessionNeedsFullName("chaldean"), "chaldean needs full name");
assert(!numerologSessionNeedsBirthDate("object_number"), "object_number does not need birth date");

if (process.exitCode) {
  console.error("\nSome tests failed.");
  process.exit(1);
}
console.log("\nAll numerolog spread tool tests passed.");
