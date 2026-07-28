import { copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Bot } from "grammy";
import { botConfig } from "../config.js";
import { getDb, migrate } from "../db/client.js";
import { migrateDown, migrateUp } from "../db/migrate-runner.js";
import {
  audit,
  banUser,
  exportEventsCsv,
  listSessions,
  listUsers,
  metricsSummary,
  setFlag,
} from "../db/repos.js";

async function main(): Promise<void> {
  migrate();
  migrateUp();

  const [cmd, ...args] = process.argv.slice(2);

  function help(): void {
    console.log(`Zovus bot admin

  users | sessions <tg_id> | ban <tg_id>
  flag <key> <0|1> | export-csv [path] | report | backup
  presence:sync | migrate:up | migrate:down
`);
  }

  switch (cmd) {
    case "users": {
      for (const u of listUsers(200)) {
        console.log(
          `${u.telegram_user_id}\t@${u.username ?? "-"}\tstreak=${u.streak_days}\tref=${u.ref_code ?? "-"}`
        );
      }
      audit("users_list", {});
      break;
    }
    case "sessions": {
      const id = Number(args[0]);
      for (const s of listSessions(id, 50)) {
        console.log(`${s.created_at}\t${s.question}\texpires=${s.expires_at}`);
      }
      break;
    }
    case "ban": {
      banUser(Number(args[0]));
      console.log("banned");
      break;
    }
    case "flag": {
      setFlag(args[0]!, args[1] === "1");
      console.log("flag", args[0], args[1]);
      break;
    }
    case "export-csv": {
      const path = resolve(args[0] || resolve(botConfig.dataDir, "events.csv"));
      writeFileSync(path, exportEventsCsv(), "utf8");
      console.log("wrote", path);
      break;
    }
    case "report": {
      console.log(JSON.stringify(metricsSummary(), null, 2));
      const db = getDb();
      const chip = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM bot_events WHERE name='question_submitted' AND payload LIKE '%"source":"chip"%'`
          )
          .get() as { c: number }
      ).c;
      const free = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM bot_events WHERE name='question_submitted' AND payload LIKE '%"source":"free"%'`
          )
          .get() as { c: number }
      ).c;
      const cta = (
        db.prepare(`SELECT COUNT(*) AS c FROM bot_events WHERE name='cta_click'`).get() as {
          c: number;
        }
      ).c;
      const teasers = (
        db.prepare(`SELECT COUNT(*) AS c FROM bot_events WHERE name='teaser_shown'`).get() as {
          c: number;
        }
      ).c;
      console.log({ chip_vs_free: { chip, free }, teaser_to_cta: teasers ? cta / teasers : 0 });
      break;
    }
    case "backup": {
      const dest = resolve(botConfig.backupDir, `bot-${Date.now()}.sqlite`);
      copyFileSync(botConfig.dbPath, dest);
      console.log("backup", dest);
      audit("backup", { dest });
      break;
    }
    case "presence:sync": {
      const bot = new Bot(botConfig.token);
      await bot.api.setMyCommands([
        { command: "spread", description: "Расклад на три карты" },
        { command: "day", description: "Карта дня" },
        { command: "history", description: "История раскладов" },
        { command: "profile", description: "Профиль" },
        { command: "settings", description: "Настройки" },
        { command: "about", description: "О салоне" },
        { command: "help", description: "Справка" },
        { command: "delete", description: "Удалить данные" },
      ]);
      await bot.api.setMyShortDescription("Приватный цифровой салон Zovus");
      await bot.api.setMyDescription(
        "Zovus — приватный цифровой салон. Три карты и короткий ориентир от Вероники. Наставник — ИИ в художественном образе. 18+."
      );
      console.log("presence synced");
      audit("presence_sync", {});
      break;
    }
    case "migrate:up":
      console.log(migrateUp());
      break;
    case "migrate:down":
      console.log(migrateDown());
      break;
    default:
      help();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
