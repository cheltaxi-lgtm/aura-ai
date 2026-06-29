import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";

import { getAuth } from "@/lib/auth";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";

import {
  createSession,
  getSession,
  hasPaidAccess,
  canSendChatMessage,
  questionsRemaining,
  updateSessionReferrer,
  getFreeQuestionLimit,
  setSessionAwaitingContext,
  updateSessionChatMeta,
} from "@/lib/session";

import { getInfluencerByToken, recordInfluencerClick } from "@/lib/influencers";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { resolveSessionForUser } from "@/lib/session-access";
import { setSessionClaimCookie } from "@/lib/session-claim";

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
  freeLimit = 2,
  ownerMismatch = false
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
    ownerMismatch,
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
    } else if (!auth) {
      const ageOk = await isAgeGateCookieConfirmed(request);
      if (!ageOk) {
        return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
      }
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

    await setSessionClaimCookie(session.id);

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
    const awaitingContext = body.awaitingContext as boolean | undefined;
    const characterKey =
      typeof body.characterKey === "string" ? body.characterKey.trim() : undefined;
    const intention =
      typeof body.intention === "string" ? body.intention.trim() : undefined;
    const spreadType =
      typeof body.spreadType === "string" ? body.spreadType.trim() : undefined;
    const spreadId =
      typeof body.spreadId === "string" ? body.spreadId.trim() : undefined;
    const cards = Array.isArray(body.cards)
      ? body.cards.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => c.trim())
      : undefined;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const resolved = await resolveSessionForUser(sessionId, profileUserId);
    if (resolved.error) return resolved.error;

    const hasReferrerUpdate = Object.prototype.hasOwnProperty.call(body, "referrerSlug");
    if (hasReferrerUpdate) {
      const session = await updateSessionReferrer(sessionId, referrerSlug);
      if (!session) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    if (typeof awaitingContext === "boolean") {
      await setSessionAwaitingContext(sessionId, awaitingContext);
    }

    if (
      characterKey !== undefined ||
      intention !== undefined ||
      spreadType !== undefined ||
      spreadId !== undefined ||
      cards !== undefined
    ) {
      await updateSessionChatMeta(sessionId, {
        characterKey,
        intention: intention ?? null,
        spreadType: spreadType ?? null,
        spreadId: spreadId ?? null,
        cards: cards ?? null,
      });
    }

    const updated = await getSession(sessionId);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth.sub,
      profileUserId: updated.user_id,
    });

    const freeLimit = await getFreeQuestionLimit();
    return NextResponse.json(formatSession(updated, unlimited, freeLimit));
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

    if (session.user_id) {
      if (!auth || auth.role !== "user") {
        return NextResponse.json({ error: "auth_required" }, { status: 401 });
      }
      const profileUserId = await getProfileUserIdForAccount(auth.sub);
      if (!profileUserId || session.user_id !== profileUserId) {
        return NextResponse.json({ error: "session_forbidden" }, { status: 403 });
      }
    }

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth?.role === "user" ? auth.sub : undefined,
      profileUserId: session.user_id,
    });

    const freeLimit = await getFreeQuestionLimit();
    const payload = formatSession(session, unlimited, freeLimit, false);
    if (!session.user_id) {
      return NextResponse.json({
        ...payload,
        paidUntil: undefined,
      });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Session get error:", error);
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }
}
