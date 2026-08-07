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
assert.match(reading, /buildAiProvenance/);
assert.match(reading, /isAiCacheReusable/);
assert.match(reading, /trackWorkerJobCompleted/);
assert.match(reading, /trackWorkerJobFailed/);

const intention = read("src/app/api/intention-spread/route.ts");
assert.match(intention, /enqueuePaidAsyncJob/);
assert.match(intention, /intention_spread/);
assert.match(intention, /trackWorkerJobCompleted/);
assert.match(intention, /trackWorkerJobFailed/);
assert.match(intention, /isAiCacheReusable/);
assert.match(intention, /buildAiProvenance/);
assert.doesNotMatch(intention, /buildCardAwareFallbackReading/);
assert.doesNotMatch(intention, /fallbackReading\(/);
assert.match(intention, /generation_failed/);

const daily = read("src/app/api/daily-reading/route.ts");
assert.match(daily, /enqueuePaidAsyncJob/);
assert.match(daily, /daily_reading|daily_extended/);
assert.match(daily, /trackWorkerJobCompleted/);
assert.match(daily, /trackWorkerJobFailed/);
assert.match(daily, /generation_failed/);

const image = read("src/app/api/image/generate/route.ts");
assert.match(image, /enqueuePaidAsyncJob/);
assert.doesNotMatch(image, /\bafter\s*\(/);
assert.doesNotMatch(image, /createAsyncJob/);
assert.match(image, /trackWorkerJobCompleted/);

const registry = read("src/lib/async-job-registry.ts");
assert.match(registry, /intention_spread/);
assert.match(registry, /daily_reading/);
assert.match(registry, /daily_extended/);
assert.match(registry, /image_generate/);
assert.match(registry, /DEFAULT_WORKER_KINDS/);

const intentionClient = read("src/lib/intention-spread-client.ts");
assert.match(intentionClient, /postWithAsyncJob/);

const premiumEnergy = read("src/components/PremiumEnergyBlock.tsx");
assert.match(premiumEnergy, /postWithAsyncJob/);

const adminSettingsApi = read("src/app/api/admin/settings/route.ts");
assert.match(adminSettingsApi, /aiDelivery/);

const adminSettingsPage = read("src/app/admin/settings/page.tsx");
assert.match(adminSettingsPage, /aiDelivery/);
assert.match(adminSettingsPage, /enabledKinds/);

const adminAi = read("src/app/admin/ai/page.tsx");
assert.match(adminAi, /fallbackModels/);
assert.match(adminAi, /natalFallbackModels/);

const chat = read("src/lib/services/chat-orchestrator.ts");
assert.doesNotMatch(chat, /using card-aware chat fallback/);
assert.doesNotMatch(chat, /buildCardAwareFallbackReading/);
assert.match(chat, /Fail-closed on templates/);
assert.match(chat, /rescueSpreadReplyWithAi/);
assert.match(chat, /Technical refusals are UI error-state/);

// Paid readings escalate across models instead of dying on the first validation miss.
const readingRescue = read("src/lib/reading-ai-rescue.ts");
assert.match(readingRescue, /resolveReadingModelChain/);
assert.match(readingRescue, /rescueReadingWithAi/);
assert.doesNotMatch(readingRescue, /buildCardAwareFallbackReading/);

const chatPrompts = read("src/lib/chat-prompts.ts");
assert.match(chatPrompts, /rescueReadingWithAi/);
assert.match(chatPrompts, /evaluatePaidReadingQuality/);
assert.doesNotMatch(chatPrompts, /buildCardAwareFallbackReading/);

const qualityGate = read("src/lib/reading-quality-gate.ts");
assert.match(qualityGate, /missing_simply_words/);
assert.match(qualityGate, /mixed_address/);
assert.match(qualityGate, /buildQualityRepairHint/);

const photoStream = read("src/lib/photo-reading-stream.ts");
assert.doesNotMatch(photoStream, /photoReadingFallback/);
assert.match(photoStream, /Fail-closed/);

const jointService = read("src/lib/joint-reading-service.ts");
assert.doesNotMatch(jointService, /using plain fallback/);
assert.match(jointService, /joint_combined_ai_failed/);

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
assert.match(client, /postWithAsyncJob/);

const chatActions = read("src/hooks/useChatActions.ts");
assert.match(chatActions, /async: true/);
assert.match(chatActions, /waitForAsyncJob/);

const migration = read("scripts/migrations/077_migrate_premium_ai_delivery.sql");
assert.match(migration, /dedupe_key/);
assert.match(migration, /provenance/);

const quarantine = read("scripts/quarantine-legacy-fallback-readings.ts");
assert.match(quarantine, /legacy_fallback/);

const syncEnv = read("hosting/sync-async-jobs-env.sh");
assert.match(syncEnv, /async-jobs-shared\.env\.keys/);
const sharedEnvKeys = read("hosting/async-jobs-shared.env.keys");
assert.match(sharedEnvKeys, /ASYNC_JOB_KINDS/);
assert.match(sharedEnvKeys, /OPENROUTER_HTTPS_PROXY/);
assert.match(sharedEnvKeys, /ASYNC_REPORT_INPROCESS/);
assert.match(sharedEnvKeys, /AUTH_SECRET/);

const photo = read("src/app/api/photo-reading/stream/route.ts");
assert.match(photo, /enqueuePaidAsyncJob/);
assert.match(photo, /createPhotoInterpretationJson/);
assert.match(photo, /trackWorkerJobCompleted/);

const ritual = read("src/app/api/ritual/[id]/regenerate/route.ts");
assert.match(ritual, /enqueuePaidAsyncJob/);
assert.match(ritual, /trackWorkerJobCompleted/);

const joint = read("src/app/api/joint-reading/create/route.ts");
assert.match(joint, /enqueuePaidAsyncJob/);
assert.match(joint, /trackWorkerJobCompleted/);

assert.match(registry, /photo_reading/);
assert.match(registry, /ritual_generation/);
assert.match(registry, /joint_reading/);

const photoClient = read("src/components/PhotoReadingFlow.tsx");
assert.match(photoClient, /postWithAsyncJob/);
assert.match(photoClient, /resumeStoredOrActiveAsyncJob/);

const ritualClient = read("src/components/ritual/RitualGenerating.tsx");
assert.match(ritualClient, /postWithAsyncJob/);

const jointClient = read("src/components/seo/JointReadingInvite.tsx");
assert.match(jointClient, /postWithAsyncJob/);

assert.match(client, /resumeStoredOrActiveAsyncJob/);

const combine = read("src/app/api/joint-reading/[token]/combine/route.ts");
assert.match(combine, /joint_combined|ensureCombinedReading/);
assert.match(combine, /trackWorkerJobCompleted/);

assert.match(registry, /joint_combined/);

console.log("verify-ai-delivery: OK");
