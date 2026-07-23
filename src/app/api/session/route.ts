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
  setSessionMemoryReadMode,
  updateSessionChatMeta,
} from "@/lib/session";

import { getInfluencerByToken, recordInfluencerClick } from "@/lib/influencers";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { resolveSessionForUser, assertSessionReadAccess } from "@/lib/session-access";
import { setSessionClaimCookie } from "@/lib/session-claim";
import { clientIp, enforceSessionCreateRateLimit } from "@/lib/api-guards";
import { parseNumerologToolParams, decodeNumerologSpreadId, getNumerologTool } from "@/lib/numerology/tools";
import { resolveMatrixAwareFreeQuestionLimit } from "@/lib/numerology/matrix-chat-allowance";
import { upsertSessionMemoryFromChat } from "@/lib/session-memory";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import { getUserById } from "@/lib/users";

async function resolveSessionFreeLimit(
  session: {
    user_id?: string | null;
    spread_id?: string | null;
  },
  profileUserId: string | null | undefined
): Promise<number> {
  const baseLimit = await getFreeQuestionLimit();
  let birthDate: string | null = null;
  const uid = profileUserId ?? session.user_id ?? null;
  if (uid) {
    try {
      const user = await getUserById(uid);
      birthDate = user?.birth_date ?? null;
    } catch {
      birthDate = null;
    }
  }
  return resolveMatrixAwareFreeQuestionLimit({
    baseLimit,
    profileUserId: uid,
    birthDate,
    spreadId: session.spread_id,
  });
}

function formatSession(
  session: {
    id: string;
    user_id?: string | null;
    referrer_slug: string | null;
    free_questions_used: number;
    paid_until: Date | null;
    has_single_unlock: boolean;
    memory_read_mode?: "default" | "fresh";
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
    memoryReadMode: session.memory_read_mode ?? "default",
  };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceSessionCreateRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

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
    const memoryReadMode =
      body.memoryReadMode === "default" || body.memoryReadMode === "fresh"
        ? body.memoryReadMode
        : undefined;
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
    const numerologToolParams =
      body.numerologToolParams && typeof body.numerologToolParams === "object"
        ? parseNumerologToolParams(body.numerologToolParams as Record<string, string | null>)
        : undefined;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const resolved = await resolveSessionForUser(sessionId, profileUserId);
    if (resolved.error) return resolved.error;

    if (memoryReadMode && profileUserId) {
      const updatedMode = await setSessionMemoryReadMode(
        sessionId,
        profileUserId,
        memoryReadMode
      );
      if (!updatedMode) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    }

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

    const chatMetaPatch: Parameters<typeof updateSessionChatMeta>[1] = {};
    if (characterKey !== undefined) chatMetaPatch.characterKey = characterKey;
    if (intention !== undefined) chatMetaPatch.intention = intention ?? null;
    if (spreadType !== undefined) chatMetaPatch.spreadType = spreadType ?? null;
    if (spreadId !== undefined) chatMetaPatch.spreadId = spreadId ?? null;
    if (cards !== undefined) chatMetaPatch.cards = cards ?? null;
    if (numerologToolParams !== undefined) {
      chatMetaPatch.numerologToolParams = numerologToolParams ?? null;
    }

    if (Object.keys(chatMetaPatch).length > 0) {
      await updateSessionChatMeta(sessionId, chatMetaPatch);

      const sessionAfterMeta = await getSession(sessionId);
      const numerologToolId = decodeNumerologSpreadId(
        spreadId ?? sessionAfterMeta?.spread_id ?? null
      );
      const effectiveCharacterKey = characterKey ?? sessionAfterMeta?.character_key;
      if (
        profileUserId &&
        numerologToolId &&
        effectiveCharacterKey &&
        isNumerologMaster(effectiveCharacterKey)
      ) {
        await upsertSessionMemoryFromChat({
          userId: profileUserId,
          sessionId,
          characterKey: effectiveCharacterKey,
          topicSummary: getNumerologTool(numerologToolId).label,
          keyCards: cards ?? sessionAfterMeta?.cards ?? [],
          prediction: "Сеанс в процессе",
        });
      }
    }

    const updated = await getSession(sessionId);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth.sub,
      profileUserId: updated.user_id,
    });

    const freeLimit = await resolveSessionFreeLimit(updated, profileUserId);
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
      const blocked = await assertSessionReadAccess(request, session, profileUserId);
      if (blocked) return blocked;
    } else {
      const blocked = await assertSessionReadAccess(request, session, null);
      if (blocked) return blocked;
    }

    const profileUserId =
      auth?.role === "user" ? await getProfileUserIdForAccount(auth.sub) : null;

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth?.role === "user" ? auth.sub : undefined,
      profileUserId: session.user_id,
    });

    const freeLimit = await resolveSessionFreeLimit(session, profileUserId);
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
