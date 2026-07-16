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
  assert.match(source, /beginWorkerJobSave/);
  assert.match(source, /trackWorkerJobCompleted/);
  assert.doesNotMatch(source, /await BillingService\.chargeRuneAction/);
}

const enqueue = read("src/lib/natal/async-job-route.ts");
assert.match(enqueue, /MAX_ACTIVE_NATAL_JOBS_PER_USER/);
assert.match(enqueue, /async_job_limit/);

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
assert.match(worker, /280_000/);

const sharedAuth = read("src/lib/async-job-worker-auth-shared.ts");
assert.match(sharedAuth, /isAuthenticatedNatalWorkerRequest/);
assert.match(sharedAuth, /isDirectLoopbackWorkerCall/);
assert.match(sharedAuth, /secretsMatchEdge/);

const middleware = read("src/middleware.ts");
assert.match(middleware, /natalWorkerRequest/);
assert.match(middleware, /finish in-flight paid jobs during maintenance/);

const lifecycle = read("src/lib/natal/async-job-lifecycle.ts");
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

const callback = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
assert.match(callback, /#handoff=/);
assert.doesNotMatch(callback, /completeParams\.set\("handoff"/);

const social = read("src/components/auth/SocialAuthButtons.tsx");
assert.match(social, /aura_oauth_handoff/);
assert.doesNotMatch(social, /params\.set\("handoff"/);

const complete = read("src/app/auth/oauth/complete/page.tsx");
assert.match(complete, /handoffFromHash/);
assert.match(complete, /aura_oauth_handoff/);

const refundService = read("src/lib/rune-service.ts");
assert.match(refundService, /ON CONFLICT \(refund_of_transaction_id\)/);

const landing = read("scripts/generate-landing-cards.mjs");
assert.match(landing, /IMAGE_HOST_ALLOWLIST/);
assert.match(landing, /assertAllowedImageUrl/);

console.log("Async natal job guardrails passed.");
