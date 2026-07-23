import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const jobs = read("src/lib/async-jobs.ts");
assert.match(jobs, /"natal_interpretation"/);
assert.match(jobs, /"natal_forecast"/);
assert.match(jobs, /"natal_compatibility"/);
assert.match(jobs, /"intention_spread"/);
assert.match(jobs, /dedupe_key/);
assert.match(jobs, /attachAsyncJobOutput/);
assert.match(jobs, /listActiveAsyncJobsForUser/);
assert.match(jobs, /FOR UPDATE SKIP LOCKED/);
assert.match(jobs, /attempt_count/);
assert.match(jobs, /reapStaleRunningAsyncJobs/);
assert.match(jobs, /failAsyncJobAndRefundIfCharged/);
assert.match(jobs, /markAsyncJobCharged/);
assert.match(jobs, /findActiveAsyncJob/);
assert.match(jobs, /countActiveAsyncJobsForUser/);
assert.match(jobs, /claimAsyncJobForSave/);
assert.match(jobs, /save_claimed/);
assert.match(jobs, /onlyIfSaveNotClaimed/);
assert.match(jobs, /charge_transaction_id/);
assert.match(jobs, /ABS\(amount\) AS amount/);
assert.doesNotMatch(jobs, /ABS\(amount\)::amount/);
assert.match(jobs, /billing_state IN \('unbilled', 'charged'\)/);
assert.doesNotMatch(jobs, /worker_timeout.*stale_running/);

const migration = read("scripts/migrations/070_migrate_natal_async_jobs.sql");
assert.match(migration, /natal_interpretation/);
assert.match(migration, /locked_at/);
assert.match(migration, /idx_async_jobs_worker_claim/);

const migration073 = read("scripts/migrations/073_migrate_async_job_billing_and_reaper.sql");
assert.match(migration073, /charge_transaction_id/);
assert.match(migration073, /idx_async_jobs_stale_running/);

const migration077 = read("scripts/migrations/077_migrate_premium_ai_delivery.sql");
assert.match(migration077, /dedupe_key/);
assert.match(migration077, /provenance/);
assert.match(migration077, /idx_async_jobs_dedupe_active/);
assert.match(migration077, /intention_spread/);

for (const route of [
  "src/app/api/natal-chart/interpretation/route.ts",
  "src/app/api/natal-chart/forecast/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/generate/route.ts",
]) {
  const source = read(route);
  assert.match(source, /body\.async === true/);
  assert.match(source, /enqueueNatalAsyncJob/);
  assert.match(source, /getAsyncJobWorkerUserId/);
  assert.match(source, /requireProfileUserId|resolveProfileUserContext/);
  assert.match(source, /chargeRuneActionForWorkerJob/);
  assert.match(source, /beginWorkerJobSave/);
  assert.match(source, /trackWorkerJobCompleted/);
  assert.doesNotMatch(source, /await BillingService\.chargeRuneAction/);
}

const enqueueCompat = read("src/lib/natal/async-job-route.ts");
assert.match(enqueueCompat, /enqueueNatalAsyncJob/);
assert.match(enqueueCompat, /async-job-enqueue/);

const enqueue = read("src/lib/async-job-enqueue.ts");
assert.match(enqueue, /enqueuePaidAsyncJob/);
assert.match(enqueue, /async_job_limit/);
assert.match(enqueue, /getJobKindConfig/);

const registry = read("src/lib/async-job-registry.ts");
assert.match(registry, /natal_forecast/);
assert.match(registry, /DEFAULT_WORKER_KINDS/);
assert.match(registry, /endpointForJob/);
assert.match(registry, /resolveWorkerKindsFromEnv/);

const worker = read("scripts/run-async-jobs.ts");
assert.match(worker, /claimAsyncJobs/);
assert.match(worker, /ASYNC_JOB_WORKER_SECRET/);
assert.match(worker, /endpointForJob/);
assert.match(worker, /resolveWorkerKindsFromEnv/);
assert.match(worker, /completeAsyncJob/);
assert.match(worker, /failAsyncJobAndRefundIfCharged/);
assert.match(worker, /reapStaleRunningAsyncJobs/);
assert.match(worker, /assertLoopbackAppUrl/);
assert.match(worker, /inFlight/);
assert.match(worker, /WORKER_JOB_HEADER/);
assert.match(worker, /280_000/);

const sharedAuth = read("src/lib/async-job-worker-auth-shared.ts");
assert.match(sharedAuth, /isAuthenticatedAsyncJobWorkerRequest|isAuthenticatedNatalWorkerRequest/);
assert.match(sharedAuth, /isAsyncJobWorkerEndpoint/);
assert.match(sharedAuth, /isDirectLoopbackWorkerCall/);
assert.match(sharedAuth, /isLoopbackAddress/);
assert.match(sharedAuth, /::ffff:127\.0\.0\.1/);
assert.match(sharedAuth, /secretsMatchEdge/);

const middleware = read("src/middleware.ts");
assert.match(middleware, /natalWorkerRequest/);
assert.match(middleware, /finish in-flight paid jobs during maintenance/);

const lifecycleCompat = read("src/lib/natal/async-job-lifecycle.ts");
assert.match(lifecycleCompat, /async-job-lifecycle/);

const lifecycle = read("src/lib/async-job-lifecycle.ts");
assert.match(lifecycle, /beginWorkerJobSave/);
assert.match(lifecycle, /chargeRuneActionForWorkerJob/);
assert.match(lifecycle, /claimAsyncJobForSave/);

const workerAuth = read("src/lib/async-job-worker-auth.ts");
assert.match(workerAuth, /getAsyncJobWorkerUserId\(request\)/);
assert.match(workerAuth, /Browser JWT requests must not drive billing reuse/);

const appService = read("hosting/aura-ai.service");
assert.match(appService, /127\.0\.0\.1/);
assert.match(appService, /-H 127\.0\.0\.1/);

const service = read("hosting/aura-ai-async-jobs.service");
assert.match(service, /User=aura-ai/);
assert.match(service, /\.env\.async-jobs/);

const ensureUser = read("hosting/ensure-async-jobs-user.sh");
assert.match(ensureUser, /chmod 600/);
assert.doesNotMatch(ensureUser, /usermod -aG/);

const contract = read("src/lib/ai-generation-contract.ts");
assert.match(contract, /AiGenerationOutcome/);
assert.match(contract, /isAiCacheReusable/);
assert.match(contract, /buildAiProvenance/);

const validated = read("src/lib/validated-ai-generation.ts");
assert.match(validated, /generateValidatedAiText/);
assert.match(validated, /fallbackModels|natalFallbackModels|resolveModelChain/);

const refundService = read("src/lib/rune-service.ts");
assert.match(refundService, /ON CONFLICT \(refund_of_transaction_id\)/);

const landing = read("scripts/generate-landing-cards.mjs");
assert.match(landing, /IMAGE_HOST_ALLOWLIST/);
assert.match(landing, /assertAllowedImageUrl/);

console.log("Async natal job guardrails passed.");
