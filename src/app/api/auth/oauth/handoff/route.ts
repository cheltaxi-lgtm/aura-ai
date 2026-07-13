import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";
import { findUserById } from "@/lib/accounts";
import { consumeOAuthHandoff } from "@/lib/oauth/handoff";
import {
  checkOAuthRequestRateLimit,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/request-security";

export async function POST(request: NextRequest) {
  try {
    const rate = await checkOAuthRequestRateLimit(request, "handoff", 15);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: OAUTH_NO_STORE_HEADERS }
      );
    }
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json(
        { error: "missing_token" },
        { status: 400, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    const accountId = await consumeOAuthHandoff(token);
    if (!accountId) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers: OAUTH_NO_STORE_HEADERS }
      );
    }
    const account = await findUserById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers: OAUTH_NO_STORE_HEADERS }
      );
    }

    await setAuthCookie(
      {
        sub: account.id,
        role: "user",
        email: account.email,
        name: account.name,
      },
      request
    );

    return NextResponse.json({ ok: true }, { headers: OAUTH_NO_STORE_HEADERS });
  } catch (error) {
    console.error("OAuth handoff error:", error);
    return NextResponse.json(
      { error: "handoff_failed" },
      { status: 500, headers: OAUTH_NO_STORE_HEADERS }
    );
  }
}
