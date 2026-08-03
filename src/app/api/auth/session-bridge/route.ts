import { NextRequest, NextResponse } from "next/server";
import { applyAuthCookie, getAuth } from "@/lib/auth";
import { findUserById } from "@/lib/accounts";
import { createOAuthHandoff, consumeOAuthHandoff } from "@/lib/oauth/handoff";
import { resolveOAuthOrigin } from "@/lib/oauth/config";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { sanitizeReturnToWithOrigin } from "@/lib/safe-redirect";

const BRIDGE_HEADERS = {
  ...OAUTH_NO_STORE_HEADERS,
  "Referrer-Policy": "no-referrer",
} as const;

function sessionBridgeLoginUrl(request: NextRequest, oauthError?: string): URL {
  const origin = resolveOAuthOrigin(request);
  const to = sanitizeReturnToWithOrigin(
    request.nextUrl.searchParams.get("to"),
    origin,
    "/"
  );
  const destination = new URL(to, `${origin}/`);
  const mode = destination.searchParams.get("mode");
  const authBase =
    mode === "register" ? "/auth/user/register" : "/auth/user/login";
  const loginUrl = new URL(authBase, `${origin}/`);
  if (destination.searchParams.get("app") === "1") {
    loginUrl.searchParams.set("app", "1");
  }
  loginUrl.searchParams.set("returnTo", to);
  if (oauthError) loginUrl.searchParams.set("oauthError", oauthError);
  return loginUrl;
}

/** Cookie already visible (callback Set-Cookie or prior bridge hit) — continue. */
async function redirectIfAlreadyAuthenticated(
  destination: URL
): Promise<NextResponse | null> {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") return null;
  return NextResponse.redirect(destination, { headers: BRIDGE_HEADERS });
}

/**
 * POST: mint a one-time handoff from the current XHR session (cookie visible to fetch).
 * GET: consume handoff and redirect with Set-Cookie on the document response.
 *
 * Fixes Android WebView: fetch Set-Cookie is often invisible to the next full navigation
 * (Cabinet / hard-nav), so users look logged-in on home then see login again.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "session-bridge-mint", 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: BRIDGE_HEADERS }
      );
    }

    // Must use getAuth() (token_version check) — never bare verifyToken,
    // or a post-reset stolen cookie can mint a fresh handoff session.
    const auth = await getAuth();
    if (!auth || auth.role !== "user") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: BRIDGE_HEADERS }
      );
    }

    const token = await createOAuthHandoff(auth.sub);
    return NextResponse.json({ ok: true, token }, { headers: BRIDGE_HEADERS });
  } catch (error) {
    console.error("session-bridge mint failed:", error);
    return NextResponse.json(
      { error: "mint_failed" },
      { status: 500, headers: BRIDGE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "session-bridge", 30);
    const origin = resolveOAuthOrigin(request);
    const to = sanitizeReturnToWithOrigin(
      request.nextUrl.searchParams.get("to"),
      origin,
      "/"
    );
    const destination = new URL(to, `${origin}/`);

    if (!rate.allowed) {
      const already = await redirectIfAlreadyAuthenticated(destination);
      if (already) return already;
      return NextResponse.redirect(
        sessionBridgeLoginUrl(request, "session_lost"),
        { headers: BRIDGE_HEADERS }
      );
    }

    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    const loginUrl = sessionBridgeLoginUrl(request, "session_lost");

    if (!token) {
      const already = await redirectIfAlreadyAuthenticated(destination);
      if (already) return already;
      return NextResponse.redirect(loginUrl, { headers: BRIDGE_HEADERS });
    }

    const accountId = await consumeOAuthHandoff(token);
    if (!accountId) {
      // Duplicate document hit (prefetch / double 302) after a successful first
      // consume: cookie from finishOAuthLogin or the first bridge is enough.
      const already = await redirectIfAlreadyAuthenticated(destination);
      if (already) return already;
      return NextResponse.redirect(loginUrl, { headers: BRIDGE_HEADERS });
    }

    const account = await findUserById(accountId);
    if (!account) {
      return NextResponse.redirect(loginUrl, { headers: BRIDGE_HEADERS });
    }

    const response = NextResponse.redirect(destination, { headers: BRIDGE_HEADERS });
    await applyAuthCookie(
      response,
      {
        sub: account.id,
        role: "user",
        email: account.email,
        name: account.name,
      },
      request
    );
    return response;
  } catch (error) {
    console.error("session-bridge redirect failed:", error);
    return NextResponse.redirect(
      sessionBridgeLoginUrl(request, "session_lost"),
      { headers: BRIDGE_HEADERS }
    );
  }
}
