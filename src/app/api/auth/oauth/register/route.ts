import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { linkSessionToUser } from "@/lib/users";
import { readSessionClaimCookie } from "@/lib/session-claim";
import {
  upsertOAuthAccountWithClient,
  type OAuthAccountConsent,
} from "@/lib/oauth/accounts";
import {
  consumePendingOAuthRegistration,
  createOAuthHandoff,
  getPendingOAuthRegistration,
} from "@/lib/oauth/storage";
import { OAUTH_PROVIDER_LABELS } from "@/lib/oauth/types";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { sendWelcomeEmail } from "@/lib/email/send";
import { sanitizeRegistrationAttribution } from "@/lib/registration-attribution";

type RegistrationBody = {
  code?: string;
  acceptedTerms?: boolean;
  ageConfirmed?: boolean;
  marketingConsent?: boolean;
  attribution?: unknown;
};

const NO_STORE = OAUTH_NO_STORE_HEADERS;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "missing_registration_code" }, { status: 400, headers: NO_STORE });
  }
  const pending = await getPendingOAuthRegistration(code);
  if (!pending) {
    return NextResponse.json({ error: "invalid_registration_code" }, { status: 410, headers: NO_STORE });
  }
  return NextResponse.json(
    {
      provider: pending.provider,
      providerLabel: OAUTH_PROVIDER_LABELS[pending.provider],
      name: pending.info.name,
      gender: pending.info.gender ?? null,
    },
    { headers: NO_STORE }
  );
}

export async function POST(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "register", 15);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: NO_STORE }
      );
    }
    const body = (await request.json()) as RegistrationBody;
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json(
        { error: "missing_registration_code" },
        { status: 400, headers: NO_STORE }
      );
    }
    if (body.acceptedTerms !== true || body.ageConfirmed !== true) {
      return NextResponse.json(
        { error: "consent_required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const now = new Date().toISOString();
    const consent: OAuthAccountConsent = {
      termsAcceptedAt: now,
      ageConfirmedAt: now,
      marketingConsent: body.marketingConsent === true,
      marketingConsentAt: body.marketingConsent === true ? now : null,
    };

    const bodyAttribution = sanitizeRegistrationAttribution(body.attribution);

    const completed = await withTransaction(async (client) => {
      const pending = await consumePendingOAuthRegistration(client, code);
      if (!pending) return null;
      const account = await upsertOAuthAccountWithClient(client, {
        provider: pending.provider,
        info: pending.info,
        consent,
        registrationAttribution:
          pending.registrationAttribution ??
          (bodyAttribution as Record<string, string> | null),
      });
      return { pending, account };
    });

    if (!completed) {
      return NextResponse.json(
        { error: "invalid_registration_code" },
        { status: 410, headers: NO_STORE }
      );
    }

    const profileUserId = await getProfileUserIdForAccount(completed.account.accountId);
    let sessionLinked = false;
    if (profileUserId && completed.pending.sessionId) {
      const claimToken = await readSessionClaimCookie();
      sessionLinked = await linkSessionToUser(
        completed.pending.sessionId,
        profileUserId,
        claimToken
      ).catch(() => false);
    }
    if (completed.account.isNewUser && profileUserId) {
      await grantStarterRunesIfNeeded(profileUserId);
    }

    await setAuthCookie(
      {
        sub: completed.account.accountId,
        role: "user",
        email: completed.account.email,
        name: completed.account.name,
      },
      request
    );

    // Registration completes through fetch, whose Set-Cookie can lag in both
    // browsers and Android WebView. Always provide a one-time document handoff;
    // setAuthCookie above remains for backwards compatibility.
    const handoff = await createOAuthHandoff(completed.account.accountId);

    if (completed.account.isNewUser) {
      void sendWelcomeEmail(
        completed.account.email,
        completed.account.name || completed.account.email,
        { needsOnboarding: !profileUserId }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        returnTo: completed.pending.returnTo,
        isNewUser: completed.account.isNewUser,
        needsProfile: !profileUserId,
        sessionLinked,
        name: completed.account.name,
        gender: completed.pending.info.gender ?? null,
        appFlow: completed.pending.appFlow,
        handoff,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "registration_failed";
    console.error("OAuth registration completion failed:", message);
    return NextResponse.json(
      { error: "registration_failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}
