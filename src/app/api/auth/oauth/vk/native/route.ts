import { NextRequest, NextResponse } from "next/server";
import { finishOAuthLogin } from "@/lib/oauth/finish";
import { fetchVkUserInfo } from "@/lib/oauth/providers/vk";
import { createOAuthHandoff } from "@/lib/oauth/handoff";
import { createPendingOAuthRegistration } from "@/lib/oauth/storage";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import type { OAuthMode, OAuthTransaction } from "@/lib/oauth/types";

type NativeVkBody = {
  accessToken?: string;
  mode?: OAuthMode;
  returnTo?: string;
  sessionId?: string | null;
  acceptedTerms?: boolean;
  ageConfirmed?: boolean;
  marketingConsent?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "vk-native", 15);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const body = (await request.json()) as NativeVkBody;
    const accessToken = body.accessToken?.trim();
    const clientId = process.env.VK_ANDROID_CLIENT_ID?.trim();
    if (!accessToken || !clientId) {
      return NextResponse.json(
        { error: "native_vk_unavailable" },
        { status: 400, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const mode: OAuthMode = body.mode === "register" ? "register" : "login";
    const returnTo = sanitizeReturnTo(body.returnTo, "/");
    const info = await fetchVkUserInfo(accessToken, clientId);
    const pending: OAuthTransaction = {
      provider: "vk",
      codeVerifier: "",
      redirectUri: "",
      returnTo,
      sessionId: body.sessionId?.trim() || null,
      acceptedTerms: body.acceptedTerms === true,
      ageConfirmed: body.ageConfirmed === true,
      marketingConsent: body.marketingConsent === true,
      mode,
      appFlow: true,
    };

    try {
      const result = await finishOAuthLogin({
        provider: "vk",
        info,
        pending,
        request,
      });
      // Handoff fallback when WebView cookie from Set-Cookie is not visible yet.
      const handoff = await createOAuthHandoff(result.account.id);
      return NextResponse.json(
        {
          ok: true,
          returnTo,
          mode,
          isNewUser: result.isNewUser,
          needsProfile: result.needsProfile,
          hasProfile: Boolean(result.profile),
          handoff,
        },
        { headers: OAUTH_NO_STORE_HEADERS }
      );
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "CONSENT_REQUIRED") throw error;
      const registration = await createPendingOAuthRegistration({
        provider: "vk",
        info,
        returnTo,
        sessionId: pending.sessionId,
        appFlow: true,
      });
      return NextResponse.json(
        { ok: true, registration },
        { headers: OAUTH_NO_STORE_HEADERS }
      );
    }
  } catch (error) {
    console.error(
      "Native VK login failed:",
      error instanceof Error ? error.message : "native_vk_failed"
    );
    return NextResponse.json(
      { error: "native_vk_failed" },
      { status: 502, headers: OAUTH_NO_STORE_HEADERS }
    );
  }
}
