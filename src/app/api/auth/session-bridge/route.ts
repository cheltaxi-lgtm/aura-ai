import { NextRequest, NextResponse } from "next/server";
import { applyAuthCookie, getAuth, verifyToken } from "@/lib/auth";
import { findUserById } from "@/lib/accounts";
import { createOAuthHandoff, consumeOAuthHandoff } from "@/lib/oauth/handoff";
import { resolveOAuthOrigin } from "@/lib/oauth/config";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

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
        { status: 429, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const cookieToken = request.cookies.get("aura_auth")?.value;
    const auth = cookieToken ? await verifyToken(cookieToken) : await getAuth();
    if (!auth || auth.role !== "user") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const token = await createOAuthHandoff(auth.sub);
    return NextResponse.json({ ok: true, token }, { headers: OAUTH_NO_STORE_HEADERS });
  } catch (error) {
    console.error("session-bridge mint failed:", error);
    return NextResponse.json(
      { error: "mint_failed" },
      { status: 500, headers: OAUTH_NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "session-bridge", 30);
    if (!rate.allowed) {
      return NextResponse.redirect(
        new URL("/auth/user/login?app=1", `${resolveOAuthOrigin(request)}/`),
        { headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    const to = sanitizeReturnTo(request.nextUrl.searchParams.get("to"), "/?app=1");
    const origin = resolveOAuthOrigin(request);
    const loginUrl = new URL("/auth/user/login", `${origin}/`);
    loginUrl.searchParams.set("app", "1");
    loginUrl.searchParams.set("returnTo", to);

    if (!token) {
      return NextResponse.redirect(loginUrl, { headers: OAUTH_NO_STORE_HEADERS });
    }

    const accountId = await consumeOAuthHandoff(token);
    if (!accountId) {
      return NextResponse.redirect(loginUrl, { headers: OAUTH_NO_STORE_HEADERS });
    }

    const account = await findUserById(accountId);
    if (!account) {
      return NextResponse.redirect(loginUrl, { headers: OAUTH_NO_STORE_HEADERS });
    }

    const destination = new URL(to, `${origin}/`);
    if (!destination.searchParams.has("app")) {
      destination.searchParams.set("app", "1");
    }

    const response = NextResponse.redirect(destination, { headers: OAUTH_NO_STORE_HEADERS });
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
      new URL("/auth/user/login?app=1", `${resolveOAuthOrigin(request)}/`),
      { headers: OAUTH_NO_STORE_HEADERS }
    );
  }
}
