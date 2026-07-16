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
assert.match(jobs, /FOR UPDATE SKIP LOCKED/);
assert.match(jobs, /attempt_count/);
assert.match(jobs, /reapStaleRunningAsyncJobs/);
assert.match(jobs, /failAsyncJobAndRefundIfCharged/);
assert.match(jobs, /markAsyncJobCharged/);
assert.match(jobs, /findActiveAsyncJob/);
assert.match(jobs, /charge_transaction_id/);

const migration = read("scripts/migrations/070_migrate_natal_async_jobs.sql");
assert.match(migration, /natal_interpretation/);
assert.match(migration, /locked_at/);
assert.match(migration, /idx_async_jobs_worker_claim/);

const migration073 = read("scripts/migrations/073_migrate_async_job_billing_and_reaper.sql");
assert.match(migration073, /charge_transaction_id/);
assert.match(migration073, /idx_async_jobs_stale_running/);

for (const route of [
  "src/app/api/natal-chart/interpretation/route.ts",
  "src/app/api/natal-chart/forecast/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/generate/route.ts",
]) {
  const source = read(route);
  assert.match(source, /body\.async === true/);
  assert.match(source, /enqueueNatalAsyncJob/);
  assert.match(source, /getAsyncJobWorkerUserId/);
  assert.match(source, /requireProfileUserId/);
  assert.match(source, /chargeRuneActionForWorkerJob/);
  assert.match(source, /trackWorkerJobCompleted/);
  assert.doesNotMatch(source, /await BillingService\.chargeRuneAction/);
}

const worker = read("scripts/run-async-jobs.ts");
assert.match(worker, /claimAsyncJobs/);
assert.match(worker, /ASYNC_JOB_WORKER_SECRET/);
assert.match(worker, /natal_compatibility/);
assert.match(worker, /completeAsyncJob/);
assert.match(worker, /failAsyncJobAndRefundIfCharged/);
assert.match(worker, /reapStaleRunningAsyncJobs/);
assert.match(worker, /assertLoopbackAppUrl/);
assert.match(worker, /inFlight/);
assert.match(worker, /WORKER_JOB_HEADER/);

const sharedAuth = read("src/lib/async-job-worker-auth-shared.ts");
assert.match(sharedAuth, /isAuthenticatedNatalWorkerRequest/);
assert.match(sharedAuth, /isDirectLoopbackWorkerCall/);
assert.match(sharedAuth, /secretsMatchEdge/);
assert.match(sharedAuth, /x-async-job-worker-secret/);
assert.match(sharedAuth, /x-async-job-user-id/);

const middleware = read("src/middleware.ts");
assert.match(middleware, /isAuthenticatedNatalWorkerRequest/);
assert.match(middleware, /async-job-worker-auth-shared/);
assert.doesNotMatch(middleware, /provided === expected/);

const lifecycle = read("src/lib/natal/async-job-lifecycle.ts");
assert.match(lifecycle, /chargeRuneActionForWorkerJob/);
assert.match(lifecycle, /billing_state === "charged"/);
assert.match(lifecycle, /billingChargeFromExistingTransaction/);

const service = read("hosting/aura-ai-async-jobs.service");
assert.match(service, /User=aura-ai/);
assert.match(service, /\.env\.async-jobs/);

const ensureUser = read("hosting/ensure-async-jobs-user.sh");
assert.match(ensureUser, /chmod 600/);
assert.match(ensureUser, /\.env\.local/);
assert.doesNotMatch(ensureUser, /usermod -aG/);
assert.match(ensureUser, /gpasswd -d aura-ai/);

const refundService = read("src/lib/rune-service.ts");
assert.match(refundService, /ON CONFLICT \(refund_of_transaction_id\)/);

const landing = read("scripts/generate-landing-cards.mjs");
assert.match(landing, /IMAGE_HOST_ALLOWLIST/);
assert.match(landing, /assertAllowedImageUrl/);

console.log("Async natal job guardrails passed.");
