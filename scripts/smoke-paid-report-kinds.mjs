/**
 * Paid-report smoke: 7 kinds + kill-orphan + proxy mid-job.
 * Do NOT restart the worker during the kind loop (invalidates the run).
 *
 *   cd /opt/aura-ai && node scripts/smoke-paid-report-kinds.mjs
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { SignJWT } from "jose";
import pg from "pg";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";
const OUT = process.env.SMOKE_OUT || "/tmp/phase_b_smoke_results.json";
const LOG = process.env.SMOKE_LOG || "/tmp/phase_b_smoke.log";

function loadEnvLocal() {
  const raw = readFileSync("/opt/aura-ai/.env.local", "utf8");
  for (const line of raw.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v.replace(/\\n/g, "\n");
  }
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

async function mintCookie(client, accountId) {
  const { rows } = await client.query(
    `SELECT id, email, name, profile_user_id, token_version FROM user_accounts WHERE id=$1`,
    [accountId]
  );
  const acc = rows[0];
  if (!acc) throw new Error(`account missing ${accountId}`);
  const token = await new SignJWT({
    sub: acc.id,
    role: "user",
    email: acc.email,
    name: acc.name || "Smoke",
    tv: Number(acc.token_version) || 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("6h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { cookie: `aura_auth=${token}`, profileUserId: acc.profile_user_id, email: acc.email };
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJob(client, jobId, { timeoutMs = 25 * 60_000, label = "" } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { rows } = await client.query(
      `SELECT id, kind, status, billing_state, attempt_count, error_code,
              left(coalesce(error_message,''),160) AS error_message,
              queue_wait_ms, generation_ms, charge_transaction_id, next_attempt_at
       FROM async_jobs WHERE id=$1`,
      [jobId]
    );
    const row = rows[0];
    if (!row) throw new Error(`job missing ${jobId}`);
    log(`poll ${label || row.kind}`, {
      status: row.status,
      attempt: row.attempt_count,
      err: row.error_code || row.error_message || null,
      genMs: row.generation_ms,
      next: row.next_attempt_at,
    });
    if (["completed", "failed", "needs_regeneration"].includes(row.status)) {
      return { ...row, elapsedMs: Date.now() - t0 };
    }
    await sleep(10_000);
  }
  throw new Error(`timeout waiting job ${jobId}`);
}

async function countActionCharges(client, userId, actionType, sinceIso) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n, coalesce(sum(amount),0)::int AS sum_amount
     FROM rune_transactions
     WHERE user_id=$1 AND created_at >= $2::timestamptz
       AND action_type=$3 AND type='spend'`,
    [userId, sinceIso, actionType]
  );
  return rows[0];
}

async function ensureHdSelfChart(cookie, client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM hd_charts WHERE user_id=$1 AND subject_kind='self' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (rows[0]) return rows[0].id;
  const r = await api(cookie, "POST", "/api/human-design/chart", {
    birthDate: "1988-07-07",
    birthTime: "12:00",
    timezone: "Europe/Moscow",
    placeName: "Moscow, Russia",
    latitude: 55.7558,
    longitude: 37.6173,
    subjectKind: "self",
  });
  if (r.status >= 400) throw new Error(`self chart ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.chart?.id || r.json.id;
}

async function ensureHdPartnerChart(cookie, client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM hd_charts WHERE user_id=$1 AND subject_kind='other' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (rows[0]) return rows[0].id;
  const r = await api(cookie, "POST", "/api/human-design/chart", {
    birthDate: "1990-05-15",
    birthTime: "14:30",
    timezone: "Europe/Moscow",
    placeName: "Moscow, Russia",
    latitude: 55.7558,
    longitude: 37.6173,
    subjectKind: "other",
    subjectName: "Smoke Partner",
  });
  if (r.status >= 400) throw new Error(`partner chart ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.chart?.id || r.json.id;
}

function validateHdViaTsx(text) {
  const tmp = `/tmp/hd_smoke_${randomUUID()}.md`;
  writeFileSync(tmp, text || "");
  try {
    const out = execSync(
      `cd /opt/aura-ai && npx tsx -e "import { readFileSync } from 'fs'; import { validateHdReportText } from './src/lib/hd-report-quality/validator.ts'; const t=readFileSync('${tmp}','utf8'); const q=validateHdReportText(t,{requireFocusAnswer:false}); console.log(JSON.stringify({ok:q.ok,findings:(q.findings||[]).map(f=>f.rule)}))"`,
      { encoding: "utf8", timeout: 60_000 }
    );
    return JSON.parse(out.trim().split("\n").pop());
  } catch (e) {
    return { ok: false, findings: ["validator_error"], error: String(e.stdout || e.message || e) };
  }
}

async function main() {
  loadEnvLocal();
  writeFileSync(LOG, `phase_b_smoke start ${new Date().toISOString()}\n`);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const smokeAccountId = "e6a7f708-4bd6-46f1-a3c7-0b34ceb803d2";
  const gennadyAccountId = "b5dbca4c-114b-4c62-9546-011ad309e5bb";

  const smoke = await mintCookie(client, smokeAccountId);
  const gennady = await mintCookie(client, gennadyAccountId);
  const profileUserId = smoke.profileUserId;

  const me = await api(smoke.cookie, "GET", "/api/auth/me");
  log("auth/me", { status: me.status, body: me.json });
  if (me.status >= 400) throw new Error("auth failed");

  await api(smoke.cookie, "POST", "/api/age-gate/confirm", { confirmed: true });

  await client.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 2500) WHERE id=$1`, [
    profileUserId,
  ]);
  // Gennady for pro only — leave balance, pro uses separate credits

  const sinceIso = new Date().toISOString();
  const results = {
    startedAt: sinceIso,
    profileUserId,
    kinds: {},
    special: {},
    points: {},
  };

  const selfChartId = await ensureHdSelfChart(smoke.cookie, client, profileUserId);
  const partnerChartId = await ensureHdPartnerChart(smoke.cookie, client, profileUserId);
  await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
  await client.query(
    `DELETE FROM hd_composite_reports WHERE user_id=$1 AND base_chart_id=$2 AND partner_chart_id=$3`,
    [profileUserId, selfChartId, partnerChartId]
  );
  log("fixtures", { selfChartId, partnerChartId, balance: (await client.query(`SELECT rune_balance FROM users WHERE id=$1`, [profileUserId])).rows[0] });

  const specs = [
    {
      kind: "hd_report",
      action: "HD_REPORT",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: (c) =>
        api(c, "POST", "/api/human-design/report", {
          chartId: selfChartId,
          aiDataUseAcknowledged: true,
          async: true,
          focusQuestion: "Что важно в ближайший год?",
        }),
      validate: async () => {
        const { rows } = await client.query(
          `SELECT status, report_text, transaction_id FROM hd_reports WHERE chart_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [selfChartId]
        );
        const rep = rows[0];
        const quality = rep?.report_text ? validateHdViaTsx(rep.report_text) : { ok: false, findings: ["empty"] };
        return {
          reportStatus: rep?.status,
          len: (rep?.report_text || "").length,
          charged: !!rep?.transaction_id,
          quality,
        };
      },
    },
    {
      kind: "hd_composite_report",
      action: "HD_COMPOSITE_REPORT",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: async (c) => {
        await client.query(`DELETE FROM hd_composite_reports WHERE user_id=$1`, [
          profileUserId,
        ]);
        return api(c, "POST", "/api/human-design/composite-report", {
          baseChartId: selfChartId,
          partnerChartId,
          aiDataUseAcknowledged: true,
          async: true,
          forceRegenerate: true,
        });
      },
      validate: async () => {
        const { rows } = await client.query(
          `SELECT status, length(coalesce(report_text,'')) AS len, transaction_id IS NOT NULL AS charged, left(coalesce(report_text,''),20) AS head
           FROM hd_composite_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [profileUserId]
        );
        const rep = rows[0];
        let quality = null;
        if (rep && Number(rep.len) > 500) {
          const full = await client.query(
            `SELECT report_text FROM hd_composite_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [profileUserId]
          );
          quality = validateHdViaTsx(full.rows[0]?.report_text || "");
        }
        return { ...rep, quality };
      },
    },
    {
      kind: "numerology_reading",
      action: "NUMEROLOGY_SESSION",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: (c) =>
        api(c, "POST", "/api/reading", {
          characterId: "numerolog",
          async: true,
          birthDate: "1988-07-07",
          numerologToolId: "destiny_matrix",
          forceRegenerate: true,
          aiDataUseAcknowledged: true,
        }),
      validate: async (job) => ({ jobStatus: job.status, billing: job.billing_state, resultKeys: Object.keys(job) }),
    },
    {
      kind: "natal_interpretation",
      action: "NATAL_READING",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: async (c) =>
        api(c, "POST", "/api/natal-chart/interpretation", {
          tradition: "western",
          aiDataUseAcknowledged: true,
          async: true,
          forceRegenerate: true,
        }),
      validate: async (job) => ({ jobStatus: job.status, billing: job.billing_state }),
    },
    {
      kind: "natal_forecast",
      action: "FORECAST_REPORT",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: async (c) => {
        await client.query(
          `DELETE FROM natal_report_history WHERE user_id=$1 AND report_type='forecast'`,
          [profileUserId]
        ).catch(() => undefined);
        return api(c, "POST", "/api/natal-chart/forecast", {
          tradition: "western",
          horizon: 30,
          aiDataUseAcknowledged: true,
          async: true,
          forceRegenerate: true,
        });
      },
      validate: async (job) => ({ jobStatus: job.status, billing: job.billing_state }),
    },
    {
      kind: "natal_compatibility",
      action: "SYNASTRY_REPORT",
      cookie: smoke.cookie,
      userId: profileUserId,
      enqueue: async (c) => {
        // Fixture must match parseManualPartnerInput (birthCity + timeKnown).
        const created = await api(c, "POST", "/api/natal-chart/compatibility/manual", {
          partnerDataAuthorized: true,
          partnerLabel: "Smoke Partner",
          partner: {
            birthDate: "1990-05-15",
            birthTime: "14:30",
            birthCity: "Москва",
            timeKnown: true,
          },
        });
        log("compat_create", { status: created.status, json: created.json });
        const id =
          created.json?.record?.id ||
          created.json?.id ||
          created.json?.report?.id ||
          created.json?.compatibilityId ||
          created.json?.compatibility?.id;
        if (!id) return { ...created, _skipJob: true };
        return api(c, "POST", `/api/natal-chart/compatibility/${id}/generate`, {
          aiDataUseAcknowledged: true,
          async: true,
        });
      },
      validate: async (job) => ({ jobStatus: job.status, billing: job.billing_state }),
    },
    {
      kind: "pro_premium_report",
      action: null,
      cookie: gennady.cookie,
      userId: gennady.profileUserId,
      enqueue: async (c) => {
        // Worker-only /api/pro/jobs/premium-report returns 401 for cookies.
        // Enqueue via practitioner case generate (session auth).
        const { rows: clients } = await client.query(
          `SELECT id FROM pro.clients WHERE account_id=2 ORDER BY created_at DESC LIMIT 1`
        );
        const clientId = clients[0]?.id;
        if (!clientId) {
          return { status: 0, json: { error: "no_pro_client" }, _skipJob: true };
        }
        const created = await api(c, "POST", "/api/pro/cases", {
          clientId,
          type: "matrix",
          question: "Smoke pro premium matrix",
        });
        const caseId = created.json?.case?.id;
        if (!caseId) return { ...created, _skipJob: true };
        const input = await api(c, "PATCH", `/api/pro/cases/${caseId}`, {
          action: "input",
          payload: { birthDate: "1988-07-07", birthCity: "Москва" },
        });
        log("pro_input", { status: input.status, error: input.json?.error });
        if (input.status >= 400) return { ...input, _skipJob: true };
        const gen = await api(c, "PATCH", `/api/pro/cases/${caseId}`, {
          action: "generate",
          idempotencyKey: `smoke-pro-${Date.now()}`,
        });
        log("pro_generate", { status: gen.status, jobId: gen.json?.jobId, error: gen.json?.error });
        return gen;
      },
      validate: async (job) => ({ jobStatus: job.status, billing: job.billing_state }),
    },
  ];

  for (const spec of specs) {
    log(`=== ${spec.kind} ===`);
    const enq = await spec.enqueue(spec.cookie);
    log("enqueue", { status: enq.status, json: enq.json });
    if (enq._skipJob || !enq.json?.jobId) {
      results.kinds[spec.kind] = {
        p1_worker_path: false,
        ok: false,
        enqueueStatus: enq.status,
        enqueue: enq.json,
      };
      writeFileSync(OUT, JSON.stringify(results, null, 2));
      continue;
    }
    const jobId = enq.json.jobId;
    let job;
    try {
      job = await waitJob(client, jobId, { label: spec.kind });
    } catch (e) {
      results.kinds[spec.kind] = { ok: false, jobId, error: String(e) };
      writeFileSync(OUT, JSON.stringify(results, null, 2));
      continue;
    }
    const validation = await spec.validate(job).catch((e) => ({ error: String(e) }));
    const charges = spec.action
      ? await countActionCharges(client, spec.userId, spec.action, sinceIso)
      : null;

    // LLM placement: worker must log claim/finish with job id (in-process path).
    let workerLogHit = false;
    try {
      const hit = execSync(
        `grep -E 'claim .*job=${jobId}|finish .*job=${jobId}' /var/log/aura-ai/async-jobs.log | wc -l`,
        { encoding: "utf8", shell: "/bin/bash" }
      );
      workerLogHit = Number(hit.trim()) > 0;
    } catch {
      workerLogHit = false;
    }

    const qualityOk =
      spec.kind === "hd_report" || spec.kind === "hd_composite_report"
        ? Boolean(validation?.quality?.ok)
        : job.status === "completed";

    const singleChargeOk = charges ? charges.n === 1 : true;
    results.kinds[spec.kind] = {
      ok:
        job.status === "completed" &&
        workerLogHit &&
        qualityOk &&
        singleChargeOk,
      jobId,
      status: job.status,
      billing_state: job.billing_state,
      attempt_count: job.attempt_count,
      generation_ms: job.generation_ms,
      queue_wait_ms: job.queue_wait_ms,
      elapsedMs: job.elapsedMs,
      charge_transaction_id: job.charge_transaction_id,
      p1_completed_via_worker: job.status === "completed" && workerLogHit,
      p2_worker_log_hit: workerLogHit,
      p3_validator: qualityOk,
      p4_single_charge: charges ? charges.n === 1 : null,
      charges,
      validation,
    };
    writeFileSync(OUT, JSON.stringify(results, null, 2));
  }

  // ---- Point 5: kill worker mid HD ----
  log("=== kill worker mid-job ===");
  try {
    await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
    const enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
      chartId: selfChartId,
      aiDataUseAcknowledged: true,
      async: true,
      focusQuestion: "Kill worker smoke",
    });
    const jobId = enq.json?.jobId;
    if (!jobId) throw new Error("no kill job");
    for (let i = 0; i < 60; i++) {
      const st = (await client.query(`SELECT status FROM async_jobs WHERE id=$1`, [jobId])).rows[0]
        ?.status;
      if (st === "running") break;
      await sleep(2000);
    }
    const chargesBefore = await countActionCharges(client, profileUserId, "HD_REPORT", sinceIso);
    execSync("bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh", {
      stdio: "inherit",
      shell: "/bin/bash",
    });
    // Success = orphan reclaim (error_code / attempt>1) + single charge — not poll-caught pending.
    let orphanRequeued = false;
    let maxAttempt = 0;
    for (let i = 0; i < 36; i++) {
      const row = (
        await client.query(
          `SELECT status, worker_id, error_code, billing_state, attempt_count FROM async_jobs WHERE id=$1`,
          [jobId]
        )
      ).rows[0];
      log("kill_poll", row);
      maxAttempt = Math.max(maxAttempt, Number(row.attempt_count) || 0);
      if (row.error_code === "orphan_requeued" || maxAttempt > 1) orphanRequeued = true;
      if (["completed", "failed", "needs_regeneration"].includes(row.status)) break;
      if (row.status === "running" && orphanRequeued) break;
      await sleep(5000);
    }
    const job = await waitJob(client, jobId, { label: "kill-orphan", timeoutMs: 25 * 60_000 });
    const chargesAfter = await countActionCharges(client, profileUserId, "HD_REPORT", sinceIso);
    const chargeDelta = chargesAfter.n - chargesBefore.n;
    maxAttempt = Math.max(maxAttempt, Number(job.attempt_count) || 0);
    if (job.error_code === "orphan_requeued" || maxAttempt > 1) orphanRequeued = true;
    results.special.killWorker = {
      jobId,
      orphanRequeued,
      maxAttempt,
      finalStatus: job.status,
      chargesBefore: chargesBefore.n,
      chargesAfter: chargesAfter.n,
      chargeDelta,
      ok:
        orphanRequeued &&
        maxAttempt > 1 &&
        job.status === "completed" &&
        chargeDelta === 0,
    };
  } catch (e) {
    results.special.killWorker = { ok: false, error: String(e) };
  }
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  // ---- Point 6: proxy outage mid long-running LLM job (HD, not a short/cached natal) ----
  log("=== proxy outage mid-job (hd_report) ===");
  try {
    await client.query(`DELETE FROM hd_reports WHERE chart_id=$1`, [selfChartId]);
    const enq = await api(smoke.cookie, "POST", "/api/human-design/report", {
      chartId: selfChartId,
      aiDataUseAcknowledged: true,
      async: true,
      focusQuestion: "Proxy mid-job smoke — long LLM",
    });
    const jobId = enq.json?.jobId;
    if (!jobId) throw new Error("no proxy job " + JSON.stringify(enq.json));
    // Wait until the job is running, then stay in LLM long enough that restart interrupts a call.
    let runningSince = 0;
    for (let i = 0; i < 90; i++) {
      const st = (await client.query(`SELECT status FROM async_jobs WHERE id=$1`, [jobId])).rows[0]
        ?.status;
      if (st === "running") {
        if (!runningSince) runningSince = Date.now();
        if (Date.now() - runningSince >= 45_000) break;
      }
      if (["completed", "failed", "needs_regeneration"].includes(st)) {
        throw new Error(`proxy job finished too early: ${st}`);
      }
      await sleep(2000);
    }
    const chargesBefore = await countActionCharges(client, profileUserId, "HD_REPORT", sinceIso);
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
          `SELECT status, next_attempt_at, attempt_count, billing_state, error_code,
                  left(coalesce(error_message,''),120) AS error_message
           FROM async_jobs WHERE id=$1`,
          [jobId]
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
    const job = await waitJob(client, jobId, { label: "proxy-resume", timeoutMs: 30 * 60_000 });
    const chargesAfter = await countActionCharges(client, profileUserId, "HD_REPORT", sinceIso);
    const { rows: hdRows } = await client.query(
      `SELECT report_text FROM hd_reports WHERE chart_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [selfChartId]
    );
    let quality = { ok: false };
    if (hdRows[0]?.report_text) {
      const tmp = `/tmp/hd_proxy_${jobId}.md`;
      writeFileSync(tmp, hdRows[0].report_text);
      const out = execSync(
        `cd /opt/aura-ai && npx tsx -e "import {readFileSync} from 'fs'; import {validateHdReportText} from './src/lib/hd-report-quality/validator.ts'; const q=validateHdReportText(readFileSync('${tmp}','utf8'),{requireFocusAnswer:false}); console.log(JSON.stringify({ok:q.ok,findings:(q.findings||[]).map(f=>f.rule)}))"`,
        { encoding: "utf8", timeout: 60_000, shell: "/bin/bash" }
      );
      quality = JSON.parse(out.trim().split("\n").pop());
    }
    results.special.proxyOutage = {
      jobId,
      sawPendingRetry,
      finalStatus: job.status,
      attempt_count: job.attempt_count,
      chargesBefore: chargesBefore.n,
      chargesAfter: chargesAfter.n,
      chargeDelta: chargesAfter.n - chargesBefore.n,
      quality,
      ok:
        sawPendingRetry &&
        job.status === "completed" &&
        chargesAfter.n - chargesBefore.n === 0 &&
        quality.ok === true,
    };
  } catch (e) {
    try {
      execSync("bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai; systemctl restart aura-ai-async-jobs", {
        stdio: "inherit",
      });
    } catch {}
    results.special.proxyOutage = { ok: false, error: String(e) };
  }

  // Web vs worker LLM: scan logs for report job processing
  try {
    const workerOpenRouter = execSync(
      `grep -c 'OpenRouter OK\\|in-process\\|runReportJob\\|priority=report' /var/log/aura-ai/async-jobs.log || true`,
      { encoding: "utf8" }
    ).trim();
    results.llmPlacement = { workerLogSignals: Number(workerOpenRouter) || 0 };
  } catch {
    results.llmPlacement = { workerLogSignals: null };
  }

  results.charges = (
    await client.query(
      `SELECT id, action_type, amount, type, created_at FROM rune_transactions
       WHERE user_id=$1 AND created_at >= $2::timestamptz ORDER BY created_at`,
      [profileUserId, sinceIso]
    )
  ).rows;
  results.balanceEnd = (
    await client.query(`SELECT rune_balance FROM users WHERE id=$1`, [profileUserId])
  ).rows[0]?.rune_balance;
  results.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  log("DONE", OUT);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  try {
    execSync("bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai; systemctl restart aura-ai-async-jobs");
  } catch {}
  process.exit(1);
});
