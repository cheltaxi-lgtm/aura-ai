import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled } from "@/lib/oauth/config";
import { createCodeChallenge, createCodeVerifier, createOAuthState } from "@/lib/oauth/pkce";
import { buildProviderAuthorizeUrl } from "@/lib/oauth/providers";
import { setOAuthPendingState } from "@/lib/oauth/state-cookie";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

type RouteParams = { params: Promise<{ provider: string }> };

function parseBool(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
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
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), "/");
    const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
    const acceptedTerms = parseBool(url.searchParams.get("acceptedTerms"));
    const ageConfirmed = parseBool(url.searchParams.get("ageConfirmed"));
    const marketingConsent = parseBool(url.searchParams.get("marketingConsent"));

    if (mode === "register" && (!acceptedTerms || !ageConfirmed)) {
      const redirect = `/auth/user/register?oauthError=consent_required&returnTo=${encodeURIComponent(returnTo)}`;
      return NextResponse.redirect(new URL(redirect, request.url));
    }

    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const nonce = createOAuthState();

    await setOAuthPendingState(
      {
        provider,
        codeVerifier,
        returnTo,
        sessionId,
        acceptedTerms,
        ageConfirmed,
        marketingConsent,
        mode,
        nonce,
      },
      request
    );

    const authorizeUrl = buildProviderAuthorizeUrl(provider, nonce, codeChallenge);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("OAuth start error:", error);
    return NextResponse.redirect(new URL("/auth/user/login?oauthError=start_failed", request.url));
  }
}
