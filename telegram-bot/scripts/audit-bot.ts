/**
 * Offline functional audit of the autonomous Telegram bot.
 * Run: npx tsx scripts/audit-bot.ts
 */
import { migrate } from "../src/db/client.js";
import { ensureCriticalColumns, migrateUp } from "../src/db/migrate-runner.js";
import { getDb } from "../src/db/client.js";
import {
  applyReferral,
  canDrawTriplet,
  confirmAge,
  confirmConsent,
  createGuestSession,
  deleteUserData,
  ensureRefCode,
  getUser,
  setTimezoneOffset,
  upsertUser,
} from "../src/db/repos.js";
import { parseStartPayload } from "../src/domain/attribution.js";
import { validateQuestion } from "../src/domain/question/validate.js";
import { createSessionToken, hashSessionToken } from "../src/domain/session/token.js";
import { CB, NAV, NAV_LABELS, timezoneKeyboard } from "../src/keyboards/index.js";
import { copy } from "../src/copy/ru.js";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function hasCol(table: string, col: string): boolean {
  const cols = getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === col);
}

async function main() {
  migrate();
  console.log("[migrate]", migrateUp());
  ensureCriticalColumns();

  // Schema
  for (const col of [
    "timezone_offset_minutes",
    "timezone_asked_at",
    "voice_mode",
    "ref_code",
    "bonus_spreads",
    "consent_version",
  ]) {
    check(`schema bot_users.${col}`, hasCol("bot_users", col));
  }
  for (const col of ["deck_id", "teaser_seed", "plain_token_prefix", "expired_at"]) {
    check(`schema bot_guest_sessions.${col}`, hasCol("bot_guest_sessions", col));
  }
  for (const t of ["bot_llm_usage", "bot_tts_usage", "bot_events", "bot_flow_state"]) {
    try {
      getDb().prepare(`SELECT 1 FROM ${t} LIMIT 1`).get();
      check(`schema table ${t}`, true);
    } catch (e) {
      check(`schema table ${t}`, false, e instanceof Error ? e.message : String(e));
    }
  }

  // Keyboards / nav
  check("NAV labels registered", NAV_LABELS.size === 6);
  check("timezone keyboard has callbacks", timezoneKeyboard().inline_keyboard.length >= 6);
  check("CB.tz ask", CB.tzPrefix + "ask" === "tz:ask");

  // Copy has no emoji in bodies we care about (spot check)
  check("copy.timezoneSet non-empty", copy.timezoneSet.length > 10);
  check("copy.greeting works", copy.greeting("Тест").includes("Тест"));

  // Attribution
  const a = parseStartPayload("ref_abc123");
  check("parseStartPayload ref", Boolean(a.ref));

  // Question validation
  check("validate chip-like", validateQuestion("Что меняет фокус сейчас?").ok);
  check("validate crisis", !validateQuestion("хочу умереть").ok);
  check("validate crisis phrase", !validateQuestion("не хочу жить больше").ok);
  check("validate medical", !validateQuestion("какое лекарство пить от депрессии").ok);

  // Token
  const tok = createSessionToken();
  check("session token zg_", tok.startsWith("zg_"));
  check("token hash length", hashSessionToken(tok).length === 64);

  // DB user lifecycle (isolated fake id)
  const uid = 9_000_000_001;
  deleteUserData(uid);
  upsertUser({
    telegramUserId: uid,
    chatId: uid,
    username: "audit_user",
    firstName: "Audit",
    languageCode: "ru",
  });
  confirmAge(uid);
  confirmConsent(uid);
  try {
    setTimezoneOffset(uid, 300);
    const u = getUser(uid)!;
    check("setTimezoneOffset persists", u.timezone_offset_minutes === 300 && Boolean(u.timezone_asked_at));
  } catch (e) {
    check("setTimezoneOffset persists", false, e instanceof Error ? e.message : String(e));
  }

  const code = ensureRefCode(uid);
  check("ensureRefCode", Boolean(code && code.length >= 4));

  const invitee = 9_000_000_002;
  deleteUserData(invitee);
  upsertUser({
    telegramUserId: invitee,
    chatId: invitee,
    username: "invitee",
    firstName: "Inv",
    languageCode: "ru",
  });
  applyReferral(invitee, code);
  const inviter = getUser(uid)!;
  check("referral increments", (inviter.referral_count ?? 0) >= 1 || (inviter.bonus_spreads ?? 0) >= 1);

  const u2 = getUser(uid)!;
  check("canDrawTriplet after gates", canDrawTriplet(u2));

  const sessionTok = createSessionToken();
  createGuestSession({
    telegramUserId: uid,
    question: "Аудит вопрос",
    cards: [
      { id: 1, name: "A", reversed: false, position: 0 },
      { id: 2, name: "B", reversed: false, position: 1 },
      { id: 3, name: "C", reversed: true, position: 2 },
    ],
    teaserText: "Тестовый тизер",
    teaserPromptVersion: "audit",
    teaserModel: "audit",
    teaserSeed: "audit",
    tokenHash: hashSessionToken(sessionTok),
    fingerprint: "audit-fp",
    questionSource: "chip",
  });
  check("createGuestSession", true);

  // Nav constants match menu routing expectations
  for (const key of Object.keys(NAV) as Array<keyof typeof NAV>) {
    check(`NAV.${key} has emoji prefix`, /^\p{Emoji}/u.test(NAV[key]));
  }

  deleteUserData(uid);
  deleteUserData(invitee);

  const failed = checks.filter((c) => !c.ok);
  console.log("\n---");
  console.log(`Passed ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.error("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
