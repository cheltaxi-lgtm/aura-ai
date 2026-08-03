import type { Context } from "grammy";
import { copy } from "../copy/ru.js";
import { decodeMiniAppStartParam } from "../domain/mini-app-link.js";
import { siteSetMiniAppNav } from "../domain/site-client.js";
import { CB, openSalonKeyboard } from "../keyboards/index.js";

export async function handleMiniAppNavCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.navPrefix) || !ctx.from) return false;

  const payload = data.slice(CB.navPrefix.length).trim();
  const path = decodeMiniAppStartParam(payload);

  try {
    await siteSetMiniAppNav(ctx.from.id, path);
  } catch (err) {
    console.error("[miniapp-nav] set pending", err);
  }

  // Reply with the launcher only — toast + message felt like a double-tap.
  await ctx.answerCallbackQuery().catch(() => undefined);

  // Always the same web_app URL — Telegram reuses one panel instead of stacking.
  await ctx
    .reply(copy.miniAppOpenBody, { reply_markup: openSalonKeyboard() })
    .catch(() => undefined);

  return true;
}
