import { Bot } from "grammy";
import { botConfig } from "./config.js";
import { telegramFetch } from "./domain/telegram-ipv4.js";
import { registerFlows } from "./flows/register.js";
import { markIrreversible } from "./middleware/irreversible.js";
import { userActivity } from "./middleware/activity.js";
import { userQueue } from "./middleware/user-queue.js";
import { erasureGate } from "./domain/user-erasure.js";
import { registerRecoveryFlows } from './flows/recovery.js';
import {
  ensureUser,
  featureGate,
  idempotent,
  privateOnly,
  rateLimit,
} from "./middleware/stack.js";

export function createBot(): Bot {
  const bot = new Bot(botConfig.token, {
    client: {
      // Pin Bot API calls to IPv4 — dual-stack fetch hangs on this VPS.
      fetch: telegramFetch as unknown as typeof fetch,
      // Fail faster than 60s — hung sendPhoto was freezing the whole bot UX.
      timeoutSeconds: 25,
    },
  });

  bot.use(privateOnly);
  bot.use(userQueue);
  bot.use(erasureGate);
  bot.use(userActivity);
  bot.use(idempotent);
  bot.use(ensureUser);
  bot.use(rateLimit);
  bot.use(featureGate);

  // The handlers include purchases, deletion and external notifications. Until
  // each operation has a durable result/retry contract, never replay a handler
  // after a crash with an unknown outcome. Unstarted inbox items remain queued.
  bot.use(async (ctx, next) => {
    markIrreversible(ctx);
    await next();
  });

  registerRecoveryFlows(bot);
  registerFlows(bot);

  bot.catch((err) => {
    console.error(`[bot] update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
