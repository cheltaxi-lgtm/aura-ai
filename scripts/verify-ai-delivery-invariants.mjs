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
assert.match(chatPrompts, /Fail-closed/);

const validated = read("src/lib/validated-ai-generation.ts");
assert.match(validated, /fallbackModelUsed|natalFallbackModels|fallbackModels/);
assert.match(validated, /toAiFailure/);

// Forbidden success-path markers still must not appear in paid routes.
for (const file of [
  "src/app/api/reading/route.ts",
  "src/app/api/intention-spread/route.ts",
  "src/app/api/daily-reading/route.ts",
  "src/app/api/natal-chart/forecast/route.ts",
]) {
  const src = read(file);
  assert.doesNotMatch(src, /fallbackReading\(/);
  assert.doesNotMatch(src, /buildMinimalNatalReport\(/);
  assert.doesNotMatch(src, /photoReadingFallback\(/);
}

console.log("verify-ai-delivery-invariants: OK");
