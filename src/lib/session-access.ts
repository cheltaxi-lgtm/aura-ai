import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession, getSession, type SessionRow } from "@/lib/session";
import {
  readSessionClaimCookie,
  setSessionClaimCookie,
  verifySessionClaimForId,
} from "@/lib/session-claim";

export async function linkSessionToProfile(sessionId: string, profileUserId: string): Promise<void> {
  await query(
    `UPDATE sessions SET user_id = $2, updated_at = NOW()
     WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [sessionId, profileUserId]
  );
}

export interface ResolveSessionOptions {
  /** Signed session claim from cookie; resolved automatically when omitted. */
  sessionClaim?: string | null;
}

async function resolveSessionClaim(opts?: ResolveSessionOptions): Promise<string | null> {
  if (opts && "sessionClaim" in opts) {
    return opts.sessionClaim ?? null;
  }
  return readSessionClaimCookie();
}

/**
 * Validates session access and optionally links orphan sessions to the authenticated profile.
 * Orphan sessions require a signed session-claim cookie minted at session creation —
 * knowing the UUID alone is not sufficient to hijack or attach a session.
 */
export async function resolveSessionForUser(
  sessionId: string | undefined,
  profileUserId: string | null,
  opts?: ResolveSessionOptions
): Promise<{ session: SessionRow | null; error: NextResponse | null }> {
  if (!sessionId) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "session_required", message: "Обновите страницу — сессия не найдена" },
        { status: 400 }
      ),
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "session_not_found" }, { status: 404 }),
    };
  }

  if (profileUserId) {
    if (session.user_id && session.user_id !== profileUserId) {
      return {
        session: null,
        error: NextResponse.json({ error: "session_forbidden" }, { status: 403 }),
      };
    }

    if (!session.user_id) {
      const claim = await resolveSessionClaim(opts);
      const ownsOrphan = await verifySessionClaimForId(sessionId, claim);
      if (!ownsOrphan) {
        console.warn("Rejected orphan session link attempt:", sessionId, profileUserId);
        return {
          session: null,
          error: NextResponse.json(
            {
              error: "session_forbidden",
              message: "Сессия не принадлежит этому аккаунту",
            },
            { status: 403 }
          ),
        };
      }

      await linkSessionToProfile(sessionId, profileUserId);
      const linked = await getSession(sessionId);
      return { session: linked ?? session, error: null };
    }
  }

  return { session, error: null };
}

/** Resolve, link, or create a DB session for authenticated chat persistence. */
export async function ensureChatSession(
  sessionId: string | undefined,
  profileUserId: string,
  opts?: { forceNew?: boolean; sessionClaim?: string | null }
): Promise<{ session: SessionRow | null; error: NextResponse | null; created: boolean }> {
  if (opts?.forceNew) {
    const created = await createSession(undefined, profileUserId);
    await setSessionClaimCookie(created.id);
    return { session: created, error: null, created: true };
  }

  if (sessionId) {
    const resolved = await resolveSessionForUser(sessionId, profileUserId, {
      sessionClaim: opts?.sessionClaim,
    });
    if (resolved.error) {
      return { session: null, error: resolved.error, created: false };
    }
    if (resolved.session) {
      return { session: resolved.session, error: null, created: false };
    }
  }

  const created = await createSession(undefined, profileUserId);
  await setSessionClaimCookie(created.id);
  return { session: created, error: null, created: true };
}
