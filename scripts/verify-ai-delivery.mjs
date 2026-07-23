import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const reading = read("src/app/api/reading/route.ts");
assert.match(reading, /enqueuePaidAsyncJob/);
assert.doesNotMatch(reading, /from "next\/server".*after|after\(async/);
assert.doesNotMatch(reading, /fallbackReading\(/);
assert.match(reading, /source: "ai"/);
assert.match(reading, /trackWorkerJobCompleted/);
assert.match(reading, /trackWorkerJobFailed/);

const intention = read("src/app/api/intention-spread/route.ts");
assert.doesNotMatch(intention, /buildCardAwareFallbackReading/);
assert.doesNotMatch(intention, /fallbackReading\(/);
assert.match(intention, /generation_failed/);

const chat = read("src/lib/services/chat-orchestrator.ts");
assert.doesNotMatch(chat, /using card-aware chat fallback/);
assert.match(chat, /fail-closed/);
assert.match(chat, /Technical refusals are UI error-state/);

const photoStream = read("src/lib/photo-reading-stream.ts");
assert.doesNotMatch(photoStream, /photoReadingFallback/);
assert.match(photoStream, /Fail-closed/);

const joint = read("src/lib/joint-reading-service.ts");
assert.doesNotMatch(joint, /using plain fallback/);
assert.match(joint, /joint_combined_ai_failed/);

const numerolog = read("src/lib/numerology/numerolog-finalize.ts");
assert.match(numerolog, /allowEngineFallback/);
assert.match(numerolog, /Returns null when AI fails/);

const session = read("src/lib/services/numerology-service.ts");
assert.match(session, /numerolog_session_reading_failed/);
assert.doesNotMatch(session, /return fallback;\s*$/m);

const forecast = read("src/app/api/natal-chart/forecast/route.ts");
assert.doesNotMatch(forecast, /buildMinimalNatalReport/);

const client = read("src/lib/client/wait-for-async-job.ts");
assert.match(client, /waitForAsyncJob/);
assert.match(client, /fetchActiveAsyncJobs/);

const chatActions = read("src/hooks/useChatActions.ts");
assert.match(chatActions, /async: true/);
assert.match(chatActions, /waitForAsyncJob/);

const migration = read("scripts/migrations/077_migrate_premium_ai_delivery.sql");
assert.match(migration, /dedupe_key/);
assert.match(migration, /provenance/);

console.log("verify-ai-delivery: OK");
