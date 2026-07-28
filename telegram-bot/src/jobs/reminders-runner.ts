import { createBot } from "../bot.js";
import { migrate } from "../db/client.js";
import { runReminderTick } from "./reminders.js";

migrate();
const bot = createBot();
await runReminderTick(bot);
console.log("[reminders] tick done");
