import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context } from "grammy";

process.env.BOT_DATA_DIR = mkdtempSync(join(tmpdir(), "zovus-registration-test-"));
process.env.TELEGRAM_BOT_TOKEN = "123456:offline";
process.env.BOT_INTERNAL_SECRET = "registration-test-secret";

let resolveResponse = { ok: true, linked: true, accountId: "account", profileUserId: "profile" as string | null, needsOnboarding: false };
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/internal/bot/resolve") {
    res.end(JSON.stringify(resolveResponse));
    return;
  }
  res.statusCode = 500;
  res.end(JSON.stringify({ ok: false }));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
process.env.SITE_INTERNAL_BASE_URL = `http://127.0.0.1:${address.port}`;

try {
  const { migrate } = await import("../../db/client.js");
  const { migrateUp, ensureCriticalColumns } = await import("../../db/migrate-runner.js");
  const { upsertUser, confirmAge, confirmConsent, getFlow, getUser, setFlow } = await import("../../db/repos.js");
  const { ageFromIso, beginProfileOnboarding, handleProfileFlowText, handleProfileUnexpectedInput, parseBirthDateRu } = await import("../profile-onboarding.js");
  const { ensureSiteLinked, syncSiteAccount } = await import("../site-account.js");
  migrate(); migrateUp(); ensureCriticalColumns();

  for (const [input, expected] of [
    ["24.09.1990", "1990-09-24"],
    ["24/09/1990", "1990-09-24"],
    ["24-09-1990", "1990-09-24"],
    ["24 09 1990", "1990-09-24"],
    ["24091990", "1990-09-24"],
    ["1990-09-24", "1990-09-24"],
    ["31.02.1990", null],
    ["random", null],
  ] as const) assert.equal(parseBirthDateRu(input), expected);
  const utcBirthdayEve = Date.parse("2026-09-23T22:30:00Z");
  assert.equal(ageFromIso("2008-09-24", 180, utcBirthdayEve), 18);
  assert.equal(ageFromIso("2008-09-24", -300, utcBirthdayEve), 17);

  const id = 7012345678;
  upsertUser({ telegramUserId: id, chatId: id, firstName: "Test" });
  confirmAge(id); confirmConsent(id);
  const replies: string[] = [];
  const ctx = {
    from: { id, first_name: "Test" },
    reply: async (message: string) => { replies.push(message); return {} as never; },
  } as unknown as Context;

  setFlow(id, "profile", "dob", { birthCity: "Екатеринбург" });
  await beginProfileOnboarding(ctx);
  assert.equal(getFlow(id)?.step, "dob", "/start should resume DOB rather than restart onboarding");
  assert(replies.at(-1)?.includes("Шаг 3/5"));
  await handleProfileUnexpectedInput(ctx, "voice");
  assert.equal(getFlow(id)?.step, "dob", "voice should not leave the registration flow");
  assert(replies.at(-1)?.includes("Шаг 3/5"));
  await handleProfileFlowText(ctx, "31.02.1990");
  assert.equal(getFlow(id)?.step, "dob");
  await handleProfileFlowText(ctx, "24 09 1990");
  assert.equal(getFlow(id)?.step, "gender", "valid DOB should advance the saved profile");
  assert.equal(getFlow(id)?.data.birthCity, "Екатеринбург");

  const site = await ensureSiteLinked(ctx);
  assert.equal(site?.site.needsOnboarding, false);
  assert.equal(getUser(id)?.zovus_user_id, "profile", "site profile should repair stale bot marker");
  assert.equal(getFlow(id), null, "site completion should clear stale bot registration input handler");
  setFlow(id, "profile", "dob", { birthCity: "Екатеринбург" });
  resolveResponse = { ok: true, linked: true, accountId: "account", profileUserId: "profile", needsOnboarding: true };
  await syncSiteAccount(getUser(id)!);
  assert.equal(getUser(id)?.zovus_user_id, "profile", "partial profile ID must remain for receipt idempotency");
  assert.equal(getFlow(id)?.step, "dob", "unfinished site onboarding should preserve bot input handler");
  resolveResponse = { ok: true, linked: false, accountId: "account", profileUserId: null, needsOnboarding: true };
  await syncSiteAccount(getUser(id)!);
  assert.equal(getUser(id)?.zovus_user_id, null, "unlinked site account should clear stale bot marker");
  console.log("registration resume: pass");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
