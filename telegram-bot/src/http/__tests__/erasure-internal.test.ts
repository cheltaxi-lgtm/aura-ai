import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { botConfig } from "../../config.js";
import { getDb, migrate } from "../../db/client.js";
import { migrateUp } from "../../db/migrate-runner.js";
import { deleteUserData, upsertUser, getUser, setFlag } from "../../db/repos.js";
import { beginUserErasure, completeUserErasure } from "../../domain/user-erasure.js";
import { hasActiveUserOperation } from "../../middleware/activity.js";
import { deliverReminder } from "../../jobs/reminder-delivery.js";
import { maybeSendLinkWelcome } from "../../domain/link/welcome.js";
import { handleReminderNotify } from "../reminder.js";
import { handleReportReadyNotify } from "../report-ready.js";
import { handleSupportReplyNotify } from "../support-reply.js";
import { handleAccountLinked } from "../account-linked.js";
import { safeZovusUrl } from "../internal-user-activity.js";
import { readInternalBody } from "../read-body.js";

const uid = 960_001;
const op = "f253e354-8d8f-4d1d-ae12-54a683617996";
const originalSecret = botConfig.internalSecret;
Object.assign(botConfig, { internalSecret: "offline-test-secret" });
migrate(); migrateUp();
const db = getDb();
deleteUserData(uid);
db.prepare("DELETE FROM bot_user_erasure WHERE telegram_user_id = ?").run(uid);
upsertUser({ telegramUserId: uid, chatId: uid, firstName: "Internal erasure test" });
setFlag("reminders_enabled", true);

type Handler = (req: IncomingMessage, res: ServerResponse, path: string) => Promise<boolean>;
async function call(handler: Handler, path: string, extra: Record<string, unknown> = {}) {
  const request = new PassThrough() as unknown as IncomingMessage;
  Object.assign(request, { method: "POST", headers: { "x-bot-internal-secret": botConfig.internalSecret }, socket: { remoteAddress: "127.0.0.1" } });
  let status = 0;
  let body = "";
  const response = { writeHead(code: number) { status = code; return this; }, end(text: string) { body = text; } } as unknown as ServerResponse;
  const handled = handler(request, response, path);
  (request as unknown as PassThrough).end(JSON.stringify({ telegram_user_id: uid, title: "Test", body: "Test", ...extra }));
  await handled;
  return { status, body: JSON.parse(body) };
}

const originalFetch = globalThis.fetch;
let sends = 0;
let release!: () => void;
globalThis.fetch = (async () => {
  sends++;
  await new Promise<void>(resolve => { release = resolve; });
  return new Response("{}", { status: 200 });
}) as typeof fetch;
try {
  // Erasure must wait for an internal send that is already in flight.
  const inFlight = call(handleReminderNotify, "/internal/reminder");
  for (let attempt = 0; !release && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  assert(release, "test notification must reach the mocked transport");
  assert(hasActiveUserOperation(uid));
  assert.equal(beginUserErasure(uid, op), false, "purge waits for active internal notification");
  assert(getUser(uid), "profile remains until old work drains");
  for (const [handler, route] of [
    [handleReminderNotify, "/internal/reminder"], [handleReportReadyNotify, "/internal/report-ready"],
    [handleSupportReplyNotify, "/internal/support-reply"], [handleAccountLinked, "/internal/account-linked"],
  ] as [Handler, string][]) {
    const denied = await call(handler, route);
    assert.equal(denied.status, 409, `${route} respects erasure fence`);
  }
  await maybeSendLinkWelcome(uid);
  await deliverReminder(uid, "abandoned", async () => { sends++; });
  assert.equal(sends, 1, "no new welcome/reminder/internal sends while erasing");
  release();
  await inFlight;
  assert(!hasActiveUserOperation(uid));
  assert(beginUserErasure(uid, op), "erasure proceeds after drain");
  assert(!getUser(uid));
  assert(completeUserErasure(uid, op));

  // A new bot profile at the same Telegram ID must not receive the erased
  // account's delayed previews, even after its erasure fence was completed.
  upsertUser({ telegramUserId: uid, chatId: uid, firstName: 'New account' });
  const beforeReplay = sends;
  globalThis.fetch = (async () => { sends++; return new Response('{}', { status: 200 }); }) as typeof fetch;
  const originalSite = botConfig.siteInternalBaseUrl;
  let resolveOk = true;
  const resolver = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: resolveOk, linked: true, profileUserId: 'new-profile' }));
  });
  await new Promise<void>(resolve => resolver.listen(0, '127.0.0.1', resolve));
  Object.assign(botConfig, { siteInternalBaseUrl: `http://127.0.0.1:${(resolver.address() as { port: number }).port}` });
  try {
    for (const [handler, route] of [
      [handleReminderNotify, '/internal/reminder'], [handleReportReadyNotify, '/internal/report-ready'],
      [handleSupportReplyNotify, '/internal/support-reply'],
    ] as [Handler, string][]) {
      assert.equal((await call(handler, route)).body.reason, 'notification_identity_required');
      assert.equal((await call(handler, route, { source_profile_user_id: 'erased-profile' })).body.reason, 'notification_identity_mismatch');
      assert.equal(sends, beforeReplay, 'legacy and old-profile notices must not reach Telegram');
    }
    resolveOk = false;
    assert.equal((await call(handleReportReadyNotify, '/internal/report-ready', { source_profile_user_id: 'new-profile' })).status, 503);
    assert.equal(sends, beforeReplay, 'failed identity lookup is fail closed');
    resolveOk = true;
    for (const [handler, route] of [
      [handleReminderNotify, '/internal/reminder'], [handleReportReadyNotify, '/internal/report-ready'],
      [handleSupportReplyNotify, '/internal/support-reply'],
    ] as [Handler, string][]) {
      assert.equal((await call(handler, route, { source_profile_user_id: 'new-profile' })).body.delivered, true);
    }
    assert.equal(sends, beforeReplay + 3, 'new-profile notices deliver after identity validation');
  } finally {
    Object.assign(botConfig, { siteInternalBaseUrl: originalSite });
    resolver.closeAllConnections();
    await new Promise<void>(resolve => resolver.close(() => resolve()));
  }

  const fallback = "https://zovus.ru/";
  assert.equal(safeZovusUrl("https://evilzovus.ru/path", fallback), fallback);
  assert.equal(safeZovusUrl("https://zovus.ru.evil.test/path", fallback), fallback);
  assert.equal(safeZovusUrl("https://zovus.ru@evil.test/path", fallback), fallback);
  assert.equal(safeZovusUrl("https://cabinet.zovus.ru/path", fallback), "https://cabinet.zovus.ru/path");
  const oversized = new PassThrough();
  const bodyRead = readInternalBody(oversized as unknown as IncomingMessage, 4);
  oversized.end("too large");
  await assert.rejects(bodyRead, /body_too_large/);
  console.log("ok: internal notification erasure fence / active send drain / reminder-welcome exclusion / exact URL domain");
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(botConfig, { internalSecret: originalSecret });
  release?.();
  deleteUserData(uid);
  db.prepare("DELETE FROM bot_user_erasure WHERE telegram_user_id = ?").run(uid);
}
