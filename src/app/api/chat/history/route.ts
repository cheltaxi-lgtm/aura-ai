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
import { findStoredSpreadReadingWithMeta } from "@/lib/session-spread-reading";
import {
  ensureSpreadReadingInChatMessages,
  sessionHasSpreadReadingMessage,
} from "@/lib/spread-reading-persist";
import { getSpread, hasCompleteSpread, normalizeSpreadId } from "@/lib/spreads";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  buildNumerologSpreadCards,
  decodeNumerologSpreadId,
  encodeNumerologSpreadId,
  numerologSpreadComplete,
} from "@/lib/numerology/tools";

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
  if (!masterKey || !cards.length) return null;

  const numerologToolId = decodeNumerologSpreadId(session.spread_id);
  if (numerologToolId && isNumerologMaster(masterKey)) {
    if (!numerologSpreadComplete(cards, numerologToolId)) return null;
    const { spreadCards, system } = buildNumerologSpreadCards(
      masterKey,
      cards,
      numerologToolId
    );
    return {
      cards: spreadCards,
      system,
      type: "reading" as const,
      cardsKey: spreadKey(spreadCards),
      intention: null,
      spreadId: session.spread_id ?? encodeNumerologSpreadId(numerologToolId),
    };
  }

  const spreadId = normalizeSpreadId(session.spread_id);
  const required = getSpread(spreadId).cardCount;
  if (!hasCompleteSpread(cards, spreadId, session.spread_type)) return null;
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
              character_key, intention, spread_type, spread_id, cards, numerolog_tool_params,
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
              character_key, intention, spread_type, spread_id, cards, numerolog_tool_params,
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
    const spreadReadingMeta = await findStoredSpreadReadingWithMeta(
      profileUserId,
      messageCharacterId,
      sessionRow
    );

    if (
      spreadReadingMeta &&
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
        reading: spreadReadingMeta.reading,
        customQuestion: spreadReadingMeta.customQuestion,
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
    } else if (spreadReadingMeta) {
      messages = mergeSpreadReadingIntoMessages(
        messages,
        spreadReadingMeta.reading,
        sessionRow.created_at
      );
    }
  }

  const numerologToolId = decodeNumerologSpreadId(sessionRow.spread_id);
  let numerologToolParams = sessionRow.numerolog_tool_params ?? null;
  let matrixSubjectId: string | null =
    typeof numerologToolParams?.matrixSubjectId === "string"
      ? numerologToolParams.matrixSubjectId
      : null;
  let matrixBirthDate: string | null =
    typeof numerologToolParams?.matrixBirthDate === "string"
      ? numerologToolParams.matrixBirthDate
      : null;
  let subjectName: string | null =
    typeof numerologToolParams?.subjectName === "string"
      ? numerologToolParams.subjectName
      : null;
  let subjectKind: string | null = null;

  // Reopen must use the report's subject birth — profile DOB would show "my" grid for everyone.
  if (
    numerologToolId === "destiny_matrix" ||
    numerologToolId === "child_matrix" ||
    numerologToolId === "matrix_year_forecast"
  ) {
    try {
      const { rows: reportRows } = await query<{
        subject_id: string | null;
        birth_date: Date | string;
        display_name: string | null;
        kind: string | null;
      }>(
        `SELECT n.subject_id, n.birth_date, s.display_name, s.kind
         FROM numerology_report_history n
         LEFT JOIN matrix_subjects s ON s.id = n.subject_id
         WHERE n.user_id = $1
           AND n.session_id = $2::uuid
           AND n.tool_id = $3
           AND length(trim(n.content)) > 0
         ORDER BY n.created_at DESC
         LIMIT 1`,
        [profileUserId, sessionRow.id, numerologToolId]
      );
      const report = reportRows[0];
      if (report) {
        const birth =
          typeof report.birth_date === "string"
            ? report.birth_date.slice(0, 10)
            : `${report.birth_date.getUTCFullYear()}-${String(report.birth_date.getUTCMonth() + 1).padStart(2, "0")}-${String(report.birth_date.getUTCDate()).padStart(2, "0")}`;
        matrixSubjectId = report.subject_id ?? matrixSubjectId;
        matrixBirthDate = birth || matrixBirthDate;
        subjectName = report.display_name ?? subjectName;
        subjectKind = report.kind;
        numerologToolParams = {
          ...(numerologToolParams ?? {}),
          ...(matrixSubjectId ? { matrixSubjectId } : {}),
          ...(matrixBirthDate ? { matrixBirthDate } : {}),
          ...(subjectName ? { subjectName } : {}),
        };
        // Backfill legacy sessions that never stored subject params.
        if (!sessionRow.numerolog_tool_params?.matrixBirthDate && matrixBirthDate) {
          void updateSessionChatMeta(sessionRow.id, {
            numerologToolParams,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[chat/history] matrix subject enrich failed:", err);
    }
  }

  return NextResponse.json({
    sessionId: sessionRow.id,
    intention: sessionRow.intention ?? null,
    spreadType: sessionRow.spread_type ?? null,
    spreadId: sessionRow.spread_id ?? null,
    cards: sessionRow.cards ?? null,
    numerologToolId,
    numerologToolParams,
    matrixSubjectId,
    matrixBirthDate,
    subjectName,
    subjectKind,
    // Anchors the matrix diagram to the day the reading was made.
    sessionCreatedAt:
      sessionRow.created_at instanceof Date
        ? sessionRow.created_at.toISOString()
        : sessionRow.created_at
          ? String(sessionRow.created_at)
          : null,
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
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
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
