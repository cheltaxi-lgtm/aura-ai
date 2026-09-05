import { setDefaultResultOrder } from "node:dns";
import { createBot } from "./bot.js";
import { assertBotRuntimeGuards, botConfig } from "./config.js";
import { migrate } from "./db/client.js";
import { ensureCriticalColumns, migrateUp } from "./db/migrate-runner.js";
import {
  expireSessions,
  metricsSummary,
  purgeExpiredGuestSessions,
  purgeProcessedUpdates,
  setFlag,
} from "./db/repos.js";
import {
  assertDeckAssetsOrExit,
  setAssetMissingAlerter,
} from "./domain/deck/asset-check.js";
import { installTelegramIpv4Networking } from "./domain/telegram-ipv4.js";
import { siteMiniAppShellUrl } from "./domain/site-client.js";
import { startHttpServer } from "./http/server.js";
import { runReminderTick } from "./jobs/reminders.js";
import { acquirePollingLock, releasePollingLock } from "./ops/lock.js";
import { warmRenderCaches } from "./render/canvas.js";
import { runDurablePolling } from "./ops/polling.js";
import { setRuntimeHealth, startSiteBridgeHealthProbe } from './ops/runtime-health.js';
import { purgeOperationalHistory } from './db/retention.js';

// Beget/VPS often has broken IPv6 to api.telegram.org → ETIMEDOUT / frozen polling.
try {
  setDefaultResultOrder("ipv4first");
} catch {
  /* older Node */
}
installTelegramIpv4Networking();

