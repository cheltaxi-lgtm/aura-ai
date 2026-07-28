import { Bot } from "grammy";
import { botConfig } from "./config.js";
import { registerFlows } from "./flows/register.js";
import {
  ensureUser,
  featureGate,
  idempotent,
  privateOnly,
  rateLimit,
} from "./middleware/stack.js";

export function createBot(): Bot {
  const bot = new Bot(botConfig.token);

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
