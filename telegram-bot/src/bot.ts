import { Bot } from "grammy";
import { botConfig } from "./config.js";
import { telegramFetch } from "./domain/telegram-ipv4.js";
import { registerFlows } from "./flows/register.js";
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
      timeoutSeconds: 60,
    },
  });

  bot.use(privateOnly);
  bot.use(idempotent);
  bot.use(ensureUser);
  bot.use(rateLimit);
  bot.use(featureGate);

  registerFlows(bot);

  bot.catch((err) => {
    console.error(`[bot] update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
