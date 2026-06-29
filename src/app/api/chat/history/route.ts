import { NextRequest, NextResponse } from "next/server";

import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount, clearMasterChatData } from "@/lib/accounts";
import {
  getActiveSessionMessages,
  getSession,
  updateSessionChatMeta,
  type SessionRow,
} from "@/lib/session";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";
import { resolveMasterDeckSystem, spreadKey } from "@/lib/decks";
import { resolveSpreadSymbols, buildSessionSpreadCards } from "@/lib/intention-draw";
import { mergeSpreadReadingIntoMessages } from "@/lib/chat-history-merge";
import { findStoredSpreadReading } from "@/lib/session-spread-reading";
import {
  ensureSpreadReadingInChatMessages,
  sessionHasSpreadReadingMessage,
} from "@/lib/spread-reading-persist";
import { getSpread, hasCompleteSpread, normalizeSpreadId } from "@/lib/spreads";

const DEFAULT_HISTORY_LIMIT = 50;
const HISTORY_PAGE_MAX = 200;

type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

function mapMessageRows(
  rows: { id: string; role: string; content: string; created_at: Date }[]
): HistoryMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    timestamp: row.created_at.toISOString(),
  }));
}

function spreadFromSession(session: SessionRow, characterId: string) {
  const cards = session.cards ?? [];
  const masterKey = session.character_key ?? characterId;
  const spreadId = normalizeSpreadId(session.spread_id);
  const required = getSpread(spreadId).cardCount;
  if (!hasCompleteSpread(cards, spreadId, session.spread_type) || !masterKey) return null;
  const system = resolveMasterDeckSystem(masterKey);
  let symbols = resolveSpreadSymbols(system, cards);
  if (symbols.length < required) {
    const built = buildSessionSpreadCards(masterKey, cards, {
      deckSystem: system,
      cardCount: required,
    });
    symbols = built.spreadCards;
  }
  if (symbols.length < required) return null;
  const spreadType =
    session.spread_type === "daily"
      ? "reading"
      : session.intention
        ? "intention_spread"
        : "reading";
  return {
    cards: symbols,
    system,
    type: spreadType,
    cardsKey: spreadKey(symbols),
    intention: session.intention ?? null,
    spreadId,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawMasterId =
    request.nextUrl.searchParams.get("masterId") ??
    request.nextUrl.searchParams.get("characterId");
  const archiveSessionId = request.nextUrl.searchParams.get("archiveSessionId");
  const requestedSessionId = request.nextUrl.searchParams.get("sessionId");
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_HISTORY_LIMIT);
  const historyLimit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), HISTORY_PAGE_MAX)
    : DEFAULT_HISTORY_LIMIT;

  if (!rawMasterId) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 });
  }

  let characterId: string;
  try {
    characterId = await resolveApiCharacterId(rawMasterId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid masterId";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ messages: [], pastSessions: [] });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let sessionRow: SessionRow | null = null;

  if (archiveSessionId) {
    const archived = await getSession(archiveSessionId);
    if (
      archived &&
      archived.user_id === profileUserId &&
      (archived.status ?? "active") === "completed"
    ) {
      sessionRow = archived;
    }
  } else if (requestedSessionId) {
    const hinted = await getSession(requestedSessionId);
    if (hinted && hinted.user_id === profileUserId) {
      if (!hinted.character_key || hinted.character_key === characterId) {
        sessionRow = hinted;
        if (!hinted.character_key) {
          await updateSessionChatMeta(hinted.id, { characterKey: characterId });
        }
      }
    }
  }

  if (!sessionRow) {
    const { rows } = await query<SessionRow>(
      `SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
              COALESCE(awaiting_context, false) AS awaiting_context,
              character_key, intention, spread_type, spread_id, cards,
              COALESCE(status, 'active') AS status, created_at, updated_at
       FROM sessions
       WHERE user_id = $1
         AND character_key = $2
         AND COALESCE(status, 'active') = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [profileUserId, characterId]
    );
    sessionRow = rows[0] ?? null;
  }

  if (!sessionRow) {
    const { rows } = await query<SessionRow>(
      `SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
              COALESCE(awaiting_context, false) AS awaiting_context,
              character_key, intention, spread_type, spread_id, cards,
              COALESCE(status, 'active') AS status, created_at, updated_at
       FROM sessions s
       WHERE s.user_id = $1
         AND COALESCE(s.status, 'active') = 'active'
         AND EXISTS (
           SELECT 1 FROM chat_messages cm
           WHERE cm.session_id = s.id AND cm.character_id = $2
         )
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [profileUserId, characterId]
    );
    sessionRow = rows[0] ?? null;
  }

  if (!sessionRow) {
    return NextResponse.json({
      sessionId: null,
      intention: null,
      spreadType: null,
      cards: null,
      status: null,
      messages: [],
      pastSessions: [],
      hasMore: false,
      spread: null,
    });
  }

  const messageCharacterId = characterId;
  let messageRows = await getActiveSessionMessages(
    profileUserId,
    messageCharacterId,
    sessionRow.id,
    historyLimit + 1
  );

  const hasMore = messageRows.length > historyLimit;
  const slice = hasMore ? messageRows.slice(0, historyLimit) : messageRows;
  let messages = mapMessageRows(slice);

  const spread =
    !sessionRow.character_key || sessionRow.character_key === characterId
      ? spreadFromSession(sessionRow, characterId)
      : null;

  if (!sessionRow.character_key || sessionRow.character_key === characterId) {
    const spreadReading = await findStoredSpreadReading(
      profileUserId,
      messageCharacterId,
      sessionRow
    );

    if (
      spreadReading &&
      !(await sessionHasSpreadReadingMessage(
        sessionRow.id,
        messageCharacterId,
        profileUserId
      ))
    ) {
      await ensureSpreadReadingInChatMessages({
        sessionId: sessionRow.id,
        profileUserId,
        characterId: messageCharacterId,
        reading: spreadReading,
        tarotCards: sessionRow.cards?.map((name) => ({ name })),
        intention: sessionRow.intention ?? undefined,
        spreadType:
          sessionRow.spread_type === "daily" || sessionRow.spread_type === "new"
            ? sessionRow.spread_type
            : undefined,
        spreadId: sessionRow.spread_id ?? undefined,
      });
      messageRows = await getActiveSessionMessages(
        profileUserId,
        messageCharacterId,
        sessionRow.id,
        historyLimit + 1
      );
      messages = mapMessageRows(
        messageRows.length > historyLimit
          ? messageRows.slice(0, historyLimit)
          : messageRows
      );
    } else if (spreadReading) {
      messages = mergeSpreadReadingIntoMessages(
        messages,
        spreadReading,
        sessionRow.created_at
      );
    }
  }

  return NextResponse.json({
    sessionId: sessionRow.id,
    intention: sessionRow.intention ?? null,
    spreadType: sessionRow.spread_type ?? null,
    spreadId: sessionRow.spread_id ?? null,
    cards: sessionRow.cards ?? null,
    status: sessionRow.status ?? "active",
    messages,
    pastSessions: [],
    hasMore,
    spread,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawMasterId =
    request.nextUrl.searchParams.get("masterId") ??
    request.nextUrl.searchParams.get("characterId");
  if (!rawMasterId) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let characterId: string;
  try {
    characterId = await resolveApiCharacterId(rawMasterId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid masterId";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { messagesDeleted, historyDeleted } = await clearMasterChatData(
    profileUserId,
    characterId
  );
  return NextResponse.json({ ok: true, deleted: messagesDeleted, historyDeleted });
}
