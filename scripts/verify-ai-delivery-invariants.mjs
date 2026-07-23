/**
 * Static + pure-logic failure-injection invariants for Premium AI delivery.
 * Run: node scripts/verify-ai-delivery-invariants.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function hashAiContent(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isAiCacheReusable(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (meta.source !== "ai") return false;
  const provenance = meta.provenance;
  if (!provenance || typeof provenance !== "object") return false;
  return (
    provenance.source === "ai" &&
    typeof provenance.model === "string" &&
    provenance.model.length > 0 &&
    typeof provenance.contentHash === "string" &&
    provenance.contentHash.length > 0
  );
}

// --- Cache / provenance gates ---
assert.equal(isAiCacheReusable(null), false);
assert.equal(isAiCacheReusable({ source: "ai" }), false);
assert.equal(
  isAiCacheReusable({
    source: "ai",
    provenance: { source: "ai", generatedAt: new Date().toISOString() },
  }),
  false,
  "stub provenance without model/hash must not be reusable"
);
assert.equal(
  isAiCacheReusable({ source: "legacy_fallback", provenance: { source: "legacy_fallback" } }),
  false
);
const good = {
  source: "ai",
  provenance: {
    source: "ai",
    model: "openai/gpt-4o-mini",
    contentHash: hashAiContent("valid reading"),
  },
};
assert.equal(isAiCacheReusable(good), true);

// --- Route invariants (no after(), durable kinds, fail-closed markers) ---
const combine = read("src/app/api/joint-reading/[token]/combine/route.ts");
assert.match(combine, /enqueuePaidAsyncJob|ensureCombinedReading/);
assert.match(combine, /trackWorkerJobCompleted/);
assert.match(combine, /generation_failed/);

const jointGet = read("src/app/api/joint-reading/[token]/route.ts");
assert.match(jointGet, /schedulePaidAsyncJob/);
assert.match(jointGet, /combinedPending/);
assert.doesNotMatch(jointGet, /ensureCombinedReading/);

const jointService = read("src/lib/joint-reading-service.ts");
assert.match(jointService, /schedulePaidAsyncJob/);
assert.match(jointService, /joint_combined/);
assert.doesNotMatch(jointService, /using plain fallback/);

const registry = read("src/lib/async-job-registry.ts");
assert.match(registry, /joint_combined/);
assert.match(registry, /DEFAULT_WORKER_KINDS/);

const migration = read("scripts/migrations/078_migrate_joint_combined_job.sql");
assert.match(migration, /joint_combined/);

const reading = read("src/app/api/reading/route.ts");
assert.match(reading, /isAiCacheReusable/);
assert.match(reading, /generation_failed/);
assert.doesNotMatch(reading, /\bafter\s*\(/);

const image = read("src/app/api/image/generate/route.ts");
assert.doesNotMatch(image, /\bafter\s*\(/);

const chatPrompts = read("src/lib/chat-prompts.ts");
assert.match(chatPrompts, /generateValidatedAiText/);
assert.doesNotMatch(chatPrompts, /export function fallbackReading/);
assert.doesNotMatch(chatPrompts, /export function buildCardAwareFallbackReading/);
assert.doesNotMatch(chatPrompts, /export function buildChatFallbackReply/);

const repairFallbacks = read("src/lib/repair/legacy-fallback-text.ts");
assert.match(repairFallbacks, /export function fallbackReading/);
assert.match(repairFallbacks, /export function photoReadingFallback/);
assert.match(repairFallbacks, /tooling only/);
assert.match(repairFallbacks, /Must never be called from paid production success paths/);

const photoPrompts = read("src/lib/photo-reading-prompts.ts");
assert.doesNotMatch(photoPrompts, /export function photoReadingFallback/);

const validated = read("src/lib/validated-ai-generation.ts");
assert.match(validated, /fallbackModelUsed|natalFallbackModels|fallbackModels/);
assert.match(validated, /toAiFailure/);

const ritualUi = read("src/components/ritual/RitualGenerating.tsx");
assert.match(ritualUi, /resumeStoredOrActiveAsyncJob/);
assert.match(ritualUi, /ritual_generation/);

const jointUi = read("src/app/joint-reading/[token]/page.tsx");
assert.match(jointUi, /waitForAsyncJob/);
assert.match(jointUi, /combinedJobId/);

const asyncJobs = read("src/lib/async-jobs.ts");
assert.match(asyncJobs, /save_claimed/);
assert.match(asyncJobs, /refundChargedAsyncJobIfNeeded/);
assert.match(asyncJobs, /Never re-open a failed\/refunded job/);

// Forbidden success-path markers still must not appear in paid routes.
for (const file of [
  "src/app/api/reading/route.ts",
  "src/app/api/intention-spread/route.ts",
  "src/app/api/daily-reading/route.ts",
  "src/app/api/natal-chart/forecast/route.ts",
  "src/lib/joint-reading-service.ts",
  "src/lib/photo-reading-stream.ts",
  "src/lib/daily-energy.ts",
]) {
  const src = read(file);
  assert.doesNotMatch(src, /fallbackReading\(/);
  assert.doesNotMatch(src, /buildMinimalNatalReport\(/);
  assert.doesNotMatch(src, /photoReadingFallback\(/);
  assert.doesNotMatch(src, /legacy-fallback-text/);
}

// --- Failure-injection matrix (pure state machine) ---
function resolveJobClientOutcome({ status, billingState, hasAiResult }) {
  if (status === "completed" && hasAiResult && billingState !== "refunded") {
    return { ok: true, refunded: false };
  }
  if (status === "failed") {
    return { ok: false, refunded: billingState === "refunded" };
  }
  if (billingState === "refunded") {
    return { ok: false, refunded: true };
  }
  return { ok: false, refunded: false, pending: true };
}

assert.deepEqual(
  resolveJobClientOutcome({
    status: "completed",
    billingState: "charged",
    hasAiResult: true,
  }),
  { ok: true, refunded: false }
);
assert.deepEqual(
  resolveJobClientOutcome({
    status: "failed",
    billingState: "refunded",
    hasAiResult: false,
  }),
  { ok: false, refunded: true },
  "LLM fail after charge must surface refunded"
);
assert.deepEqual(
  resolveJobClientOutcome({
    status: "completed",
    billingState: "refunded",
    hasAiResult: true,
  }),
  { ok: false, refunded: true },
  "refunded job must never be treated as success even if text leaked"
);
assert.equal(
  isAiCacheReusable({
    source: "legacy_fallback",
    provenance: {
      source: "ai",
      model: "x",
      contentHash: hashAiContent("x"),
    },
  }),
  false,
  "legacy_fallback source must not reuse even with ai-shaped provenance"
);

console.log("verify-ai-delivery-invariants: OK");
