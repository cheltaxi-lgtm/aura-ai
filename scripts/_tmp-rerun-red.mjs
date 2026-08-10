/**
 * Re-run only red cells: natal_interpretation (p4), kill -9, proxy mid-job.
 * Also quick-check hd_report / numerology / pro for p1–p2 after claim logging.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { SignJWT } from "jose";
import pg from "pg";

const BASE = "http://127.0.0.1:3000";
const OUT = "/tmp/rerun_red_results.json";
const LOG = "/tmp/rerun_red.log";

function loadEnvLocal() {
  for (const line of readFileSync("/opt/aura-ai/.env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[m[1]] = v.replace(/\\n/g, "\n");
  }
}
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mintCookie(client, accountId) {
  const { rows } = await client.query(
    `SELECT id, email, name, profile_user_id, token_version FROM user_accounts WHERE id=$1`,
    [accountId]
  );
  const acc = rows[0];
  const token = await new SignJWT({
    sub: acc.id,
    role: "user",
    email: acc.email,
    name: acc.name || "Smoke",
    tv: Number(acc.token_version) || 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { cookie: `aura_auth=${token}`, profileUserId: acc.profile_user_id };
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function waitJob(client, jobId, label, timeoutMs = 40 * 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { rows } = await client.query(
      `SELECT id, kind, status, billing_state, attempt_count, error_code,
              left(coalesce(error_message,''),160) AS error_message,
              generation_ms, charge_transaction_id, next_attempt_at
       FROM async_jobs WHERE id=$1::uuid`,
      [jobId]
    );
    const row = rows[0];
    log(`poll ${label}`, {
      status: row.status,
      attempt: row.attempt_count,
      err: row.error_code || row.error_message || null,
      next: row.next_attempt_at,
    });
    if (["completed", "failed", "needs_regeneration"].includes(row.status)) {
      return { ...row, elapsedMs: Date.now() - t0 };
    }
    await sleep(10_000);
  }
  throw new Error("timeout " + jobId);
}

function workerHit(jobId) {
  try {
    const hit = execSync(
      `grep -E 'claim .*job=${jobId}|finish .*job=${jobId}' /var/log/aura-ai/async-jobs.log | wc -l`,
      { encoding: "utf8", shell: "/bin/bash" }
    );
    return Number(hit.trim()) > 0;
  } catch {
    return false;
  }
}

async function countCharges(client, userId, action, sinceIso) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM rune_transactions
     WHERE user_id=$1 AND created_at >= $2::timestamptz AND action_type=$3 AND type='spend'`,
    [userId, sinceIso, action]
  );
  return rows[0].n;
}

async function clearNatalInterpretationCache(client, userId) {
  await client.query(
    `DELETE FROM natal_report_history WHERE user_id=$1 AND report_type='interpretation'`,
    [userId]
  );
  await client.query(
    `UPDATE natal_charts
     SET chart_data =
           (chart_data - 'interpretation')
           || jsonb_build_object(
                'interpretations',
                COALESCE(chart_data->'interpretations', '{}'::jsonb) - 'western',
                'interpretationClaims',
                COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - 'western'
              ),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

function killWorkerHard() {
  // systemctl only — never pkill -f by script path (matches this harness).
  execSync(
    [
      "systemctl kill -s KILL --kill-whom=all aura-ai-async-jobs || true",
      "sleep 2",
      "systemctl reset-failed aura-ai-async-jobs || true",
      "systemctl start aura-ai-async-jobs",
      "sleep 6",
      "systemctl is-active aura-ai-async-jobs",
      "grep -E 'startup orphan|freed report slot|claim .*job=|orphans=' /var/log/aura-ai/async-jobs.log | tail -12 || true",
    ].join("; "),
    { stdio: "inherit", shell: "/bin/bash" }
  );
}

async function main() {
  loadEnvLocal();
  writeFileSync(LOG, `rerun-red start ${new Date().toISOString()}\n`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const smoke = await mintCookie(client, "e6a7f708-4bd6-46f1-a3c7-0b34ceb803d2");
  const gennady = await mintCookie(client, "b5dbca4c-114b-4c62-9546-011ad309e5bb");
  const userId = smoke.profileUserId;
  await client.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 3000) WHERE id=$1`, [
    userId,
  ]);
  await client.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 3000) WHERE id=$1`, [
    gennady.profileUserId,
  ]);
  await api(smoke.cookie, "POST", "/api/age-gate/confirm", { confirmed: true });
  const sinceIso = new Date().toISOString();
  const results = { startedAt: sinceIso, kinds: {}, special: {} };

  const { rows: charts } = await client.query(
    `SELECT id FROM hd_charts WHERE user_id=$1 AND subject_kind='self' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const selfChartId = charts[0].id;

  // Fail any leftover stuck report jobs for smoke user so the lane is free.
  await client.query(
    `UPDATE async_jobs
     SET status='failed', error_code='smoke_reset', error_message='cleared before red rerun',
         updated_at=NOW(), next_attempt_at=NULL, worker_id=NULL
     WHERE status IN ('pending','running')
       AND kind IN (
         'hd_report','hd_composite_report','numerology_reading',
         'natal_interpretation','natal_forecast','natal_compatibility','pro_premium_report'
       )
       AND user_id = $1`,
    [userId]
  ).catch(() => undefined);

  // Ensure single healthy worker + good proxy before red cells
  execSync("bash /tmp/_tmp-fix-workers.sh", { stdio: "inherit", shell: "/bin/bash" });

  // --- natal_interpretation (p4 fix) ---
  log("=== natal_interpretation ===");
  await clearNatalInterpretationCache(client, userId);
  let enq = await api(smoke.cookie, "POST", "/api/natal-chart/interpretation", {
    tradition: "western",
    aiDataUseAcknowledged: true,
    async: true,
    forceRegenerate: true,
  });
  log("enqueue", enq.status, enq.json?.jobId || enq.json);
  if (enq.json?.jobId) {
    const job = await waitJob(client, enq.json.jobId, "natal_interp");
    const charges = await countCharges(client, userId, "NATAL_READING", sinceIso);
    const wh = workerHit(enq.json.jobId);
    results.kinds.natal_interpretation = {
      ok: job.status === "completed" && wh && charges === 1,
      status: job.status,
      billing_state: job.billing_state,
      charge_transaction_id: job.charge_transaction_id,
      p1: job.status === "completed" && wh,
      p2: wh,
      p3: job.status === "completed",
      p4: charges === 1,
      charges,
      elapsedMs: job.elapsedMs,
      jobId: enq.json.jobId,
    };
  } else {
    results.kinds.natal_interpretation = { ok: false, enqueue: enq };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- quick p1/p2 for numerology ---
  log("=== numerology_reading quick ===");
  enq = await api(smoke.cookie, "POST", "/api/reading", {
    characterId: "numerolog",
    async: true,
    birthDate: "1988-07-07",
    numerologToolId: "destiny_matrix",
    forceRegenerate: true,
    aiDataUseAcknowledged: true,
  });
  log("enqueue", enq.status, enq.json?.jobId || enq.json);
  if (enq.json?.jobId) {
    const job = await waitJob(client, enq.json.jobId, "numerology", 15 * 60_000);
    const charges = await countCharges(client, userId, "NUMEROLOGY_SESSION", sinceIso);
    const wh = workerHit(enq.json.jobId);
    results.kinds.numerology_reading = {
      ok: job.status === "completed" && wh && charges >= 1,
      status: job.status,
      p1: job.status === "completed" && wh,
      p2: wh,
      p3: job.status === "completed",
      p4: charges === 1,
      charges,
      jobId: enq.json.jobId,
      elapsedMs: job.elapsedMs,
    };
  } else {
    results.kinds.numerology_reading = { ok: false, enqueue: enq };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- quick pro ---
  log("=== pro_premium_report quick ===");
  const created = await api(gennady.cookie, "POST", "/api/pro/cases", {
    type: "matrix",
    question: "Smoke pro premium matrix red",
  });
  const caseId = created.json?.case?.id;
  if (caseId) {
    await api(gennady.cookie, "PATCH", `/api/pro/cases/${caseId}`, {
      action: "input",
      payload: { birthDate: "1988-07-07", birthCity: "Москва" },
    });
    enq = await api(gennady.cookie, "PATCH", `/api/pro/cases/${caseId}`, {
      action: "generate",
      idempotencyKey: `smoke-pro-red-${Date.now()}`,
    });
    log("enqueue", enq.status, enq.json?.jobId || enq.json);
    if (enq.json?.jobId) {
      const job = await waitJob(client, enq.json.jobId, "pro", 20 * 60_000);
      const wh = workerHit(enq.json.jobId);
      results.kinds.pro_premium_report = {
        ok: job.status === "completed" && wh,
        status: job.status,
        p1: job.status === "completed" && wh,
        p2: wh,
        p3: job.status === "completed",
        p4: null,
        jobId: enq.json.jobId,
        elapsedMs: job.elapsedMs,
      };
    } else {
      results.kinds.pro_premium_report = { ok: false, enqueue: enq };
    }
  } else {
    results.kinds.pro_premium_report = { ok: false, create: created };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- kill -9 mid-job ---
  log("=== kill worker mid-job ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Kill orphan red",
  });
  const killJobId = enq.json?.jobId;
  if (!killJobId) throw new Error("no kill job");
  log("kill enqueue", killJobId);
  for (let i = 0; i < 90; i++) {
    const st = (await client.query(`SELECT status FROM async_jobs WHERE id=$1`, [killJobId])).rows[0]
      ?.status;
    if (st === "running") break;
    await sleep(2000);
  }
  await sleep(45_000);
  const chargesBefore = await countCharges(client, userId, "HD_REPORT", sinceIso);
  killWorkerHard();
  let sawPending = false;
  let sawOrphanLog = false;
  try {
    const og = execSync(
      `grep -E 'startup orphan|freed report slot|orphans=' /var/log/aura-ai/async-jobs.log | tail -8`,
      { encoding: "utf8", shell: "/bin/bash" }
    );
    sawOrphanLog = /orphan|freed report/i.test(og);
    log("orphan_log", og.trim());
  } catch {}
  for (let i = 0; i < 48; i++) {
    const row = (
      await client.query(`SELECT status, error_code, billing_state, attempt_count FROM async_jobs WHERE id=$1`, [
        killJobId,
      ])
    ).rows[0];
    log("kill_poll", row);
    if (row.status === "pending") sawPending = true;
    if (["completed", "failed", "needs_regeneration"].includes(row.status)) break;
    if (row.status === "running" && sawPending) break;
    await sleep(5000);
  }
  const killJob = await waitJob(client, killJobId, "kill-orphan");
  const chargesAfter = await countCharges(client, userId, "HD_REPORT", sinceIso);
  const killWh = workerHit(killJobId);
  results.special.killWorker = {
    ok:
      sawPending &&
      killJob.status === "completed" &&
      chargesAfter - chargesBefore <= 1 &&
      killWh,
    sawPending,
    sawOrphanLog,
    finalStatus: killJob.status,
    chargeDelta: chargesAfter - chargesBefore,
    jobId: killJobId,
    p1: killJob.status === "completed" && killWh,
    p2: killWh,
  };
  results.kinds.hd_report = {
    ok: killJob.status === "completed" && killWh && chargesAfter >= 1,
    status: killJob.status,
    p1: killJob.status === "completed" && killWh,
    p2: killWh,
    p3: null,
    p4: chargesAfter - chargesBefore <= 1,
    jobId: killJobId,
    note: "scored from kill-orphan completion path",
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- proxy mid-job ---
  log("=== proxy mid-job ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Proxy mid-job red",
  });
  const proxyJobId = enq.json?.jobId;
  if (!proxyJobId) throw new Error("no proxy job");
  log("proxy enqueue", proxyJobId);
  let runningSince = 0;
  for (let i = 0; i < 90; i++) {
    const st = (await client.query(`SELECT status FROM async_jobs WHERE id=$1`, [proxyJobId])).rows[0]
      ?.status;
    if (st === "running") {
      if (!runningSince) runningSince = Date.now();
      if (Date.now() - runningSince >= 45_000) break;
    }
    if (["completed", "failed", "needs_regeneration"].includes(st)) {
      throw new Error(`proxy finished too early: ${st}`);
    }
    await sleep(2000);
  }
  const proxyChargesBefore = await countCharges(client, userId, "HD_REPORT", sinceIso);
  // Break proxy mid-flight: update env + hard-restart unit (not pkill -f).
  execSync(
    [
      "cp /opt/aura-ai/.env.async-jobs /tmp/env.async-jobs.bak",
      "sed -i 's|^OPENROUTER_HTTPS_PROXY=.*|OPENROUTER_HTTPS_PROXY=http://127.0.0.1:1|' /opt/aura-ai/.env.async-jobs",
      "systemctl kill -s KILL --kill-whom=all aura-ai-async-jobs || true",
      "sleep 2",
      "systemctl reset-failed aura-ai-async-jobs || true",
      "systemctl start aura-ai-async-jobs",
      "sleep 5",
      "systemctl is-active aura-ai-async-jobs",
    ].join("; "),
    { stdio: "inherit", shell: "/bin/bash" }
  );
  let sawPendingRetry = false;
  let sawCircuit = false;
  let pendingRow = null;
  for (let i = 0; i < 48; i++) {
    const row = (
      await client.query(
        `SELECT status, next_attempt_at, attempt_count, billing_state, error_code FROM async_jobs WHERE id=$1`,
        [proxyJobId]
      )
    ).rows[0];
    log("proxy_poll", row);
    if (row.status === "pending" && row.next_attempt_at) {
      sawPendingRetry = true;
      pendingRow = row;
      break;
    }
    try {
      const cb = execSync(
        `grep -E 'circuit|paused|OpenRouter UNAVAILABLE' /var/log/aura-ai/async-jobs.log | tail -5`,
        { encoding: "utf8", shell: "/bin/bash" }
      );
      if (/UNAVAILABLE|circuit|paused/i.test(cb)) sawCircuit = true;
    } catch {}
    if (["failed", "needs_regeneration", "completed"].includes(row.status)) break;
    await sleep(5000);
  }
  // Restore proxy and resume
  execSync(
    "bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai; systemctl restart aura-ai-async-jobs; sleep 4; grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true; systemctl is-active aura-ai-async-jobs",
    { stdio: "inherit", shell: "/bin/bash" }
  );
  const proxyJob = await waitJob(client, proxyJobId, "proxy-resume", 35 * 60_000);
  const proxyChargesAfter = await countCharges(client, userId, "HD_REPORT", sinceIso);
  results.special.proxyOutage = {
    ok:
      sawPendingRetry &&
      sawCircuit &&
      proxyJob.status === "completed" &&
      proxyChargesAfter - proxyChargesBefore === 0,
    sawPendingRetry,
    sawCircuit,
    pendingRow,
    finalStatus: proxyJob.status,
    chargeDelta: proxyChargesAfter - proxyChargesBefore,
    jobId: proxyJobId,
  };

  results.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("DONE", OUT, results);
  await client.end();
  const fail =
    !results.kinds.natal_interpretation?.ok ||
    !results.kinds.numerology_reading?.ok ||
    !results.kinds.pro_premium_report?.ok ||
    !results.special.killWorker?.ok ||
    !results.special.proxyOutage?.ok;
  process.exit(fail ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
