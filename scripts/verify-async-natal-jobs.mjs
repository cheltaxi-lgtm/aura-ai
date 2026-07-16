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

const migration = read("scripts/migrations/070_migrate_natal_async_jobs.sql");
assert.match(migration, /natal_interpretation/);
assert.match(migration, /locked_at/);
assert.match(migration, /idx_async_jobs_worker_claim/);

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
}

const worker = read("scripts/run-async-jobs.ts");
assert.match(worker, /claimAsyncJobs/);
assert.match(worker, /ASYNC_JOB_WORKER_SECRET/);
assert.match(worker, /natal_compatibility/);
assert.match(worker, /completeAsyncJob/);
assert.match(worker, /failAsyncJob/);

const middleware = read("src/middleware.ts");
assert.match(middleware, /isAuthenticatedNatalWorkerRequest/);
assert.match(middleware, /x-async-job-worker-secret/);
assert.match(middleware, /x-async-job-user-id/);
assert.match(middleware, /provided === expected/);

const refundService = read("src/lib/rune-service.ts");
assert.match(refundService, /ON CONFLICT \(refund_of_transaction_id\)/);

console.log("Async natal job guardrails passed.");
