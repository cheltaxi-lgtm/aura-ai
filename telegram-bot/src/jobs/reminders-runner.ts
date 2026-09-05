import { createBot } from "../bot.js";
import { migrate } from "../db/client.js";
import { ensureCriticalColumns, migrateUp } from "../db/migrate-runner.js";
import { runReminderTick } from "./reminders.js";

migrate();
migrateUp();
ensureCriticalColumns();
const bot = createBot();
await runReminderTick(bot);
console.log("[reminders] tick done");
