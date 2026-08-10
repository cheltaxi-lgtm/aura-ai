/**
 * Re-run only failed smoke cells: composite, natal×3, kill, proxy.
 * Assumes worker logs claim/finish with job=.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";

const BASE = "http://127.0.0.1:3000";
const OUT = "/tmp/rerun_failed_results.json";
const LOG = "/tmp/rerun_failed.log";

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

function validateHd(text) {
  const tmp = `/tmp/hd_rerun_${randomUUID()}.md`;
  writeFileSync(tmp, text || "");
  const out = execSync(
    `cd /opt/aura-ai && npx tsx -e "import {readFileSync} from 'fs'; import {validateHdReportText} from './src/lib/hd-report-quality/validator.ts'; const q=validateHdReportText(readFileSync('${tmp}','utf8'),{requireFocusAnswer:false}); console.log(JSON.stringify({ok:q.ok,findings:(q.findings||[]).map(f=>f.rule)}))"`,
    { encoding: "utf8", timeout: 60_000, shell: "/bin/bash" }
  );
  return JSON.parse(out.trim().split("\n").pop());
}

async function main() {
  loadEnvLocal();
  writeFileSync(LOG, `rerun start ${new Date().toISOString()}\n`);
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
  const { rows: partners } = await client.query(
    `SELECT id FROM hd_charts WHERE user_id=$1 AND subject_kind='other' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const partnerChartId = partners[0]?.id;

  // --- hd_composite ---
  log("=== hd_composite_report ===");
  await client.query(`DELETE FROM hd_composite_reports WHERE user_id=$1`, [userId]);
  let enq = await api(smoke.cookie, "POST", "/api/human-design/composite-report", {
    baseChartId: selfChartId,
    partnerChartId,
    aiDataUseAcknowledged: true,
    async: true,
    forceRegenerate: true,
  });
  log("enqueue", enq.status, enq.json?.jobId || enq.json);
  if (enq.json?.jobId) {
    const job = await waitJob(client, enq.json.jobId, "composite");
    const { rows: reps } = await client.query(
      `SELECT report_text, transaction_id FROM hd_composite_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const quality = reps[0]?.report_text ? validateHd(reps[0].report_text) : { ok: false };
    const charges = await countCharges(client, userId, "HD_COMPOSITE_REPORT", sinceIso);
    const wh = workerHit(enq.json.jobId);
    results.kinds.hd_composite_report = {
      ok: job.status === "completed" && wh && quality.ok && charges === 1,
      status: job.status,
      p1: job.status === "completed" && wh,
      p2: wh,
      p3: quality.ok,
      p4: charges === 1,
      charges,
      quality,
      elapsedMs: job.elapsedMs,
    };
  } else {
    results.kinds.hd_composite_report = { ok: false, enqueue: enq };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- natal_interpretation ---
  log("=== natal_interpretation ===");
  await client.query(`DELETE FROM natal_report_history WHERE user_id=$1`, [userId]).catch(() => {});
  enq = await api(smoke.cookie, "POST", "/api/natal-chart/interpretation", {
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
    };
  } else {
    results.kinds.natal_interpretation = { ok: false, enqueue: enq };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- natal_forecast ---
  log("=== natal_forecast ===");
  enq = await api(smoke.cookie, "POST", "/api/natal-chart/forecast", {
    tradition: "western",
    horizon: 30,
    aiDataUseAcknowledged: true,
    async: true,
    forceRegenerate: true,
  });
  log("enqueue", enq.status, enq.json?.jobId || enq.json);
  if (enq.json?.jobId) {
    const job = await waitJob(client, enq.json.jobId, "natal_forecast");
    const charges = await countCharges(client, userId, "FORECAST_REPORT", sinceIso);
    const wh = workerHit(enq.json.jobId);
    results.kinds.natal_forecast = {
      ok: job.status === "completed" && wh && charges === 1,
      status: job.status,
      p1: job.status === "completed" && wh,
      p2: wh,
      p3: job.status === "completed",
      p4: charges === 1,
      charges,
      elapsedMs: job.elapsedMs,
    };
  } else {
    results.kinds.natal_forecast = { ok: false, enqueue: enq };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- natal_compatibility ---
  log("=== natal_compatibility ===");
  const created = await api(smoke.cookie, "POST", "/api/natal-chart/compatibility/manual", {
    partnerDataAuthorized: true,
    partnerLabel: "Smoke Partner Rerun",
    partner: {
      birthDate: "1990-05-15",
      birthTime: "14:30",
      birthCity: "Москва",
      timeKnown: true,
    },
  });
  const compatId = created.json?.record?.id || created.json?.id;
  log("compat_create", created.status, compatId);
  enq = compatId
    ? await api(smoke.cookie, "POST", `/api/natal-chart/compatibility/${compatId}/generate`, {
        aiDataUseAcknowledged: true,
        async: true,
      })
    : { status: 0, json: { error: "no_id" } };
  log("enqueue", enq.status, enq.json?.jobId || enq.json);
  if (enq.json?.jobId) {
    const job = await waitJob(client, enq.json.jobId, "natal_compat");
    const charges = await countCharges(client, userId, "SYNASTRY_REPORT", sinceIso);
    const wh = workerHit(enq.json.jobId);
    results.kinds.natal_compatibility = {
      ok: job.status === "completed" && wh && charges === 1,
      status: job.status,
      p1: job.status === "completed" && wh,
      p2: wh,
      p3: job.status === "completed",
      p4: charges === 1,
      charges,
      elapsedMs: job.elapsedMs,
    };
  } else {
    results.kinds.natal_compatibility = { ok: false, enqueue: enq, create: created };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- kill -9 ---
  log("=== kill worker mid-job ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Kill orphan rerun",
  });
  const killJobId = enq.json?.jobId;
  if (!killJobId) throw new Error("no kill job");
  for (let i = 0; i < 90; i++) {
    const st = (await client.query(`SELECT status FROM async_jobs WHERE id=$1`, [killJobId])).rows[0]
      ?.status;
    if (st === "running") break;
    await sleep(2000);
  }
  // wait mid-LLM
  await sleep(45_000);
  const chargesBefore = await countCharges(client, userId, "HD_REPORT", sinceIso);
  execSync(
    "pkill -9 -f 'scripts/run-async-jobs.ts' || true; sleep 2; systemctl reset-failed aura-ai-async-jobs || true; systemctl start aura-ai-async-jobs; sleep 6; systemctl is-active aura-ai-async-jobs; grep -E 'startup orphan|claim .*job=|orphans=' /var/log/aura-ai/async-jobs.log | tail -12 || true",
    { stdio: "inherit", shell: "/bin/bash" }
  );
  let sawPending = false;
  for (let i = 0; i < 36; i++) {
    const row = (
      await client.query(`SELECT status, error_code, billing_state FROM async_jobs WHERE id=$1`, [
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
  results.special.killWorker = {
    ok:
      sawPending &&
      killJob.status === "completed" &&
      chargesAfter - chargesBefore <= 1,
    sawPending,
    finalStatus: killJob.status,
    chargeDelta: chargesAfter - chargesBefore,
    jobId: killJobId,
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // --- proxy mid-job ---
  log("=== proxy mid-job ===");
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
    chartId: selfChartId,
    aiDataUseAcknowledged: true,
    async: true,
    focusQuestion: "Proxy mid-job rerun",
  });
  const proxyJobId = enq.json?.jobId;
  if (!proxyJobId) throw new Error("no proxy job");
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
    "cp /opt/aura-ai/.env.async-jobs /tmp/env.async-jobs.bak; sed -i 's|^OPENROUTER_HTTPS_PROXY=.*|OPENROUTER_HTTPS_PROXY=http://127.0.0.1:1|' /opt/aura-ai/.env.async-jobs; systemctl restart aura-ai-async-jobs; sleep 5",
    { stdio: "inherit", shell: "/bin/bash" }
  );
  let sawPendingRetry = false;
  let sawCircuit = false;
  for (let i = 0; i < 48; i++) {
    const row = (
      await client.query(
        `SELECT status, next_attempt_at, attempt_count, billing_state, error_code FROM async_jobs WHERE id=$1`,
        [proxyJobId]
      )
    ).rows[0];
    log("proxy_poll", row);
    if (row.status === "pending" && row.next_attempt_at) sawPendingRetry = true;
    try {
      const cb = execSync(
        `grep -E 'circuit|paused|OpenRouter UNAVAILABLE' /var/log/aura-ai/async-jobs.log | tail -3`,
        { encoding: "utf8", shell: "/bin/bash" }
      );
      if (/UNAVAILABLE|circuit|paused/i.test(cb)) sawCircuit = true;
    } catch {}
    if (sawPendingRetry) break;
    if (["failed", "needs_regeneration", "completed"].includes(row.status)) break;
    await sleep(5000);
  }
  execSync(
    "bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai; systemctl restart aura-ai-async-jobs; sleep 4; grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true",
    { stdio: "inherit", shell: "/bin/bash" }
  );
  const proxyJob = await waitJob(client, proxyJobId, "proxy-resume", 35 * 60_000);
  const proxyChargesAfter = await countCharges(client, userId, "HD_REPORT", sinceIso);
  results.special.proxyOutage = {
    ok:
      sawPendingRetry &&
      proxyJob.status === "completed" &&
      proxyChargesAfter - proxyChargesBefore === 0,
    sawPendingRetry,
    sawCircuit,
    finalStatus: proxyJob.status,
    chargeDelta: proxyChargesAfter - proxyChargesBefore,
    jobId: proxyJobId,
  };

  results.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("DONE", OUT, results);
  await client.end();
  const fail =
    !results.kinds.hd_composite_report?.ok ||
    !results.kinds.natal_interpretation?.ok ||
    !results.kinds.natal_forecast?.ok ||
    !results.kinds.natal_compatibility?.ok ||
    !results.special.killWorker?.ok ||
    !results.special.proxyOutage?.ok;
  process.exit(fail ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
