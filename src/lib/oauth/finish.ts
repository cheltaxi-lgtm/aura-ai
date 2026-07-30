import { setAuthCookie, type CookieRequestContext } from "@/lib/auth";
import {
  findUserById,
  getAccountConsentSnapshot,
  getProfileUserIdForAccount,
  recordAccountLegalConsent,
} from "@/lib/accounts";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { getUserById, linkSessionToUser, serializeUserProfile } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email/send";
import { readSessionClaimCookie } from "@/lib/session-claim";
import type { OAuthFinishResult, OAuthMode, OAuthTransaction } from "./types";
import {
  linkOAuthIdentityToAccount,
  upsertOAuthAccount,
  type OAuthAccountConsent,
} from "./accounts";
import type { OAuthProvider, OAuthUserInfo } from "./types";

export function hasRequiredOAuthConsent(state: OAuthTransaction): boolean {
  return state.acceptedTerms && state.ageConfirmed;
}

function buildConsentFromState(state: OAuthTransaction): OAuthAccountConsent | null {
  if (!hasRequiredOAuthConsent(state)) return null;
  const now = new Date().toISOString();
  return {
    termsAcceptedAt: now,
    ageConfirmedAt: now,
    marketingConsent: state.marketingConsent,
    marketingConsentAt: state.marketingConsent ? now : null,
  };
}

/** Attach provider to an already-authenticated account (mode=link). */
export async function finishOAuthLink(opts: {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  pending: OAuthTransaction;
  request?: CookieRequestContext;
}): Promise<OAuthFinishResult> {
  const accountId = opts.pending.linkAccountId?.trim();
  if (!accountId) throw new Error("LINK_ACCOUNT_REQUIRED");

  const linked = await linkOAuthIdentityToAccount(accountId, opts.provider, opts.info);
  if (!linked.ok) {
    if (linked.error === "provider_taken") throw new Error("PROVIDER_TAKEN");
    throw new Error("ACCOUNT_MISSING");
  }

  const account = await findUserById(accountId);
  const email = linked.email || account?.email || "";
  const name = linked.name || account?.name || "Гость";

  let profile = null;
  const profileUserId = await getProfileUserIdForAccount(accountId);
  if (profileUserId) {
    const row = await getUserById(profileUserId);
    if (row) profile = serializeUserProfile(row);
  }

  await setAuthCookie(
    { sub: accountId, role: "user", email, name },
    opts.request
  );

  return {
    account: { id: accountId, email, name },
    profile,
    sessionLinked: false,
    needsProfile: !profileUserId,
    isNewUser: false,
  };
}

export async function finishOAuthLogin(opts: {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  pending: OAuthTransaction;
  request?: CookieRequestContext;
}): Promise<OAuthFinishResult> {
  if (opts.pending.mode === "link") {
    return finishOAuthLink(opts);
  }

  const consent = buildConsentFromState(opts.pending);
  const accountResult = await upsertOAuthAccount({
    provider: opts.provider,
    info: opts.info,
    consent,
    registrationAttribution: opts.pending.registrationAttribution ?? null,
  });

  const existingConsent = await getAccountConsentSnapshot(accountResult.accountId);
  if (!existingConsent?.ageConfirmedAt) {
    if (!consent) {
      throw new Error("CONSENT_REQUIRED");
    }
    await recordAccountLegalConsent(accountResult.accountId, {
      ageConfirmed: true,
      acceptedTerms: true,
      marketingConsent: consent.marketingConsent,
    });
  } else if (consent) {
    await recordAccountLegalConsent(accountResult.accountId, {
      ageConfirmed: true,
      acceptedTerms: true,
      marketingConsent: consent.marketingConsent,
    });
  }

  let profile = null;
  const profileUserId = await getProfileUserIdForAccount(accountResult.accountId);
  if (profileUserId) {
    const row = await getUserById(profileUserId);
    if (row) profile = serializeUserProfile(row);
  }

  let sessionLinked = false;
  if (opts.pending.sessionId && profileUserId) {
    try {
      const claimToken = await readSessionClaimCookie();
      sessionLinked = await linkSessionToUser(
        opts.pending.sessionId,
        profileUserId,
        claimToken
      );
    } catch {
      sessionLinked = false;
    }
  }

  if (accountResult.isNewUser && profileUserId) {
    await grantStarterRunesIfNeeded(profileUserId);
  }

  await setAuthCookie(
    {
      sub: accountResult.accountId,
      role: "user",
      email: accountResult.email,
      name: accountResult.name,
    },
    opts.request
  );

  if (accountResult.isNewUser) {
    void sendWelcomeEmail(accountResult.email, accountResult.name || accountResult.email, {
      needsOnboarding: !profileUserId,
    });
  }

  return {
    account: {
      id: accountResult.accountId,
      email: accountResult.email,
      name: accountResult.name,
    },
    profile,
    sessionLinked,
    needsProfile: !profileUserId,
    isNewUser: accountResult.isNewUser,
  };
}

export function oauthErrorRedirect(
  code: string,
  mode: OAuthMode,
  returnTo: string
): string {
  if (mode === "link") {
    const params = new URLSearchParams({
      oauthError: code,
      loginMethods: "1",
    });
    const dest = sanitizeLinkReturn(returnTo);
    const joiner = dest.includes("?") ? "&" : "?";
    return `${dest}${joiner}${params.toString()}`;
  }
  const base =
    code === "email_exists"
      ? "/auth/user/register"
      : code === "consent_required"
        ? mode === "register"
          ? "/auth/user/register"
          : "/auth/user/login"
        : mode === "register"
          ? "/auth/user/register"
          : "/auth/user/login";
  const params = new URLSearchParams({ oauthError: code, returnTo });
  return `${base}?${params.toString()}`;
}

function sanitizeLinkReturn(returnTo: string): string {
  const t = (returnTo || "").trim();
  if (t.startsWith("/cabinet")) return t.split("#")[0] || "/cabinet";
  return "/cabinet";
}
