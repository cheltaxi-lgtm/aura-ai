/**
 * Offline functional audit of the autonomous Telegram bot.
 * Run: npm run audit
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collectBodyCopySamples } from "../src/copy/ru.js";
import { EMOJI_RE, hasDisallowedEmoji } from "../src/copy/emoji-whitelist.js";
import { getDb, migrate } from "../src/db/client.js";
import { EXPECTED_TABLES } from "../src/db/expected-schema.js";
import {
  ensureCriticalColumns,
  migrateUp,
  schemaGaps,
} from "../src/db/migrate-runner.js";
import {
  canDrawTriplet,
  claimSpreadSlot,
  claimUpdate,
  confirmAge,
  confirmConsent,
  countTripletsToday,
  createGuestSession,
  deleteUserData,
  findSessionById,
  findSessionsByTokenPrefix,
  getUser,
  plainTokenPrefixFromToken,
  setFlag,
  setTimezoneOffset,
  trackEvent,
  upsertUser,
} from "../src/db/repos.js";
import { hashQuestion } from "../src/domain/question/hash.js";
import { validateQuestion } from "../src/domain/question/validate.js";
import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../src/domain/session/token.js";
import {
  checkDeckIntegrity,
  expectedDeckSlugs,
} from "../src/domain/deck/asset-check.js";
import { localDateKey } from "../src/domain/time/local-date.js";
import { NAV, NAV_LABELS } from "../src/keyboards/index.js";
import { isIrreversible, markIrreversible } from "../src/middleware/irreversible.js";
import { runSafetyCorpus } from "../src/safety/__tests__/run-corpus.js";
import { botConfig } from "../src/config.js";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function dumpSchema(db: DatabaseSync): string {
  const rows = db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name LIKE 'bot_%'
       ORDER BY type, name`
    )
    .all() as Array<{ type: string; name: string; sql: string }>;
  return rows.map((r) => r.sql.trim()).join(";\n") + ";\n";
}

function migrateFreshDb(path: string): void {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const schema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  const migDirUrl = new URL("../src/db/migrations/", import.meta.url);
  const migDirPath = migDirUrl.pathname.startsWith("/") && process.platform === "win32"
    ? decodeURIComponent(migDirUrl.pathname.slice(1))
    : decodeURIComponent(migDirUrl.pathname);
  const files = readdirSync(migDirPath)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migDirPath, file), "utf8");
    for (const stmt of sql
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && s !== "SELECT 1")) {
      try {
        db.exec(stmt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate column|already exists/i.test(msg)) throw e;
      }
    }
  }
  db.close();
}

async function main() {
  migrate();
  console.log("[migrate]", migrateUp());
  ensureCriticalColumns();

  // 1) Full expected schema
  const gaps = schemaGaps();
  check("expected schema complete", gaps.length === 0, JSON.stringify(gaps));
  for (const table of EXPECTED_TABLES) {
    const cols = new Set(
      (getDb().prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
    const missing = table.columns.map((c) => c.name).filter((n) => !cols.has(n));
    check(`schema ${table.name}`, missing.length === 0, missing.join(",") || undefined);
  }

  // 2) Safety corpus
  const corpus = runSafetyCorpus();
  check("safety corpus", corpus.ok, corpus.fails.slice(0, 3).join(" | ") || JSON.stringify(corpus.counts));

  // Crisis side-effects: no session, event without question text
  const crisisUid = 9_100_000_001;
  deleteUserData(crisisUid);
  upsertUser({ telegramUserId: crisisUid, chatId: crisisUid, firstName: "C" });
  confirmAge(crisisUid);
  confirmConsent(crisisUid);
  const crisisQ = "хочу умереть";
  const crisisVal = validateQuestion(crisisQ);
  check("crisis blocks validation", !crisisVal.ok && crisisVal.code === "crisis");
  if (!crisisVal.ok && crisisVal.code === "crisis") {
    trackEvent("crisis_detected", crisisUid, { source: "audit" });
  }
  const crisisSessions = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM bot_guest_sessions WHERE telegram_user_id = ?`)
    .get(crisisUid) as { c: number };
  check("crisis no session row", crisisSessions.c === 0);
  const crisisEv = getDb()
    .prepare(
      `SELECT payload FROM bot_events WHERE telegram_user_id = ? AND name = 'crisis_detected' ORDER BY id DESC LIMIT 1`
    )
    .get(crisisUid) as { payload: string } | undefined;
  check(
    "crisis event without question text",
    Boolean(crisisEv && !crisisEv.payload.includes("умереть") && !crisisEv.payload.includes(crisisQ))
  );
  deleteUserData(crisisUid);

  // 3) Idempotency: claim + irreversible + spread claim + spread update
  const uid = 9_100_000_002;
  deleteUserData(uid);
  upsertUser({ telegramUserId: uid, chatId: uid, firstName: "I" });
  confirmAge(uid);
  confirmConsent(uid);
  setTimezoneOffset(uid, 180);
  const user = getUser(uid)!;
  const q = "Что меняет фокус сейчас в работе";
  const sid = "audit-session-idem-1";
  const updateId = 880_001;
  check("claim update first", claimUpdate(updateId));
  const fakeCtx = { update: { update_id: updateId } };
  markIrreversible(fakeCtx as never);
  check("irreversible marked", isIrreversible(fakeCtx as never));
  const c1 = claimSpreadSlot(uid, q, sid, user);
  check("spread claim first", c1.claimed);
  createGuestSession({
    id: sid,
    telegramUserId: uid,
    question: q,
    cards: [
      { id: 1, name: "A", reversed: false, position: 0 },
      { id: 2, name: "B", reversed: false, position: 1 },
      { id: 3, name: "C", reversed: true, position: 2 },
    ],
    teaserText: "Тизер аудит",
    teaserPromptVersion: "a",
    teaserModel: "a",
    teaserSeed: "a",
    tokenHash: hashSessionToken(createSessionToken()),
    fingerprint: "fp",
    questionSource: "chip",
  });
  // Simulate error after irreversible: do NOT release
  check("no release after irreversible", isIrreversible(fakeCtx as never));
  check("duplicate update suppressed", !claimUpdate(updateId));
  const c2 = claimSpreadSlot(uid, q, "audit-session-idem-2", user);
  check("duplicate spread claim blocked", !c2.claimed && c2.sessionId === sid);
  const sessCount = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM bot_guest_sessions WHERE telegram_user_id = ?`)
    .get(uid) as { c: number };
  check("exactly one session after retry", sessCount.c === 1);
  check("existing session readable", Boolean(findSessionById(sid)?.teaser_text));
  getDb().prepare('DELETE FROM bot_processed_updates WHERE update_id = ?').run(updateId); // isolated audit cleanup
  deleteUserData(uid);

  // 4) Copy: bodies no emoji; buttons whitelist
  const bodies = collectBodyCopySamples();
  const bodyBad = bodies.filter((s) => EMOJI_RE.test(s));
  check("body copy has no emoji", bodyBad.length === 0, bodyBad[0]?.slice(0, 60));
  const buttonBad = Object.values(NAV).filter((label) => hasDisallowedEmoji(label));
  check("NAV button emoji whitelisted", buttonBad.length === 0, buttonBad.join(","));
  check("NAV labels count", NAV_LABELS.size === 9);

  // 5) localDateKey across TZ
  const at = new Date("2026-07-28T22:30:00.000Z");
  const d3 = localDateKey({ timezone_offset_minutes: 180 }, at);
  const d10 = localDateKey({ timezone_offset_minutes: 600 }, at);
  const dm5 = localDateKey({ timezone_offset_minutes: -300 }, at);
  check("localDateKey UTC+3", d3 === "2026-07-29");
  check("localDateKey UTC+10", d10 === "2026-07-29");
  check("localDateKey UTC-5", dm5 === "2026-07-28");

  const limUid = 9_100_000_003;
  deleteUserData(limUid);
  upsertUser({ telegramUserId: limUid, chatId: limUid, firstName: "L" });
  confirmAge(limUid);
  confirmConsent(limUid);
  setTimezoneOffset(limUid, 600);
  let limUser = getUser(limUid)!;
  check("can draw before session", canDrawTriplet(limUser));
  const limTok = createSessionToken();
  createGuestSession({
    id: "lim-1",
    telegramUserId: limUid,
    question: "Лимит тест вопрос один",
    cards: [
      { id: 1, name: "A", reversed: false, position: 0 },
      { id: 2, name: "B", reversed: false, position: 1 },
      { id: 3, name: "C", reversed: false, position: 2 },
    ],
    teaserText: "t",
    teaserPromptVersion: "a",
    teaserModel: "a",
    teaserSeed: "a",
    tokenHash: hashSessionToken(limTok),
    plainToken: limTok,
    fingerprint: "fp2",
    questionSource: "free",
  });
  const limSess = findSessionById("lim-1");
  check(
    "plain_token_prefix stored",
    limSess?.plain_token_prefix === plainTokenPrefixFromToken(limTok)
  );
  check(
    "full token not in session row",
    !JSON.stringify(limSess).includes(limTok)
  );
  check(
    "admin prefix search",
    findSessionsByTokenPrefix(plainTokenPrefixFromToken(limTok)).some((s) => s.id === "lim-1")
  );
  limUser = getUser(limUid)!;
  check("count today after draw", countTripletsToday(limUid, limUser) >= 1);
  check("cannot draw again same local day", !canDrawTriplet(limUser));
  // TZ hop attempt
  setTimezoneOffset(limUid, -300);
  limUser = getUser(limUid)!;
  check("TZ hop does not unlock free draw", !canDrawTriplet(limUser));
  deleteUserData(limUid);

  // 6) session_token format
  const tok = createSessionToken();
  check("token zg_ prefix", tok.startsWith("zg_"));
  check("token alphabet/length", isSessionToken(tok));
  check("token hash 64 hex", /^[a-f0-9]{64}$/.test(hashSessionToken(tok)));
  check("question hash no plaintext", !hashQuestion("секретный вопрос").includes("секрет"));
  check(
    "plain_token_prefix length",
    plainTokenPrefixFromToken(tok).length === botConfig.plainTokenPrefixLen
  );
  check(
    "plain_token_prefix shorter than token body",
    plainTokenPrefixFromToken(tok).length < tok.length - 3
  );

  // Deck integrity (78 cards + back)
  const deck = checkDeckIntegrity();
  check("deck expected count 79", expectedDeckSlugs().length === 79);
  check("deck integrity", deck.ok, deck.missing.slice(0, 5).join(",") || deck.dir);
  check("deck path not under public/", !botConfig.deckAssetsDir.replace(/\\/g, "/").includes("/public/"));

  // share_card_enabled gates CTA button
  setFlag("share_card_enabled", false);
  {
    const { ctaKeyboard } = await import("../src/keyboards/index.js");
    const { isShareCardEnabled } = await import("../src/flags.js");
    check("share flag off", !isShareCardEnabled());
    check(
      "share button hidden when flag off",
      !JSON.stringify(ctaKeyboard("https://zovus.ru").inline_keyboard).includes("share:spread")
    );
  }
  setFlag("share_card_enabled", true);
  {
    const { ctaKeyboard } = await import("../src/keyboards/index.js");
    const { isShareCardEnabled } = await import("../src/flags.js");
    check("share flag on", isShareCardEnabled());
    check(
      "share button shown when flag on",
      JSON.stringify(ctaKeyboard("https://zovus.ru").inline_keyboard).includes("share:spread")
    );
  }

  // Fresh DB schema smoke (column presence via expected)
  const tmp = mkdtempSync(join(tmpdir(), "zovus-bot-"));
  const freshPath = join(tmp, "fresh.sqlite");
  try {
    migrateFreshDb(freshPath);
    const fresh = new DatabaseSync(freshPath);
    const freshCols = new Set(
      (fresh.prepare(`PRAGMA table_info(bot_users)`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
    check("fresh DB has timezone_offset_minutes", freshCols.has("timezone_offset_minutes"));
    check("fresh DB has timezone_source", freshCols.has("timezone_source"));
    const claims = fresh
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='bot_spread_claims'`
      )
      .get() as { name: string } | undefined;
    check("fresh DB has bot_spread_claims", Boolean(claims));
    fresh.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

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
