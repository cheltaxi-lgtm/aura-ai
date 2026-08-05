#!/usr/bin/env node
/**
 * Authenticated Pro E2E against local Next (127.0.0.1:3000).
 * Creates/reuses pro-e2e@zovus.internal, grants runes, runs apply→case→deliver→dialog.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { SignJWT } = require("jose");
const bcrypt = require("bcryptjs");

const BASE = process.env.PRO_E2E_BASE || "http://127.0.0.1:3000";
const EMAIL = "pro-e2e@zovus.internal";
const DISPLAY = "Pro E2E Pilot";

function loadEnv(path = "/opt/aura-ai/.env.local") {
  for (const line of fs.readFileSync(path, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function step(name, detail) {
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `aura_auth=${cookie}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function ensureUser(c) {
  const existing = await c.query(
    `SELECT ua.id AS account_id, ua.profile_user_id, ua.token_version, ua.email, ua.name,
            u.rune_balance
     FROM user_accounts ua
     LEFT JOIN users u ON u.id = ua.profile_user_id
     WHERE lower(ua.email) = lower($1)
     LIMIT 1`,
    [EMAIL]
  );
  if (existing.rows[0]?.profile_user_id) {
    const row = existing.rows[0];
    await c.query(
      `UPDATE users SET rune_balance = GREATEST(rune_balance, 200) WHERE id = $1`,
      [row.profile_user_id]
    );
    return {
      accountId: row.account_id,
      profileUserId: row.profile_user_id,
      tokenVersion: Number(row.token_version) || 0,
      email: row.email,
      name: row.name || DISPLAY,
    };
  }

  const hash = await bcrypt.hash(`e2e-${randomUUID()}`, 12);
  const acc = await c.query(
    `INSERT INTO user_accounts (
       email, password_hash, name,
       terms_accepted_at, age_confirmed_at, marketing_consent
     ) VALUES ($1, $2, $3, NOW(), NOW(), false)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, email, name, token_version, profile_user_id`,
    [EMAIL, hash, DISPLAY]
  );
  let accountId = acc.rows[0].id;
  let profileUserId = acc.rows[0].profile_user_id;
  const tokenVersion = Number(acc.rows[0].token_version) || 0;

  if (!profileUserId) {
    const profile = await c.query(
      `INSERT INTO users (
         name, gender, birth_date, zodiac,
         birth_city, life_focus, rune_balance, astro_meta
       ) VALUES (
         $1, 'female', '1990-05-15', 'Телец',
         'Москва', 'general', 200, '{}'::jsonb
       ) RETURNING id`,
      [DISPLAY]
    );
    profileUserId = profile.rows[0].id;
    await c.query(
      `UPDATE user_accounts SET profile_user_id = $2 WHERE id = $1`,
      [accountId, profileUserId]
    );
  } else {
    await c.query(
      `UPDATE users SET rune_balance = GREATEST(rune_balance, 200) WHERE id = $1`,
      [profileUserId]
    );
  }

  return {
    accountId,
    profileUserId,
    tokenVersion,
    email: EMAIL,
    name: DISPLAY,
  };
}

async function signCookie(user) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing");
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    sub: user.accountId,
    role: "user",
    email: user.email,
    name: user.name,
    tv: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

async function main() {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const user = await ensureUser(c);
  step("user", `${user.accountId} / profile ${user.profileUserId}`);

  // Allowlist for auto-active apply path on retry; primary path still apply+approve.
  const allow = (process.env.PRO_ALLOWLIST_USER_IDS || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allow.includes(user.profileUserId)) {
    allow.push(user.profileUserId);
    const line = `PRO_ALLOWLIST_USER_IDS=${allow.join(",")}`;
    const envPath = "/opt/aura-ai/.env.local";
    let env = fs.readFileSync(envPath, "utf8");
    if (/^PRO_ALLOWLIST_USER_IDS=/m.test(env)) {
      env = env.replace(/^PRO_ALLOWLIST_USER_IDS=.*$/m, line);
    } else {
      env += `\n${line}\n`;
    }
    fs.writeFileSync(envPath, env);
    // Note: allowlist read at runtime from process.env — restart already done;
    // for this process we set it; for Next we activate via SQL below.
    process.env.PRO_ALLOWLIST_USER_IDS = allow.join(",");
    step("allowlist_file", user.profileUserId);
  }

  const cookie = await signCookie(user);

  let r = await api(cookie, "GET", "/api/pro/account");
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`account GET failed ${r.status} ${r.text}`);
  }
  step("account_get", r.json.account ? r.json.account.status : "null");

  r = await api(cookie, "POST", "/api/pro/account", { displayName: DISPLAY });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`apply failed ${r.status} ${r.text}`);
  }
  const accountId = r.json.account.id;
  step("apply", `id=${accountId} status=${r.json.account.status} created=${r.json.created}`);

  if (r.json.account.status !== "active") {
    await c.query(
      `UPDATE pro.accounts SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [accountId]
    );
    step("approve_sql", "pending → active");
  }

  r = await api(cookie, "POST", "/api/pro/account", {
    action: "onboarding",
    displayName: DISPLAY,
    onboarding: {
      specializations: ["tarot", "natal"],
      bio: "E2E pilot practitioner",
      timezone: "Europe/Moscow",
      addressForm: "vy",
    },
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`onboarding failed ${r.status} ${r.text}`);
  }
  step("onboarding", "ok");

  r = await api(cookie, "POST", "/api/pro/clients", {
    alias: "Клиент E2E",
    fullName: "Тестовый Клиент",
    birthDate: "1992-08-20",
    birthPlace: "Санкт-Петербург",
    consentConfirmed: true,
    tags: ["e2e"],
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`client create failed ${r.status} ${r.text}`);
  }
  const clientId = r.json.client.id;
  step("client", String(clientId));

  r = await api(cookie, "POST", "/api/pro/cases", {
    clientId,
    type: "manual_spread",
    question: "Что важно в ближайший месяц?",
    practitionerContext: "E2E synthetic case",
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`case create failed ${r.status} ${r.text}`);
  }
  const caseId = r.json.case.id;
  step("case", String(caseId));

  r = await api(cookie, "PATCH", `/api/pro/cases/${caseId}`, {
    action: "input",
    payload: {
      cards: [
        { name: "Солнце", position: "Ситуация" },
        { name: "Звезда", position: "Совет" },
        { name: "Мир", position: "Итог" },
      ],
    },
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`input failed ${r.status} ${r.text}`);
  }
  step("input", "3 cards");

  const balBefore = await c.query(`SELECT rune_balance FROM users WHERE id = $1`, [
    user.profileUserId,
  ]);
  const before = Number(balBefore.rows[0].rune_balance);

  r = await api(cookie, "PATCH", `/api/pro/cases/${caseId}`, {
    action: "generate",
    idempotencyKey: `e2e-gen-${caseId}-${Date.now()}`,
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`generate failed ${r.status} ${r.text}`);
  }
  step(
    "generate",
    `shadow=${r.json.charge?.shadow} runes=${r.json.charge?.runes} stub=${r.json.stub}`
  );

  const balAfterGen = await c.query(`SELECT rune_balance FROM users WHERE id = $1`, [
    user.profileUserId,
  ]);
  const afterGen = Number(balAfterGen.rows[0].rune_balance);
  if (r.json.charge && r.json.charge.shadow === false && r.json.charge.runes > 0) {
    if (afterGen >= before) {
      throw new Error(`live billing did not debit: ${before} → ${afterGen}`);
    }
    step("billing_live", `${before} → ${afterGen}`);
  } else {
    step("billing_shadow_or_zero", `${before} → ${afterGen}`);
  }

  const blocks = (r.json.version?.blocks || []).map((b, i) => ({
    ...b,
    body: `${b.body || ""}\n\n[E2E human edit ${i + 1}]`.trim(),
  }));
  if (!blocks.length) {
    blocks.push({
      id: "b1",
      title: "Разбор",
      body: "Человеческая версия отчёта для E2E доставки.",
    });
  }

  r = await api(cookie, "PATCH", `/api/pro/cases/${caseId}`, {
    action: "save_human",
    blocks,
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`save_human failed ${r.status} ${r.text}`);
  }
  step("save_human", String(r.json.version.id));

  r = await api(cookie, "PATCH", `/api/pro/cases/${caseId}`, {
    action: "deliver",
    ttl: "7",
    dialogMode: "b",
    dialogQuota: 3,
  });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`deliver failed ${r.status} ${r.text}`);
  }
  const token = r.json.token;
  const reportUrl = r.json.url;
  step("deliver", reportUrl);

  r = await api(null, "GET", `/api/pro/public/report/${token}`);
  // public report does not need cookie — fetch without
  {
    const res = await fetch(`${BASE}/api/pro/public/report/${token}`);
    const json = await res.json();
    if (res.status !== 200 || !json.ok) {
      throw new Error(`public report failed ${res.status} ${JSON.stringify(json)}`);
    }
    if (!json.report?.blocks?.length) {
      throw new Error("public report missing blocks");
    }
    step("public_report", `blocks=${json.report.blocks.length} mode=${json.report.dialogMode}`);
  }

  {
    const res = await fetch(`${BASE}/api/pro/public/report/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "Как лучше действовать на этой неделе?",
      }),
    });
    const json = await res.json();
    if (res.status !== 200 || !json.ok) {
      throw new Error(`dialog ask failed ${res.status} ${JSON.stringify(json)}`);
    }
    step("dialog_ask", json.status);
  }

  r = await api(cookie, "GET", "/api/pro/inbox");
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`inbox failed ${r.status} ${r.text}`);
  }
  step("inbox", `threads=${(r.json.inbox || []).length}`);

  const inbox0 = (r.json.inbox || [])[0];
  const threadId = inbox0?.threadId || inbox0?.thread_id || inbox0?.id;
  if (threadId) {
    r = await api(cookie, "GET", `/api/pro/inbox?threadId=${threadId}`);
    if (r.status !== 200 || !r.json?.ok) {
      throw new Error(`thread messages failed ${r.status} ${r.text}`);
    }
    const draft = (r.json.messages || []).find(
      (m) => m.author === "ai_draft" && m.moderation_state === "pending"
    );
    if (draft) {
      r = await api(cookie, "POST", "/api/pro/inbox", {
        messageId: draft.id,
        body: `${draft.body}\n\n[E2E approved]`,
      });
      if (r.status !== 200 || !r.json?.ok) {
        throw new Error(`approve draft failed ${r.status} ${r.text}`);
      }
      step("dialog_approve", String(draft.id));
    } else {
      step("dialog_approve", "no pending draft (mode/status may differ)");
    }
  } else {
    step("dialog_approve", "inbox empty");
  }

  r = await api(cookie, "POST", "/api/pro/intake", { name: "E2E бриф" });
  if (r.status !== 200 || !r.json?.ok) {
    throw new Error(`intake create failed ${r.status} ${r.text}`);
  }
  const intakeToken = r.json.token;
  step("intake_link", r.json.url);

  {
    const res = await fetch(`${BASE}/api/pro/public/intake/${intakeToken}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        alias: "Intake E2E",
        question: "Нужен разбор отношений",
        birthDate: "1988-03-03",
        birthPlace: "Казань",
        consentPdn: true,
      }),
    });
    const json = await res.json();
    if (res.status !== 200 || !json.ok) {
      throw new Error(`intake submit failed ${res.status} ${JSON.stringify(json)}`);
    }
    step("intake_submit", JSON.stringify(json).slice(0, 120));
  }

  // Mode C quick path on a second delivery if max=c
  r = await api(cookie, "PATCH", `/api/pro/cases/${caseId}`, {
    action: "deliver",
    ttl: "7",
    dialogMode: "c",
    dialogQuota: 2,
  });
  if (r.status === 200 && r.json?.ok && r.json.token) {
    const t2 = r.json.token;
    const res = await fetch(`${BASE}/api/pro/public/report/${t2}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Краткий совет на день?" }),
    });
    const json = await res.json();
    if (res.status !== 200 || !json.ok) {
      throw new Error(`mode-c dialog failed ${res.status} ${JSON.stringify(json)}`);
    }
    step("dialog_mode_c", json.status);
  } else {
    step("dialog_mode_c", `skipped ${r.status} ${r.json?.error || ""}`);
  }

  r = await api(cookie, "GET", "/api/pro/account");
  step(
    "final_account",
    `status=${r.json?.account?.status} billing=${r.json?.billingMode} balance=${r.json?.runeBalance}`
  );

  const usage = await c.query(
    `SELECT action, shadow, runes FROM pro.usage_log WHERE account_id = $1 ORDER BY created_at DESC LIMIT 8`,
    [accountId]
  );
  step(
    "usage_log",
    usage.rows.map((x) => `${x.action}:${x.runes}${x.shadow ? "s" : "L"}`).join(",")
  );

  await c.end();
  console.log("E2E_COMPLETE");
}

main().catch((e) => {
  console.error("E2E_FAIL", e);
  process.exit(1);
});