async function main(): Promise<void> {
  assertBotRuntimeGuards();
  setRuntimeHealth({ mode: botConfig.mode, phase: 'starting' });
  migrate();
  console.log("[migrate] up", migrateUp());
  ensureCriticalColumns();
  assertDeckAssetsOrExit();
  void warmRenderCaches();
  setFlag("ritual_reveal_enabled", botConfig.flags.ritualRevealEnabled);
  setFlag("tts_enabled", botConfig.flags.ttsEnabled);
  setFlag("llm_enabled", botConfig.flags.llmEnabled);
  setFlag("share_card_enabled", botConfig.flags.shareCardEnabled);
  setFlag("weekly_digest_enabled", botConfig.flags.weeklyDigestEnabled);
  setFlag("day_card_enabled", botConfig.flags.dayCardEnabled);
  setFlag("reminders_enabled", botConfig.flags.remindersEnabled);
  setFlag("bot_enabled", botConfig.flags.botEnabled);

  const bot = createBot();
  if (botConfig.adminChatId) {
    setAssetMissingAlerter(async (slug) => {
      await bot.api.sendMessage(
        botConfig.adminChatId,
        `Zovus bot: отсутствует файл колоды «${slug}». Показывается рубашка.`
      );
    });
  }
  const me = await bot.api.getMe();
  console.log(`[bot] @${me.username} mode=${botConfig.mode}`);

  try {
    // Only web_app launcher — fixed shell URL so Telegram reuses one Mini App instance.
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Кабинет",
        web_app: { url: siteMiniAppShellUrl() },
      },
    });
    console.log("[bot] chat menu button → single Mini App shell /tg");
  } catch (err) {
    console.error("[bot] setChatMenuButton failed (BotFather: Main Mini App = https://zovus.ru/tg)", err);
  }

  const server = botConfig.httpAlways || botConfig.mode === "webhook"
    ? startHttpServer(botConfig.mode === "webhook" ? bot : undefined) : undefined;
  const stopBridgeHealth = startSiteBridgeHealthProbe();

  let lastHistoryPurge = 0;
  let reminderWork: Promise<void> | undefined;
  const reminderTimer = setInterval(() => {
    try {
      if (Date.now() - lastHistoryPurge > 3_600_000) {
        purgeOperationalHistory(); lastHistoryPurge = Date.now();
      }
      const n = expireSessions();
      if (n) console.log(`[expire] marked ${n} sessions`);
      const purged = purgeExpiredGuestSessions();
      if (purged) console.log(`[expire] purged ${purged} legacy guest rows`);
      const purgedUpdates = purgeProcessedUpdates();
      if (purgedUpdates) console.log(`[expire] purged ${purgedUpdates} processed update rows`);
    } catch (e) {
      console.error("[expire]", e);
    }
    if (!reminderWork) {
      reminderWork = runReminderTick(bot).catch((e) => console.error("[reminders]", e))
        .finally(() => { reminderWork = undefined; });
    }
  }, 60_000);

  // Daily admin digest at ~10:05 server check each minute
  const digestTimer = setInterval(() => {
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
            `Тизеры: ${s.teaser_shown}`,
            `CTA sent/click: ${s.cta_sent}/${s.cta_click}`,
            `Claim: ${s.receipt_claimed}`,
            `Ритуал: ${s.ritual_completed}`,
            `Голос ok/fail: ${s.voice_sent}/${s.voice_failed}`,
            `Кризис: ${s.crisis_detected}`,
          ].join("\n")
        )
        .catch(() => undefined);
    }
  }, 60_000);

  const shutdown = new AbortController();
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  let httpDrained: Promise<void> | undefined;
  const stop = () => {
    if (shutdown.signal.aborted) return;
    console.log('[bot] draining active updates');
    setRuntimeHealth({ phase: 'draining' });
    shutdown.abort();
    clearInterval(reminderTimer);
    clearInterval(digestTimer);
    stopBridgeHealth();
    httpDrained = server ? new Promise<void>(resolve => { server.close(() => resolve()); }) : Promise.resolve();
    // Durable inbox preserves unfinished work if the service manager deadline
    // is reached; keep the polling lock until the process actually exits.
    shutdownTimer = setTimeout(() => process.exit(1), 25_000);
    shutdownTimer.unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (botConfig.mode === "webhook") {
    await bot.api.setWebhook(botConfig.webhookUrl, {
      secret_token: botConfig.webhookSecret,
    });
    console.log(`[bot] webhook set → ${botConfig.webhookUrl}`);
    setRuntimeHealth({ phase: 'running' });
    return;
  }

  if (!acquirePollingLock()) {
    console.error("[bot] polling lock busy — exit");
    process.exit(1);
  }
  process.on("exit", releasePollingLock);

  // Preserve updates accumulated during deploy/restart; idempotency handles retries.
  await bot.api.deleteWebhook();
  await bot.init();
  setRuntimeHealth({ phase: 'running' });
  console.log(`[bot] durable polling as @${me.username}`);
  await runDurablePolling({
    fetch: async (offset, signal) => {
      const updates = await bot.api.getUpdates({ offset, limit: 100, timeout: 15,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] },
        signal as unknown as Parameters<typeof bot.api.getUpdates>[1]);
      // Retired Stars invoices must be rejected promptly even if the same
      // user's normal queue is waiting on a long generation.
      await Promise.all(updates.flatMap(update => update.pre_checkout_query
        ? [bot.api.answerPreCheckoutQuery(update.pre_checkout_query.id, false,
          { error_message: 'Оплата Stars отключена. Купите руны картой в боте.' },
          AbortSignal.timeout(8000) as unknown as Parameters<typeof bot.api.answerPreCheckoutQuery>[3])
          .catch(() => undefined)] : []));
      return updates;
    },
    handle: update => update.pre_checkout_query ? Promise.resolve() : bot.handleUpdate(update),
  }, shutdown.signal);
  // Polling may already be idle while an internal notification or scheduled
  // send is still running. Keep its request and SQLite ownership alive too.
  if (shutdown.signal.aborted) await Promise.all([httpDrained, reminderWork]);
  if (shutdownTimer) clearTimeout(shutdownTimer);
  if (shutdown.signal.aborted) process.exit(0);
}

main().catch((error) => {
  setRuntimeHealth({ phase: 'failed' });
  console.error("[bot] Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
