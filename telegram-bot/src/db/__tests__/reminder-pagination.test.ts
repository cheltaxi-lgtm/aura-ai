import assert from "node:assert/strict";
import type { Bot } from "grammy";
import { getDb, migrate } from "../client.js";
import { ensureCriticalColumns, migrateUp } from "../migrate-runner.js";
import { deleteUserData, setFlag, usersForReactivation } from "../repos.js";
import { runReminderTick, runWeeklyDigestTick } from "../../jobs/reminders.js";

migrate();
migrateUp();
ensureCriticalColumns();

const now = Date.parse("2026-09-06T08:00:00.000Z"); // Sunday, 11:00 at UTC+3.
const originalNow = Date.now;
const seeded: number[] = [];
const db = getDb();
const originalFlags = db.prepare("SELECT key, value FROM bot_flags WHERE key IN ('reminders_enabled', 'weekly_digest_enabled')")
  .all() as { key: string; value: string }[];
const sent: number[] = [];
let failUser = 0;
const fakeBot = {
  api: {
    async sendMessage(chatId: number) {
      if (chatId === failUser) throw new Error("simulated recipient delivery failure");
      sent.push(chatId);
      return {};
    },
  },
} as unknown as Bot;

function seed(id: number, offset: number, inactiveDays = 0): void {
  deleteUserData(id);
  const created = new Date(now - inactiveDays * 86_400_000).toISOString();
  db.prepare(`INSERT INTO bot_users
    (telegram_user_id, chat_id, first_name, age_confirmed_at, reminder_mode,
     timezone_offset_minutes, last_active_at, created_at, updated_at)
    VALUES (?, ?, 'Pagination test', ?, 'off', ?, ?, ?, ?)`)
    .run(id, id, created, offset, created, created, created);
  seeded.push(id);
}

try {
  Date.now = () => now;
  setFlag("reminders_enabled", false);
  setFlag("weekly_digest_enabled", true);

  // A full first page has the wrong local hour. Both due users on the next page
  // must still be visited, and one failed recipient must not block the next.
  for (let i = 0; i < 500; i++) seed(930_000 + i, 0);
  seed(930_500, 180);
  seed(930_501, 180);
  failUser = 930_500;
  await runWeeklyDigestTick(fakeBot);
  assert.deepEqual(sent, [930_501], "weekly digest must cross the first non-due page and isolate failures");
  failUser = 0;
  await runWeeklyDigestTick(fakeBot);
  assert.deepEqual(sent, [930_501], "uncertain failure must not retry and risk duplicate delivery");

  setFlag("weekly_digest_enabled", false);
  setFlag("reminders_enabled", true);
  sent.length = 0;
  for (let i = 0; i < 201; i++) seed(940_000 + i, 180, 7.5);
  await runReminderTick(fakeBot);
  assert.equal(sent.length, 201, "reactivation must process more than one 200-user batch per tick");
  assert.equal(new Set(sent).size, 201);
  await runReminderTick(fakeBot);
  assert.equal(sent.length, 201, "reactivation sent in this inactive period must not repeat");

  // An older campaign log must not suppress a new inactivity episode forever.
  const returningUser = 940_000;
  db.prepare("UPDATE bot_reminder_log SET created_at = ? WHERE telegram_user_id = ?")
    .run(new Date(now - 40 * 86_400_000).toISOString(), returningUser);
  const eligible = usersForReactivation(7, 200, "reactivation_7", 0, now);
  assert(eligible.some((u) => u.telegram_user_id === returningUser), "reactivation re-eligible after subsequent activity");
  assert.equal(eligible.length, 1, "other users remain suppressed for the current inactive period");
  console.log("ok: reminder cursor pagination / timezone starvation / recipient isolation / campaign eligibility");
} finally {
  Date.now = originalNow;
  for (const id of seeded) deleteUserData(id);
  db.prepare("DELETE FROM bot_flags WHERE key IN ('reminders_enabled', 'weekly_digest_enabled')").run();
  const restore = db.prepare("INSERT INTO bot_flags (key, value, updated_at) VALUES (?, ?, ?)");
  for (const flag of originalFlags) restore.run(flag.key, flag.value, new Date().toISOString());
}
