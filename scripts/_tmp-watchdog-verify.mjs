/**
 * Watchdog verification without waiting 25m wall-clock:
 * insert a synthetic running job with old started_at, run reapWatchdog, check admin signal.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

for (const line of readFileSync("/opt/aura-ai/.env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[m[1]] = v.replace(/\\n/g, "\n");
}

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const {
  reapWatchdogRunningAsyncJobs,
  countRecentWatchdogReaps,
  ASYNC_JOB_WATCHDOG_MS_DEFAULT,
} = await import("../src/lib/async-jobs.ts");

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const userId = "6bebc658-a819-4ecd-b62f-20fdfc327dbf";
const { rows } = await c.query(
  `INSERT INTO async_jobs (user_id, kind, status, input, billing_state, attempt_count, started_at, locked_at, worker_id, expires_at)
   VALUES ($1, 'hd_report', 'running', '{}'::jsonb, 'unbilled', 1,
           NOW() - interval '26 minutes', NOW() - interval '26 minutes', 'watchdog-test-dead',
           NOW() + interval '1 day')
   RETURNING id`,
  [userId]
);
const id = rows[0].id;
console.log("seeded", id, "watchdogDefaultMs", ASYNC_JOB_WATCHDOG_MS_DEFAULT);

const before = await countRecentWatchdogReaps(1);
const result = await reapWatchdogRunningAsyncJobs({
  maxRunningMs: ASYNC_JOB_WATCHDOG_MS_DEFAULT,
  kinds: ["hd_report"],
});
const after = await countRecentWatchdogReaps(1);
const job = (
  await c.query(
    `SELECT status, error_code, period_metadata ? 'watchdog_reaped_at' AS tagged, billing_state
     FROM async_jobs WHERE id=$1`,
    [id]
  )
).rows[0];

await c.query(`DELETE FROM async_jobs WHERE id=$1`, [id]);
await c.end();

const ok =
  result.requeued >= 1 &&
  job.status === "pending" &&
  job.error_code === "watchdog_requeued" &&
  job.tagged === true &&
  after > before;

console.log(
  JSON.stringify(
    { ok, result, job, before, after, adminAlertWouldFire: after > 0 },
    null,
    2
  )
);
process.exit(ok ? 0 : 2);
