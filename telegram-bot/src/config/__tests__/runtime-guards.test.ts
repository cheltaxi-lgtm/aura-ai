/**
 * Run: npx tsx src/config/__tests__/runtime-guards.test.ts
 */
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "test-token-for-guards";
process.env.BOT_MODE = "webhook";
process.env.TELEGRAM_WEBHOOK_URL = "https://example.com/telegram/webhook";
delete process.env.TELEGRAM_WEBHOOK_SECRET;
process.env.BOT_REQUIRE_SITE_ACCOUNT = "true";
process.env.NODE_ENV = "test";

const { assertBotRuntimeGuards } = await import("../../config.js");

let threw = false;
try {
  assertBotRuntimeGuards();
} catch (err) {
  threw = true;
  assert.match(
    err instanceof Error ? err.message : String(err),
    /TELEGRAM_WEBHOOK_SECRET/
  );
}
assert.equal(threw, true, "webhook mode without secret must fail");

process.env.TELEGRAM_WEBHOOK_SECRET = "x".repeat(32);
assert.doesNotThrow(() => assertBotRuntimeGuards());

process.env.NODE_ENV = "production";
process.env.BOT_REQUIRE_SITE_ACCOUNT = "false";
threw = false;
try {
  assertBotRuntimeGuards();
} catch (err) {
  threw = true;
  assert.match(
    err instanceof Error ? err.message : String(err),
    /BOT_REQUIRE_SITE_ACCOUNT/
  );
}
assert.equal(threw, true, "requireSiteAccount=false forbidden in production");

console.log("ok: bot runtime guards");
