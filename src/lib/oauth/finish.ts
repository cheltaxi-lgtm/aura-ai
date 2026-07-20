import { setAuthCookie, type CookieRequestContext } from "@/lib/auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { getUserById, linkSessionToUser, serializeUserProfile } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email/send";
import { readSessionClaimCookie } from "@/lib/session-claim";
import type { OAuthFinishResult, OAuthMode, OAuthTransaction } from "./types";
import { upsertOAuthAccount, type OAuthAccountConsent } from "./accounts";
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

export async function finishOAuthLogin(opts: {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  pending: OAuthTransaction;
  request?: CookieRequestContext;
}): Promise<OAuthFinishResult> {
  const consent = buildConsentFromState(opts.pending);
  const accountResult = await upsertOAuthAccount({
    provider: opts.provider,
    info: opts.info,
    consent,
    registrationAttribution: opts.pending.registrationAttribution ?? null,
  });

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
  const base =
    code === "consent_required" || code === "email_exists"
      ? "/auth/user/register"
      : mode === "register"
        ? "/auth/user/register"
        : "/auth/user/login";
  const params = new URLSearchParams({ oauthError: code, returnTo });
  return `${base}?${params.toString()}`;
}
