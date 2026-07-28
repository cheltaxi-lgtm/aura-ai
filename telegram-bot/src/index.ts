import { createBot } from "./bot.js";
import { botConfig } from "./config.js";
import { migrate } from "./db/client.js";
import { ensureCriticalColumns, migrateUp } from "./db/migrate-runner.js";
import { expireSessions, metricsSummary, setFlag } from "./db/repos.js";
import { startHttpServer } from "./http/server.js";
import { runReminderTick } from "./jobs/reminders.js";
import { acquirePollingLock, releasePollingLock } from "./ops/lock.js";

async function main(): Promise<void> {
  migrate();
  console.log("[migrate] up", migrateUp());
  ensureCriticalColumns();
  setFlag("ritual_reveal_enabled", botConfig.flags.ritualRevealEnabled);
  setFlag("tts_enabled", botConfig.flags.ttsEnabled);
  setFlag("llm_enabled", botConfig.flags.llmEnabled);
  setFlag("share_card_enabled", botConfig.flags.shareCardEnabled);
  setFlag("weekly_digest_enabled", botConfig.flags.weeklyDigestEnabled);

  const bot = createBot();
  const me = await bot.api.getMe();
  console.log(`[bot] @${me.username} mode=${botConfig.mode}`);

  if (botConfig.httpAlways || botConfig.mode === "webhook") {
    startHttpServer(botConfig.mode === "webhook" ? bot : undefined);
  }

  setInterval(() => {
    try {
      const n = expireSessions();
      if (n) console.log(`[expire] marked ${n} sessions`);
    } catch (e) {
      console.error("[expire]", e);
    }
    void runReminderTick(bot).catch((e) => console.error("[reminders]", e));
  }, 60_000);

  // Daily admin digest at ~10:05 server check each minute
  setInterval(() => {
    const h = new Date().getHours();
    const m = new Date().getMinutes();
    if (h === 10 && m === 5 && botConfig.adminChatId) {
      const s = metricsSummary();
      void bot.api
        .sendMessage(
          botConfig.adminChatId,
          [
            "Дневной отчёт Zovus bot",
            `Новые: ${s.users_new}`,
            `Расклады: ${s.spreads}`,
            `CTA: ${s.cta_click}`,
            `Ритуал: ${s.ritual_completed}`,
            `Голос ok/fail: ${s.voice_sent}/${s.voice_failed}`,
            `Кризис: ${s.crisis_detected}`,
          ].join("\n")
        )
        .catch(() => undefined);
    }
  }, 60_000);

  if (botConfig.mode === "webhook") {
    if (!botConfig.webhookUrl) {
      throw new Error("TELEGRAM_WEBHOOK_URL required in webhook mode");
    }
    await bot.api.setWebhook(botConfig.webhookUrl, {
      secret_token: botConfig.webhookSecret || undefined,
      drop_pending_updates: true,
    });
    console.log(`[bot] webhook set → ${botConfig.webhookUrl}`);
    return;
  }

  if (!acquirePollingLock()) {
    console.error("[bot] polling lock busy — exit");
    process.exit(1);
  }
  process.on("exit", releasePollingLock);
  process.on("SIGINT", () => {
    releasePollingLock();
    process.exit(0);
  });

  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await bot.start({
    drop_pending_updates: true,
    onStart: (info) => console.log(`[bot] polling as @${info.username}`),
  });
}

main().catch((error) => {
  console.error("[bot] Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
