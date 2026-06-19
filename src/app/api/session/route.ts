import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";

import { getAuth } from "@/lib/auth";

import {
  createSession,
  getSession,
  hasPaidAccess,
  canSendChatMessage,
  questionsRemaining,
  updateSessionReferrer,
  getFreeQuestionLimit,
} from "@/lib/session";

import { getInfluencerByToken, recordInfluencerClick } from "@/lib/influencers";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { resolveSessionForUser } from "@/lib/session-access";

function formatSession(
  session: {
    id: string;
    user_id?: string | null;
    referrer_slug: string | null;
    free_questions_used: number;
    paid_until: Date | null;
    has_single_unlock: boolean;
  },
  unlimited = false,
  freeLimit = 2
) {
  const accessOpts = { unlimited, limit: freeLimit };
  const accessSession = session as import("@/lib/session").SessionRow;
  return {
    sessionId: session.id,
    freeQuestionsUsed: session.free_questions_used,
    freeLimit,
    hasAccess: hasPaidAccess(accessSession, accessOpts),
    canChat: canSendChatMessage(accessSession, accessOpts),
    questionsRemaining: questionsRemaining(accessSession, accessOpts),
    paidUntil: session.paid_until,
    referrerSlug: session.referrer_slug,
    isUnlimited: unlimited,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    const body = await request.json().catch(() => ({}));
    const referrerSlug = body.referrerSlug as string | undefined;
    const influencerToken = body.influencerToken as string | undefined;

    if (!(await ensureDb())) {
      const freeLimit = await getFreeQuestionLimit();
      return NextResponse.json({
        sessionId: crypto.randomUUID(),
        offline: true,
        freeQuestionsUsed: 0,
        freeLimit,
        hasAccess: false,
        canChat: false,
        questionsRemaining: 0,
      });
    }

    let slug = referrerSlug;
    if (influencerToken) {
      const influencer = await getInfluencerByToken(influencerToken);
      if (influencer) slug = influencer.token;
    }

    let profileUserId: string | undefined;
    let accountId: string | undefined;
    if (auth?.role === "user") {
      accountId = auth.sub;
      profileUserId = (await getProfileUserIdForAccount(auth.sub)) ?? undefined;
    }

    const unlimited = await resolveUnlimitedAccess({
      accountId,
      profileUserId,
    });

    const freeLimit = await getFreeQuestionLimit();
    const session = await createSession(
      slug,
      profileUserId,
      influencerToken
    );

    if (influencerToken) {
      const influencer = await getInfluencerByToken(influencerToken);
      if (influencer) {
        await recordInfluencerClick(influencer.id, session.id);
      }
    }

    return NextResponse.json(formatSession(session, unlimited, freeLimit));
  } catch (error) {
    console.error("Session create error:", error);
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = body.sessionId as string | undefined;
    const referrerSlug =
      body.referrerSlug === null || body.referrerSlug === undefined
        ? null
        : String(body.referrerSlug);

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const resolved = await resolveSessionForUser(sessionId, profileUserId);
    if (resolved.error) return resolved.error;

    const session = await updateSessionReferrer(sessionId, referrerSlug);
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth.sub,
      profileUserId: session.user_id,
    });

    const freeLimit = await getFreeQuestionLimit();
    return NextResponse.json(formatSession(session, unlimited, freeLimit));
  } catch (error) {
    console.error("Session patch error:", error);
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    if (!(await ensureDb())) {
      const freeLimit = await getFreeQuestionLimit();
      return NextResponse.json({
        sessionId,
        offline: true,
        hasAccess: false,
        canChat: false,
        freeQuestionsUsed: 0,
        freeLimit,
        questionsRemaining: 0,
      });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await getAuth();
    const unlimited = await resolveUnlimitedAccess({
      accountId: auth?.role === "user" ? auth.sub : undefined,
      profileUserId: session.user_id,
    });

    const freeLimit = await getFreeQuestionLimit();
    return NextResponse.json(formatSession(session, unlimited, freeLimit));
  } catch (error) {
    console.error("Session get error:", error);
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }
}
