import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled, oauthAbsoluteUrl } from "@/lib/oauth/config";
import { finishOAuthLogin, oauthErrorRedirect } from "@/lib/oauth/finish";
import { createOAuthHandoff } from "@/lib/oauth/handoff";
import { exchangeProviderCode } from "@/lib/oauth/providers";
import {
  consumeOAuthTransaction,
  createPendingOAuthRegistration,
} from "@/lib/oauth/storage";
import { parseOAuthCallbackParams } from "@/lib/oauth/callback-params";
import type { OAuthProvider } from "@/lib/oauth/types";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { buildAppOAuthCompleteUrl } from "@/lib/oauth/app-return";

type RouteParams = { params: Promise<{ provider: string }> };

function redirectNoStore(url: string | URL) {
  return NextResponse.redirect(url, { headers: OAUTH_NO_STORE_HEADERS });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const fallbackReturn = "/";
  let mode: "login" | "register" = "login";
  let returnTo = fallbackReturn;

  try {
    const rate = await checkOAuthRequestRateLimit(request, "callback", 40);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...OAUTH_NO_STORE_HEADERS,
            "Retry-After": String(rate.retryAfterSec ?? 60),
          },
        }
      );
    }
    if (!(await ensureDb())) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("db_unavailable", mode, fallbackReturn))
      );
    }

    const { provider: rawProvider } = await params;
    if (!isOAuthProviderEnabled(rawProvider)) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("provider_unavailable", mode, fallbackReturn))
      );
    }
    const provider = rawProvider as OAuthProvider;

    const url = request.nextUrl;
    const callbackParams = parseOAuthCallbackParams(provider, url);
    const code = callbackParams.code;
    const state = callbackParams.state;
    const providerError = callbackParams.error;

    const pending = state ? await consumeOAuthTransaction(state) : null;
    mode = pending?.mode ?? "login";
    returnTo = sanitizeReturnTo(pending?.returnTo, fallbackReturn);

    if (providerError || !code || !state) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("provider_denied", mode, returnTo))
      );
    }

    if (!pending || pending.provider !== provider) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("state_mismatch", mode, returnTo))
      );
    }

    const deviceId = callbackParams.deviceId?.trim() || undefined;
    if (provider === "vk" && !deviceId) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("vk_device_id_required", mode, returnTo))
      );
    }
    const info = await exchangeProviderCode(
      provider,
      code,
      pending.codeVerifier,
      pending.redirectUri,
      { deviceId, state: state ?? undefined }
    );
    let result;
    try {
      result = await finishOAuthLogin({
        provider,
        info,
        pending,
        request,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CONSENT_REQUIRED") {
        const registration = await createPendingOAuthRegistration({
          provider,
          info,
          returnTo,
          sessionId: pending.sessionId,
          appFlow: pending.appFlow,
          registrationAttribution: pending.registrationAttribution ?? null,
        });
        const completePath = `/auth/oauth/complete?registration=${encodeURIComponent(registration)}`;
        return redirectNoStore(
          pending.appFlow
            ? buildAppOAuthCompleteUrl(completePath)
            : oauthAbsoluteUrl(request, completePath)
        );
      }
      throw error;
    }

    const completeParams = new URLSearchParams({
      returnTo,
      mode,
      new: result.isNewUser ? "1" : "0",
      needsProfile: result.needsProfile ? "1" : "0",
    });
    if (result.profile) completeParams.set("hasProfile", "1");

    // Always mint a one-time handoff. Cookie from the callback hop is sometimes
    // invisible to the next document in Yandex Browser; handoff recovers /me.
    const handoff = await createOAuthHandoff(result.account.id);

    // App deep links: handoff in query (Android strips URL fragments from
    // custom-scheme intents). Browser: fragment avoids Referer leakage.
    let completePath: string;
    if (pending.appFlow) {
      completeParams.set("handoff", handoff);
      completePath = `/auth/oauth/complete?${completeParams.toString()}`;
    } else {
      completePath = `/auth/oauth/complete?${completeParams.toString()}#handoff=${encodeURIComponent(handoff)}`;
    }

    return redirectNoStore(
      pending.appFlow
        ? buildAppOAuthCompleteUrl(completePath)
        : oauthAbsoluteUrl(request, completePath)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    console.error("OAuth callback failed:", message);

    let code = "oauth_failed";
    if (message === "vk_device_id_required") code = "vk_device_id_required";

    return redirectNoStore(oauthAbsoluteUrl(request, oauthErrorRedirect(code, mode, returnTo)));
  }
}
