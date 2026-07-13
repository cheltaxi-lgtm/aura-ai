import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled, getOAuthRedirectUri, resolveOAuthOrigin, oauthAbsoluteUrl } from "@/lib/oauth/config";
import { createCodeChallenge, createCodeVerifier } from "@/lib/oauth/pkce";
import { buildProviderAuthorizeUrl } from "@/lib/oauth/providers";
import { createOAuthTransaction } from "@/lib/oauth/storage";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

type RouteParams = { params: Promise<{ provider: string }> };

function parseBool(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
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
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const { provider: rawProvider } = await params;
    if (!isOAuthProviderEnabled(rawProvider)) {
      return NextResponse.json({ error: "OAuth provider unavailable" }, { status: 404 });
    }
    const provider = rawProvider as OAuthProvider;

    const url = request.nextUrl;
    const mode = (url.searchParams.get("mode") === "login" ? "login" : "register") as OAuthMode;
    let returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), "/");
    const appFlow = parseBool(url.searchParams.get("app"));
    if (appFlow && !returnTo.includes("app=1")) {
      const dest = new URL(returnTo, "https://zovus.ru");
      dest.searchParams.set("app", "1");
      returnTo = `${dest.pathname}${dest.search}${dest.hash}`;
    }
    const sessionId = url.searchParams.get("sessionId")?.trim() || null;
    const acceptedTerms = parseBool(url.searchParams.get("acceptedTerms"));
    const ageConfirmed = parseBool(url.searchParams.get("ageConfirmed"));
    const marketingConsent = parseBool(url.searchParams.get("marketingConsent"));

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
    };

    const state = await createOAuthTransaction(pending);
    const authorizeUrl = buildProviderAuthorizeUrl(provider, state, codeChallenge, redirectUri);
    return NextResponse.redirect(authorizeUrl, { headers: OAUTH_NO_STORE_HEADERS });
  } catch (error) {
    console.error("OAuth start error:", error);
    return NextResponse.redirect(oauthAbsoluteUrl(request, "/auth/user/login?oauthError=start_failed"));
  }
}
