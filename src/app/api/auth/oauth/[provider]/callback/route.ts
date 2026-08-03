import { NextRequest, NextResponse } from "next/server";
import { applyAuthCookie, getAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { isOAuthProviderEnabled, oauthAbsoluteUrl } from "@/lib/oauth/config";
import { finishOAuthLogin, oauthErrorRedirect } from "@/lib/oauth/finish";
import { createOAuthHandoff } from "@/lib/oauth/handoff";
import { exchangeProviderCode } from "@/lib/oauth/providers";
import {
  consumeOAuthTransaction,
  createPendingOAuthRegistration,
  getOAuthTransaction,
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

function completePathFor(
  returnTo: string,
  mode: "login" | "register" | "link",
  flags?: { isNewUser?: boolean; needsProfile?: boolean; hasProfile?: boolean }
): string {
  if (mode === "link") {
    const dest = returnTo.startsWith("/cabinet") ? returnTo.split("#")[0]! : "/cabinet";
    const params = new URLSearchParams({ loginMethods: "1", linked: "1" });
    return `${dest}${dest.includes("?") ? "&" : "?"}${params.toString()}`;
  }
  const completeParams = new URLSearchParams({
    returnTo,
    mode,
    new: flags?.isNewUser ? "1" : "0",
    needsProfile: flags?.needsProfile ? "1" : "0",
  });
  if (flags?.hasProfile) completeParams.set("hasProfile", "1");
  return `/auth/oauth/complete?${completeParams.toString()}`;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const fallbackReturn = "/";
  let mode: "login" | "register" | "link" = "login";
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

    // Prefer raw request.url — NextURL.search can already turn VK `+` into spaces.
    const callbackParams = parseOAuthCallbackParams(provider, request.url);
    const code = callbackParams.code;
    const state = callbackParams.state;
    const providerError = callbackParams.error;
    const deviceId = callbackParams.deviceId?.trim() || undefined;

    // Validate VK device_id before burning the one-time state — otherwise the user
    // must click Allow again on a fresh OAuth start (looks like a double consent).
    if (provider === "vk" && code && state && !providerError && !deviceId) {
      const peeked = await getOAuthTransaction(state);
      mode = peeked?.mode ?? mode;
      returnTo = sanitizeReturnTo(peeked?.returnTo, returnTo);
      return redirectNoStore(
        oauthAbsoluteUrl(
          request,
          oauthErrorRedirect("vk_device_id_required", mode, returnTo)
        )
      );
    }

    const pending = state ? await consumeOAuthTransaction(state) : null;
    mode = pending?.mode ?? "login";
    returnTo = sanitizeReturnTo(pending?.returnTo, fallbackReturn);

    if (providerError || !code || !state) {
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("provider_denied", mode, returnTo))
      );
    }

    if (!pending || pending.provider !== provider) {
      // Duplicate callback after a successful first hop — cookie may already be set.
      const auth = await getAuth();
      if (auth?.role === "user") {
        return redirectNoStore(
          oauthAbsoluteUrl(request, completePathFor(returnTo, mode))
        );
      }
      return redirectNoStore(
        oauthAbsoluteUrl(request, oauthErrorRedirect("state_mismatch", mode, returnTo))
      );
    }

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
      if (error instanceof Error && error.message === "PROVIDER_TAKEN") {
        return redirectNoStore(
          oauthAbsoluteUrl(request, oauthErrorRedirect("provider_taken", mode, returnTo))
        );
      }
      if (
        error instanceof Error &&
        (error.message === "LINK_SESSION_REQUIRED" || error.message === "LINK_ACCOUNT_REQUIRED")
      ) {
        return redirectNoStore(
          oauthAbsoluteUrl(request, oauthErrorRedirect("auth_required", mode, returnTo))
        );
      }
      if (error instanceof Error && error.message === "CONSENT_REQUIRED") {
        if (pending.mode === "link") {
          return redirectNoStore(
            oauthAbsoluteUrl(request, oauthErrorRedirect("consent_required", mode, returnTo))
          );
        }
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

    const completePath = completePathFor(returnTo, mode, {
      isNewUser: result.isNewUser,
      needsProfile: result.needsProfile,
      hasProfile: Boolean(result.profile),
    });

    // App / WebView still needs the handoff deep-link + document bridge.
    if (pending.appFlow) {
      const handoff = await createOAuthHandoff(result.account.id);
      return redirectNoStore(
        buildAppOAuthCompleteUrl(
          `${completePath}&handoff=${encodeURIComponent(handoff)}`
        )
      );
    }

    // Web: one document hop from VK → complete with Set-Cookie.
    // Extra session-bridge hop raced with duplicate callbacks and bounced
    // returning users to the login form after the second Allow.
    const response = NextResponse.redirect(oauthAbsoluteUrl(request, completePath), {
      headers: OAUTH_NO_STORE_HEADERS,
    });
    await applyAuthCookie(
      response,
      {
        sub: result.account.id,
        role: "user",
        email: result.account.email,
        name: result.account.name,
      },
      request
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    console.error("OAuth callback failed:", message);

    // Duplicate callback (double Allow / prefetch) after a successful first exchange:
    // cookie is already set — continue instead of bouncing to the login form.
    const auth = await getAuth();
    if (auth?.role === "user") {
      return redirectNoStore(
        oauthAbsoluteUrl(request, completePathFor(returnTo, mode))
      );
    }

    let code = "oauth_failed";
    if (message === "vk_device_id_required") code = "vk_device_id_required";
    else if (/device_id is invalid/i.test(message)) code = "vk_device_id_invalid";
    else if (/vk_token_failed|invalid_client|invalid_grant|service_token|Invalid code/i.test(message)) {
      code = "oauth_failed";
    }

    return redirectNoStore(oauthAbsoluteUrl(request, oauthErrorRedirect(code, mode, returnTo)));
  }
}
