import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { setZovusUserId, type BotUser } from "../db/repos.js";
import {
  siteEnsureAccount,
  siteLinkCode,
  siteResolve,
  type SiteResolve,
} from "../domain/site-client.js";
import { linkAccountKeyboard, salonKeyboard } from "../keyboards/index.js";
import { ensureOnboarded } from "./helpers.js";
import { beginProfileOnboarding } from "./profile-onboarding.js";

export async function syncSiteAccount(user: BotUser): Promise<SiteResolve> {
  const resolved = await siteResolve(user.telegram_user_id);
  if (resolved.linked && resolved.profileUserId) {
    if (user.zovus_user_id !== resolved.profileUserId) {
      setZovusUserId(user.telegram_user_id, resolved.profileUserId);
    }
  }
  return resolved;
}

/** Ensure shell Zovus account exists after bot age/offer gates. */
export async function ensureBotOfferAccount(
  ctx: Context,
  user: BotUser
): Promise<SiteResolve | null> {
  if (!user.age_confirmed_at || !user.terms_accepted_at) return null;
  try {
    const site = await siteEnsureAccount({
      telegramUserId: user.telegram_user_id,
      firstName: ctx.from?.first_name ?? user.first_name ?? null,
      username: ctx.from?.username ?? user.username ?? null,
      photoUrl: null,
      termsAcceptedAt: user.terms_accepted_at,
      ageConfirmedAt: user.age_confirmed_at,
      marketingConsent: false,
      attribution: {
        utm_source: user.utm_source,
        utm_medium: user.utm_medium,
        utm_campaign: user.utm_campaign,
        ref: user.ref,
      },
    });
    if (site.linked && site.profileUserId) {
      setZovusUserId(user.telegram_user_id, site.profileUserId);
    } else if (site.linked && site.accountId && !user.zovus_user_id) {
      // Profile may be missing — still mark sync attempted via resolve later.
    }
    return site;
  } catch (err) {
    console.error("[site-account] ensure failed", err);
    return null;
  }
}

/** Mint post-auth bind URL for upgrading shell → email/Yandex/VK (optional). */
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

/** Require Zovus account for product actions — auto-create via bot offer when needed. */
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
    const ensured = await ensureBotOfferAccount(ctx, user);
    if (!ensured?.linked) {
      const linkUrl = (await issueSiteLinkUrl(ctx, user)) || site.linkUrl;
      await ctx.reply(copy.needSiteAccount, {
        reply_markup: linkAccountKeyboard(linkUrl),
      });
      return null;
    }
    site = ensured;
  }

  if (site.needsOnboarding) {
    await beginProfileOnboarding(ctx);
    return null;
  }

  return { user, site };
}

export function applyAccountLinked(telegramUserId: number, zovusUserId: string | null): void {
  if (zovusUserId) setZovusUserId(telegramUserId, zovusUserId);
}
