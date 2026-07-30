import type { Context, NextFunction } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  claimUpdate,
  getUser,
  markBlocked,
  releaseUpdate,
  trackEvent,
  upsertUser,
} from "../db/repos.js";
import { isBotEnabled } from "../flags.js";
import { pruneRateMap } from "../ops/rate-maps.js";
import { isIrreversible } from "./irreversible.js";

let disabledCounter = 0;

const hits = new Map<number, { count: number; resetAt: number }>();
let lastPrune = 0;

export async function privateOnly(ctx: Context, next: NextFunction): Promise<void> {
  // Stars pre-checkout has no chat — only from / invoice payload.
  if (ctx.preCheckoutQuery) {
    await next();
    return;
  }
  if (ctx.chat?.type !== "private") return;
  await next();
}

export async function idempotent(ctx: Context, next: NextFunction): Promise<void> {
  const id = ctx.update.update_id;
  if (!claimUpdate(id)) {
    trackEvent("duplicate_update_suppressed", ctx.from?.id ?? null, {
      update_id: id,
      reason: "already_claimed",
    });
    return;
  }
  try {
    await next();
  } catch (err) {
    // Release only before the point of no return (validation / pre-draw).
    // After draw/session side effects, keep the claim so Telegram retries are no-ops.
    if (!isIrreversible(ctx)) {
      releaseUpdate(id);
    } else {
      trackEvent("duplicate_update_suppressed", ctx.from?.id ?? null, {
        update_id: id,
        reason: "error_after_irreversible",
      });
    }
    throw err;
  }
}

export async function ensureUser(ctx: Context, next: NextFunction): Promise<void> {
  if (ctx.preCheckoutQuery) {
    const from = ctx.preCheckoutQuery.from;
    // Private chat id equals user id — enough for upsert continuity.
    upsertUser({
      telegramUserId: from.id,
      chatId: from.id,
      username: from.username,
      firstName: from.first_name,
      languageCode: from.language_code,
    });
    await next();
    return;
  }
  if (!ctx.from || !ctx.chat) return;
  upsertUser({
    telegramUserId: ctx.from.id,
    chatId: ctx.chat.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    languageCode: ctx.from.language_code,
  });
  await next();
}

export async function rateLimit(ctx: Context, next: NextFunction): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid) return;
  const now = Date.now();
  if (now - lastPrune > 60_000) {
    pruneRateMap(hits, now);
    lastPrune = now;
  }
  const slot = hits.get(uid);
  if (!slot || slot.resetAt < now) {
    hits.set(uid, { count: 1, resetAt: now + 60_000 });
  } else {
    slot.count += 1;
    if (slot.count > botConfig.rateLimitPerMinute) {
      await ctx.reply(copy.rateSlow);
      return;
    }
  }
  await next();
}

export async function featureGate(ctx: Context, next: NextFunction): Promise<void> {
  if (!isBotEnabled()) {
    if (ctx.preCheckoutQuery) {
      await ctx
        .answerPreCheckoutQuery(false, "Бот временно недоступен.")
        .catch(() => undefined);
      return;
    }
    await ctx.reply(copy.botDisabled(ctx.from?.id ?? 1, disabledCounter++));
    return;
  }
  const uid = ctx.from?.id ?? ctx.preCheckoutQuery?.from.id;
  const user = uid ? getUser(uid) : null;
  if (user?.banned_at) {
    if (ctx.preCheckoutQuery) {
      await ctx.answerPreCheckoutQuery(false, "Доступ ограничен.").catch(() => undefined);
      return;
    }
    await ctx.reply(copy.banned);
    return;
  }
  await next();
}

export async function withBlockDetect(fn: () => Promise<void>, telegramUserId: number): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.toLowerCase().includes("blocked") || msg.includes("Forbidden")) {
      markBlocked(telegramUserId);
      trackEvent("blocked", telegramUserId, {});
      return;
    }
    throw err;
  }
}
