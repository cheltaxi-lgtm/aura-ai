import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { getDb, migrate } from "../../db/client.js";
import { migrateUp } from "../../db/migrate-runner.js";
import { deleteUserData, setFlag, upsertUser } from "../../db/repos.js";
import { deliverReminder } from "../reminder-delivery.js";

const uid = 950_001;
if (process.argv[2] === "contender") {
  await deliverReminder(uid, "abandoned", async () => {
    process.send?.("sent");
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  process.disconnect?.();
} else {
  migrate(); migrateUp();
  deleteUserData(uid);
  upsertUser({ telegramUserId: uid, chatId: uid, firstName: "Delivery test" });
  setFlag("reminders_enabled", true);
  const db = getDb();
  let sends = 0;
  try {
    const children = [0, 1].map(() => fork(fileURLToPath(import.meta.url), ["contender"], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    for (const child of children) child.on("message", () => sends++);
    await Promise.all(children.map(child => once(child, "exit").then(([code]) => assert.equal(code, 0))));
    assert.equal(sends, 1, "two processes share one atomic delivery claim");
    await deliverReminder(uid, "abandoned", async () => { sends++; });
    assert.equal(sends, 1, "cooldown blocks a later process/tick");

    await deliverReminder(uid, "uncertain-test", async () => { sends++; throw new Error("network timeout"); });
    await deliverReminder(uid, "uncertain-test", async () => { sends++; });
    assert.equal(sends, 2, "unknown outcome never automatically replays");

    let limitedCalls = 0;
    const limited = async () => { limitedCalls++; throw { error_code: 429, parameters: { retry_after: 10 } }; };
    await deliverReminder(uid, "rate-limit-test", limited);
    await deliverReminder(uid, "rate-limit-test", limited);
    assert.equal(limitedCalls, 1, "retry_after blocks immediate retry");
    for (let i = 0; i < 4; i++) {
      db.prepare("UPDATE bot_reminder_delivery SET retry_at = 0 WHERE telegram_user_id = ? AND kind = 'rate-limit-test'").run(uid);
      await deliverReminder(uid, "rate-limit-test", limited);
    }
    assert.equal(limitedCalls, 3, "rate-limit retry budget is bounded to three attempts");

    db.prepare("UPDATE bot_users SET unsubscribed_at = ? WHERE telegram_user_id = ?").run(new Date().toISOString(), uid);
    await deliverReminder(uid, "opt-out-test", async () => { sends++; });
    assert.equal(sends, 2, "last-moment opt-out excludes recipient");
    assert(!db.prepare("SELECT 1 FROM bot_reminder_delivery WHERE telegram_user_id = ? AND kind = 'opt-out-test'").get(uid));
    deleteUserData(uid);
    assert(!db.prepare("SELECT 1 FROM bot_reminder_delivery WHERE telegram_user_id = ?").get(uid), "account deletion cascades to delivery claims");
    console.log("ok: cross-process reminder dedupe / uncertain outcomes / bounded 429 retry / latest opt-out / deletion cascade");
  } finally { deleteUserData(uid); }
}
