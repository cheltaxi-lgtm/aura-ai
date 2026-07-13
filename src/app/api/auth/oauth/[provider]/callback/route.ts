import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled } from "@/lib/oauth/config";
import { finishOAuthLogin, oauthErrorRedirect } from "@/lib/oauth/finish";
import { exchangeProviderCode } from "@/lib/oauth/providers";
import { clearOAuthPendingState, readOAuthPendingState } from "@/lib/oauth/state-cookie";
import type { OAuthProvider } from "@/lib/oauth/types";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

type RouteParams = { params: Promise<{ provider: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const fallbackReturn = "/";
  let mode: "login" | "register" = "login";

  try {
    if (!(await ensureDb())) {
      return NextResponse.redirect(
        new URL(oauthErrorRedirect("db_unavailable", mode, fallbackReturn), request.url)
      );
    }

    const { provider: rawProvider } = await params;
    if (!isOAuthProviderEnabled(rawProvider)) {
      return NextResponse.redirect(
        new URL(oauthErrorRedirect("provider_unavailable", mode, fallbackReturn), request.url)
      );
    }
    const provider = rawProvider as OAuthProvider;

    const url = request.nextUrl;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    const pending = await readOAuthPendingState();
    mode = pending?.mode ?? "login";
    const returnTo = sanitizeReturnTo(pending?.returnTo, fallbackReturn);

    if (providerError || !code || !state) {
      await clearOAuthPendingState();
      return NextResponse.redirect(
        new URL(oauthErrorRedirect("provider_denied", mode, returnTo), request.url)
      );
    }

    if (!pending || pending.provider !== provider || pending.nonce !== state) {
      await clearOAuthPendingState();
      return NextResponse.redirect(
        new URL(oauthErrorRedirect("state_mismatch", mode, returnTo), request.url)
      );
    }

    const info = await exchangeProviderCode(provider, code, pending.codeVerifier);
    const result = await finishOAuthLogin({
      provider,
      info,
      pending,
      request,
    });

    await clearOAuthPendingState();

    const completeParams = new URLSearchParams({
      returnTo,
      mode: pending.mode,
      new: result.isNewUser ? "1" : "0",
      needsProfile: result.needsProfile ? "1" : "0",
    });
    if (result.profile) {
      completeParams.set("hasProfile", "1");
    }

    return NextResponse.redirect(
      new URL(`/auth/oauth/complete?${completeParams.toString()}`, request.url)
    );
  } catch (error) {
    await clearOAuthPendingState();
    const message = error instanceof Error ? error.message : "oauth_failed";
    console.error("OAuth callback error:", error);

    let code = "oauth_failed";
    if (message === "CONSENT_REQUIRED") code = "consent_required";
    if (message === "EMAIL_ACCOUNT_EXISTS") code = "email_exists";

    return NextResponse.redirect(
      new URL(oauthErrorRedirect(code, mode, fallbackReturn), request.url)
    );
  }
}
