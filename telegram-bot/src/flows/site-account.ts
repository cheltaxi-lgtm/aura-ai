import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { setZovusUserId, type BotUser } from "../db/repos.js";
import { siteLinkCode, siteResolve, type SiteResolve } from "../domain/site-client.js";
import { continueOnSiteKeyboard, linkAccountKeyboard, salonKeyboard } from "../keyboards/index.js";
import { ensureOnboarded } from "./helpers.js";

export async function syncSiteAccount(user: BotUser): Promise<SiteResolve> {
  const resolved = await siteResolve(user.telegram_user_id);
  if (resolved.linked && resolved.profileUserId) {
    if (user.zovus_user_id !== resolved.profileUserId) {
      setZovusUserId(user.telegram_user_id, resolved.profileUserId);
    }
  }
  return resolved;
}

/** Mint post-auth bind URL (bot → site link-code). Never issues Telegram login. */
export async function issueSiteLinkUrl(
  ctx: Context,
  user: BotUser
): Promise<string | null> {
  try {
    const { data } = await siteLinkCode({
      telegramUserId: user.telegram_user_id,
      username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? null,
      photoUrl: null,
    });
    if (data.ok && data.linkUrl) return data.linkUrl;
  } catch (err) {
    console.error("[site-account] link-code failed", err);
  }
  return null;
}

/** Require linked Zovus account for product actions (site as source of truth). */
export async function ensureSiteLinked(
  ctx: Context
): Promise<{ user: BotUser; site: SiteResolve } | null> {
  const user = await ensureOnboarded(ctx);
  if (!user) return null;

  if (!botConfig.requireSiteAccount) {
    return { user, site: await syncSiteAccount(user) };
  }

  let site: SiteResolve;
  try {
    site = await syncSiteAccount(user);
  } catch (err) {
    console.error("[site-account] resolve failed", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return null;
  }

  if (!site.ok && site.error === "site_bridge_disabled") {
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    return null;
  }

  if (!site.linked) {
    const linkUrl = (await issueSiteLinkUrl(ctx, user)) || site.linkUrl;
    await ctx.reply(copy.needSiteAccount, {
      reply_markup: linkAccountKeyboard(linkUrl),
    });
    return null;
  }

  if (site.needsOnboarding) {
    await ctx.reply(copy.needSiteOnboarding, {
      reply_markup: continueOnSiteKeyboard(site.linkUrl, copy.continueOnSite),
    });
    return null;
  }

  return { user, site };
}

export function applyAccountLinked(telegramUserId: number, zovusUserId: string | null): void {
  if (zovusUserId) setZovusUserId(telegramUserId, zovusUserId);
}
