import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled, getOAuthRedirectUri, resolveOAuthOrigin, oauthAbsoluteUrl } from "@/lib/oauth/config";
import { createCodeChallenge, createCodeVerifier } from "@/lib/oauth/pkce";
import { buildProviderAuthorizeUrl } from "@/lib/oauth/providers";
import { createOAuthTransaction } from "@/lib/oauth/storage";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { oauthErrorRedirect } from "@/lib/oauth/finish";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { parseAttributionQueryParam } from "@/lib/registration-attribution";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { getAccountConsentSnapshot } from "@/lib/accounts";

type RouteParams = { params: Promise<{ provider: string }> };

function parseBool(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function parseMode(raw: string | null): OAuthMode {
  if (raw === "login") return "login";
  if (raw === "link") return "link";
  return "register";
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "start", 20);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { ...OAUTH_NO_STORE_HEADERS, "Retry-After": String(rate.retryAfterSec ?? 60) } }
      );
    }
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    const { provider: rawProvider } = await params;
    if (!isOAuthProviderEnabled(rawProvider)) {
      return NextResponse.json({ error: "OAuth provider unavailable" }, { status: 404 });
    }
    const provider = rawProvider as OAuthProvider;

    const url = request.nextUrl;
    const mode = parseMode(url.searchParams.get("mode"));
    let returnTo = sanitizeReturnTo(
      url.searchParams.get("returnTo"),
      mode === "link" ? "/cabinet" : "/"
    );
    const appFlow = parseBool(url.searchParams.get("app"));
    if (appFlow && !returnTo.includes("app=1")) {
      const dest = new URL(returnTo, "https://zovus.ru");
      dest.searchParams.set("app", "1");
      returnTo = `${dest.pathname}${dest.search}${dest.hash}`;
    }
    const sessionId = url.searchParams.get("sessionId")?.trim() || null;
    let acceptedTerms = parseBool(url.searchParams.get("acceptedTerms"));
    let ageConfirmed = parseBool(url.searchParams.get("ageConfirmed"));
    const marketingConsent = parseBool(url.searchParams.get("marketingConsent"));
    const registrationAttribution = parseAttributionQueryParam(
      url.searchParams.get("attribution")
    );

    let linkAccountId: string | null = null;
    if (mode === "link") {
      const auth = await getAuth();
      if (!auth || auth.role !== "user") {
        return NextResponse.redirect(
          oauthAbsoluteUrl(
            request,
            `/auth/user/login?returnTo=${encodeURIComponent(returnTo)}&oauthError=auth_required`
          ),
          { headers: OAUTH_NO_STORE_HEADERS }
        );
      }
      linkAccountId = auth.sub;
      const consent = await getAccountConsentSnapshot(auth.sub);
      if (consent?.ageConfirmedAt && consent?.termsAcceptedAt) {
        acceptedTerms = true;
        ageConfirmed = true;
      }
      if (!returnTo.startsWith("/cabinet")) {
        returnTo = "/cabinet?loginMethods=1";
      } else if (!returnTo.includes("loginMethods=")) {
        returnTo += returnTo.includes("?") ? "&loginMethods=1" : "?loginMethods=1";
      }
    }

    if (!acceptedTerms || !ageConfirmed) {
      return NextResponse.redirect(
        oauthAbsoluteUrl(request, oauthErrorRedirect("consent_required", mode, returnTo)),
        { headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const redirectUri = getOAuthRedirectUri(provider, resolveOAuthOrigin(request));

    const pending = {
      provider,
      codeVerifier,
      redirectUri,
      returnTo,
      sessionId,
      acceptedTerms,
      ageConfirmed,
      marketingConsent,
      mode,
      appFlow,
      linkAccountId,
      registrationAttribution: mode === "link" ? null : registrationAttribution,
    };

    const state = await createOAuthTransaction(pending);
    const authorizeUrl = buildProviderAuthorizeUrl(provider, state, codeChallenge, redirectUri);
    return NextResponse.redirect(authorizeUrl, { headers: OAUTH_NO_STORE_HEADERS });
  } catch (error) {
    console.error("OAuth start error:", error);
    return NextResponse.redirect(oauthAbsoluteUrl(request, "/auth/user/login?oauthError=start_failed"));
  }
}
