/**
 * Focused re-run: kill / proxy / pro only.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { SignJWT } from "jose";
import pg from "pg";

const BASE = "http://127.0.0.1:3000";
const OUT = "/tmp/rerun_three_results.json";
const LOG = "/tmp/rerun_three.log";

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

async function countCharges(client, userId, action, sinceIso) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM rune_transactions
     WHERE user_id=$1 AND created_at >= $2::timestamptz AND action_type=$3 AND type='spend'`,
    [userId, sinceIso, action]
  );
  return rows[0].n;
}

function validateHd(text) {
  const tmp = `/tmp/hd_three_${Date.now()}.md`;
  writeFileSync(tmp, text || "");
  const out = execSync(
    `cd /opt/aura-ai && npx tsx -e "import {readFileSync} from 'fs'; import {validateHdReportText} from './src/lib/hd-report-quality/validator.ts'; const q=validateHdReportText(readFileSync('${tmp}','utf8'),{requireFocusAnswer:false}); console.log(JSON.stringify({ok:q.ok,findings:(q.findings||[]).map(f=>f.rule)}))"`,
    { encoding: "utf8", timeout: 60_000, shell: "/bin/bash" }
  );
  return JSON.parse(out.trim().split("\n").pop());
}

async function main() {
  loadEnvLocal();
  writeFileSync(LOG, `rerun-three start ${new Date().toISOString()}\n`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const smoke = await mintCookie(client, "e6a7f708-4bd6-46f1-a3c7-0b34ceb803d2");
  const gennady = await mintCookie(client, "b5dbca4c-114b-4c62-9546-011ad309e5bb");
  const userId = smoke.profileUserId;
  await client.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 3000) WHERE id=$1`, [userId]);
  await client.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 3000) WHERE id=$1`, [
    gennady.profileUserId,
  ]);
  await api(smoke.cookie, "POST", "/api/age-gate/confirm", { confirmed: true });
  const sinceIso = new Date().toISOString();
  const results = { startedAt: sinceIso, special: {}, kinds: {} };

  const { rows: charts } = await client.query(
    `SELECT id FROM hd_charts WHERE user_id=$1 AND subject_kind='self' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const selfChartId = charts[0].id;

  await client.query(
    `UPDATE async_jobs
     SET status='failed', error_code='smoke_reset', error_message='cleared before three-rerun',
         updated_at=NOW(), next_attempt_at=NULL, worker_id=NULL
     WHERE status IN ('pending','running')
       AND user_id = $1
       AND kind IN ('hd_report','hd_composite_report','pro_premium_report','numerology_reading',
                    'natal_interpretation','natal_forecast','natal_compatibility')`,
    [userId]
  ).catch(() => undefined);

  execSync("bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai", {
    stdio: "inherit",
    shell: "/bin/bash",
  });
  execSync("bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh", {
    stdio: "inherit",
    shell: "/bin/bash",
  });

  // --- 1) KILL ---
  log("=== kill ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  let enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Kill three-rerun",
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
  const killChargesBefore = await countCharges(client, userId, "HD_REPORT", sinceIso);
  execSync("bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh", {
    stdio: "inherit",
    shell: "/bin/bash",
  });
  let orphanRequeued = false;
  let maxAttempt = 0;
  for (let i = 0; i < 48; i++) {
    const row = (
      await client.query(
        `SELECT status, error_code, attempt_count, billing_state FROM async_jobs WHERE id=$1`,
        [killJobId]
      )
    ).rows[0];
    log("kill_poll", row);
    maxAttempt = Math.max(maxAttempt, Number(row.attempt_count) || 0);
    if (row.error_code === "orphan_requeued" || maxAttempt > 1) orphanRequeued = true;
    if (["completed", "failed", "needs_regeneration"].includes(row.status)) break;
    if (row.status === "running" && orphanRequeued) break;
    await sleep(5000);
  }
  const killJob = await waitJob(client, killJobId, "kill");
  const killChargesAfter = await countCharges(client, userId, "HD_REPORT", sinceIso);
  maxAttempt = Math.max(maxAttempt, Number(killJob.attempt_count) || 0);
  if (killJob.error_code === "orphan_requeued" || maxAttempt > 1) orphanRequeued = true;
  const killChargeDelta = killChargesAfter - killChargesBefore;
  results.special.killWorker = {
    ok:
      orphanRequeued &&
      maxAttempt > 1 &&
      killJob.status === "completed" &&
      killChargeDelta === 0,
    orphanRequeued,
    maxAttempt,
    finalStatus: killJob.status,
    chargeDelta: killChargeDelta,
    jobId: killJobId,
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("kill result", results.special.killWorker);

  // --- 2) PROXY ---
  log("=== proxy ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Proxy three-rerun",
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
  execSync(
    [
      "cp /opt/aura-ai/.env.async-jobs /tmp/env.async-jobs.bak",
      "sed -i 's|^OPENROUTER_HTTPS_PROXY=.*|OPENROUTER_HTTPS_PROXY=http://127.0.0.1:1|' /opt/aura-ai/.env.async-jobs",
      "bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh",
    ].join("; "),
    { stdio: "inherit", shell: "/bin/bash" }
  );
  let sawPendingRetry = false;
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
      break;
    }
    if (["failed", "needs_regeneration", "completed"].includes(row.status)) break;
    await sleep(5000);
  }
  execSync(
    "bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai; bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh; grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true",
    { stdio: "inherit", shell: "/bin/bash" }
  );
  const proxyJob = await waitJob(client, proxyJobId, "proxy-resume", 35 * 60_000);
  const proxyChargesAfter = await countCharges(client, userId, "HD_REPORT", sinceIso);
  const { rows: hdRows } = await client.query(
    `SELECT report_text FROM hd_reports WHERE chart_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [selfChartId]
  );
  const quality = hdRows[0]?.report_text ? validateHd(hdRows[0].report_text) : { ok: false };
  results.special.proxyOutage = {
    ok:
      sawPendingRetry &&
      proxyJob.status === "completed" &&
      proxyChargesAfter - proxyChargesBefore === 0 &&
      quality.ok === true,
    sawPendingRetry,
    finalStatus: proxyJob.status,
    chargeDelta: proxyChargesAfter - proxyChargesBefore,
    quality,
    jobId: proxyJobId,
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("proxy result", results.special.proxyOutage);

  // --- 3) PRO ---
  log("=== pro ===");
  const { rows: clients } = await client.query(
    `SELECT id FROM pro.clients WHERE account_id=2 ORDER BY created_at DESC LIMIT 1`
  );
  const clientId = clients[0]?.id;
  if (!clientId) throw new Error("no_pro_client");
  const created = await api(gennady.cookie, "POST", "/api/pro/cases", {
    clientId,
    type: "matrix",
    question: "Smoke pro three-rerun",
  });
  const caseId = created.json?.case?.id;
  if (!caseId) {
    results.kinds.pro_premium_report = { ok: false, create: created };
  } else {
    const input = await api(gennady.cookie, "PATCH", `/api/pro/cases/${caseId}`, {
      action: "input",
      payload: { birthDate: "1988-07-07", birthCity: "Москва" },
    });
    log("pro_input", input.status, input.json?.error);
    enq = await api(gennady.cookie, "PATCH", `/api/pro/cases/${caseId}`, {
      action: "generate",
      idempotencyKey: `smoke-pro-three-${Date.now()}`,
    });
    log("pro enqueue", enq.status, enq.json?.jobId || enq.json);
    if (enq.json?.jobId) {
      const job = await waitJob(client, enq.json.jobId, "pro", 20 * 60_000);
      let workerHit = false;
      try {
        const hit = execSync(
          `grep -E 'claim .*job=${enq.json.jobId}|finish .*job=${enq.json.jobId}' /var/log/aura-ai/async-jobs.log | wc -l`,
          { encoding: "utf8", shell: "/bin/bash" }
        );
        workerHit = Number(hit.trim()) > 0;
      } catch {}
      results.kinds.pro_premium_report = {
        ok: job.status === "completed" && workerHit,
        status: job.status,
        p1: job.status === "completed" && workerHit,
        p2: workerHit,
        p3: job.status === "completed",
        jobId: enq.json.jobId,
        elapsedMs: job.elapsedMs,
      };
    } else {
      results.kinds.pro_premium_report = { ok: false, enqueue: enq };
    }
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  results.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("DONE", results);
  await client.end();
  const fail =
    !results.special.killWorker?.ok ||
    !results.special.proxyOutage?.ok ||
    !results.kinds.pro_premium_report?.ok;
  process.exit(fail ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
