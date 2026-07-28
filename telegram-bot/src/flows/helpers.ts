import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { getUser, hasGates, trackEvent, type BotUser } from "../db/repos.js";
import { ageKeyboard, consentKeyboard, salonKeyboard } from "../keyboards/index.js";

let gateCounter = 0;

export function requireUser(ctx: Context): BotUser | null {
  if (!ctx.from) return null;
  return getUser(ctx.from.id);
}

export async function attachSalonBar(ctx: Context, text?: string): Promise<void> {
  await ctx.reply(text ?? copy.salonReady, { reply_markup: salonKeyboard() });
}

export async function sendMenu(ctx: Context): Promise<void> {
  await attachSalonBar(ctx, copy.menuTitle);
}

export async function ensureOnboarded(ctx: Context): Promise<BotUser | null> {
  const user = requireUser(ctx);
  if (!user) return null;
  if (!user.age_confirmed_at) {
    await ctx.reply(copy.ageAsk, { reply_markup: ageKeyboard() });
    return null;
  }
  if (!user.terms_accepted_at || !user.privacy_accepted_at) {
    await ctx.reply(copy.consentAsk(botConfig.siteUrl), { reply_markup: consentKeyboard() });
    return null;
  }
  if (!hasGates(user)) {
    await ctx.reply(copy.gateBlocked(user.telegram_user_id, gateCounter++));
    return null;
  }
  return user;
}

export function eventPayload(user: BotUser, extra: Record<string, unknown> = {}) {
  return {
    ref: user.ref,
    utm_source: user.utm_source,
    utm_medium: user.utm_medium,
    utm_campaign: user.utm_campaign,
    utm_content: user.utm_content,
    streak: user.streak_days,
    ...extra,
  };
}

export function track(user: BotUser, name: string, extra: Record<string, unknown> = {}) {
  trackEvent(name, user.telegram_user_id, eventPayload(user, extra));
}

export function removeKeyboardMarkup(): { remove_keyboard: true } {
  return { remove_keyboard: true };
}
