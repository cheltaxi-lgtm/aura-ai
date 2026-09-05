import assert from "node:assert/strict";
import { migrate, getDb } from "../../db/client.js";
import { migrateUp } from "../../db/migrate-runner.js";
import { runtimeHealth, setRuntimeHealth, probeSiteBridgeHealth } from "../runtime-health.js";
import { botConfig } from "../../config.js";

migrate(); migrateUp();
assert(!runtimeHealth().ok, "startup is not readiness");
setRuntimeHealth({ phase: "running", mode: "polling", lastTransportSuccessAt: Date.now(), lastSiteBridgeSuccessAt: Date.now() });
assert(runtimeHealth().ok, "migrated healthy poller is ready");
setRuntimeHealth({ lastTransportSuccessAt: Date.now() - 61_000 });
assert(!runtimeHealth().ok, "dead poller is unready even with healthy HTTP and database");
setRuntimeHealth({ phase: "draining", lastTransportSuccessAt: Date.now() });
assert(!runtimeHealth().ok, "draining instance is unready");
setRuntimeHealth({ phase: "running", mode: "webhook" });
assert(runtimeHealth().ok, "idle webhook does not require incoming user activity for readiness");
const originalRequired = botConfig.requireSiteAccount;
Object.assign(botConfig, { requireSiteAccount: true });
setRuntimeHealth({ lastSiteBridgeSuccessAt: Date.now() - 91_000 });
assert(!runtimeHealth().ok, "unavailable required site bridge degrades readiness");
await probeSiteBridgeHealth(async (_url, init) => {
  assert(init?.signal, "bridge probe has bounded timeout");
  return new Response("{}", { status: 200 });
});
assert(runtimeHealth().ok, "fresh bridge recovery restores readiness");
setRuntimeHealth({ lastSiteBridgeSuccessAt: Date.now() - 91_000 });
await probeSiteBridgeHealth(async () => new Response("error", { status: 503 }));
assert(!runtimeHealth().ok, "failed probe must not refresh success timestamp");
Object.assign(botConfig, { requireSiteAccount: false });
assert(runtimeHealth().ok, "optional site bridge does not block independent mode");
Object.assign(botConfig, { requireSiteAccount: originalRequired });
setRuntimeHealth({ lastSiteBridgeSuccessAt: Date.now() });
const db = getDb();
db.prepare(`INSERT INTO bot_update_inbox (update_id, user_key, payload, status, received_at)
  VALUES (-991, 'health-test', '{}', 'queued', ?)`)
  .run(new Date(Date.now() - 16 * 60_000).toISOString());
try { assert(!runtimeHealth().ok, "stalled durable work degrades readiness"); }
finally { db.prepare("DELETE FROM bot_update_inbox WHERE update_id = -991").run(); }
console.log("ok: readiness vs liveness / startup / transport freshness / drain / stalled inbox");
