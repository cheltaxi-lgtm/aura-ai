"use client";

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import type { SessionListItem } from "@/components/SessionList";
import {
  CHAT_HISTORY_PAGE_SIZE,
  loadChatCache,
  loadChatCacheAny,
  loadChatCacheEntry,
  saveChatCache,
  subscribeChatCacheUpdates,
  chatHasSpreadReading,
  SESSION_ONLY_CACHE_KEY,
  type CachedChatSpread,
} from "@/lib/chat-cache";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import { readIntentionSpreadForMaster } from "@/lib/intention";
import { spreadKey } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import type { StoredProfile } from "@/types/stored-profile";
import type { Message } from "@/types";
import { generateId } from "@/lib/id";
import { resolveMasterSpread } from "@/lib/spread-context";
import { DEFAULT_SPREAD_ID, hasCompleteSpread } from "@/lib/spreads";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { enrichNumerologMessagesOnRestore } from "@/lib/numerology/resolve-message-ui";
import { decodeNumerologSpreadId } from "@/lib/numerology/tools";

export interface RestoreChatResult {
  messages: Message[];
  hasMore: boolean;
  sessionId?: string | null;
  status?: string | null;
  intention?: string | null;
  spreadType?: string | null;
  cards?: string[] | null;
  spreadId?: string | null;
  numerologToolId?: import("@/lib/numerology/tools").NumerologToolId | null;
  numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams | null;
  matrixSubjectId?: string | null;
  matrixBirthDate?: string | null;
  subjectName?: string | null;
  subjectKind?: string | null;
  /** Session start day — anchors the matrix diagram to the reading it belongs to. */
  sessionCreatedAt?: string | null;
  spread?: {
    cards: { name: string; meaning?: string }[];
    system: DeckSystem;
    type: string;
    cardsKey: string;
    intention?: string | null;
  };
}

export interface UseChatSessionOptions {
  isLoggedIn: boolean;
  selectedCharacter: string | null;
  getActiveProfile: () => StoredProfile | null;
  masters: ShowcaseMaster[];
  spreadCardsKey: string;
  activeSpreadCardsKey: string;
  isLoading: boolean;
  sendingRef: MutableRefObject<boolean>;
  readingInFlightRef: MutableRefObject<boolean>;
  /** When true, never hydrate/replace the thread from history/cache sync. */
  pendingNewChatThreadRef?: MutableRefObject<boolean>;
  sessionOffline?: boolean;
  onApplyRestoredSpread?: (
    spread: RestoreChatResult["spread"],
    characterId: string
  ) => void;
}

export function useChatSession(options: UseChatSessionOptions) {
  const {
    isLoggedIn,
    selectedCharacter,
    getActiveProfile,
    masters,
    spreadCardsKey,
    activeSpreadCardsKey,
    isLoading,
    sendingRef,
    readingInFlightRef,
    pendingNewChatThreadRef,
    sessionOffline,
    onApplyRestoredSpread,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [retryDraft, setRetryDraft] = useState<{ content: string; imageBase64?: string } | null>(
    null
  );
  const [chatHeaderImage, setChatHeaderImage] = useState<string | null>(null);
  const [sessionOnlyChatState, setSessionOnlyChat] = useState(false);
  const [sessionListMaster, setSessionListMaster] = useState<string | null>(null);
  const [sessionsListData, setSessionsListData] = useState<{
    active: SessionListItem | null;
    completed: SessionListItem[];
  }>({ active: null, completed: [] });
  const [sessionsListLoading, setSessionsListLoading] = useState(false);
  const [sessionListActionId, setSessionListActionId] = useState<string | null>(null);
  const [consultationSessionId, setConsultationSessionId] = useState<string | null>(null);
  const consultationSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    consultationSessionIdRef.current = consultationSessionId;
  }, [consultationSessionId]);
  const [consultationReadOnly, setConsultationReadOnly] = useState(false);
  const [completingSession, setCompletingSession] = useState(false);

  const archiveSessionIdRef = useRef<string | null>(null);
  const exitingToSessionListRef = useRef(false);
  const chatLoadedForRef = useRef<string | null>(null);
  const prevSelectedCharacterRef = useRef<string | null>(null);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setHistoryHasMore(false);
    chatLoadedForRef.current = null;
  }, []);

  const persistSessionMetaToServer = useCallback(
    async (
      sid: string | undefined,
      meta: {
        characterKey: string;
        intention?: string | null;
        spreadType?: string | null;
        spreadId?: string | null;
        cards?: string[];
        numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams | null;
        awaitingContext?: boolean;
        newConsultation?: boolean;
      }
    ) => {
      if (!sid) return;
      try {
        await fetch("/api/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            characterKey: meta.characterKey,
            intention: meta.intention,
            spreadType: meta.spreadType,
            spreadId: meta.spreadId,
            cards: meta.cards,
            numerologToolParams: meta.numerologToolParams,
            awaitingContext: meta.awaitingContext,
            newConsultation: meta.newConsultation ?? false,
          }),
        });
      } catch {
        /* offline ok */
      }
    },
    []
  );

  const restoreChatForCharacter = useCallback(
    async (
      characterId: string,
      restoreOpts?: {
        before?: string;
        limit?: number;
        archiveSessionId?: string;
        sessionId?: string;
      }
    ): Promise<RestoreChatResult | null> => {
      const activeProfile = getActiveProfile();
      const masterCtx = resolveMasterSpread(activeProfile, characterId, masters);
      const persistedIntention = readIntentionSpreadForMaster(characterId);
      const cacheKeyCandidates = [
        ...new Set(
          [
            persistedIntention?.cardsKey || spreadKey(persistedIntention?.cards),
            masterCtx.cardsKey &&
            hasCompleteSpread(
              masterCtx.cards.map((c) => c.name),
              DEFAULT_SPREAD_ID,
              "daily"
            )
              ? masterCtx.cardsKey
              : "",
            spreadCardsKey,
          ].filter(Boolean) as string[]
        ),
      ];

      let cached: Message[] | null = null;
      let cachedSpread: CachedChatSpread | undefined;
      let cacheKeyUsed = cacheKeyCandidates[0] ?? "";

      if (!isLoggedIn) {
        const cacheEntry = loadChatCacheEntry(characterId);
        if (cacheEntry?.spread?.cards.length) {
          cachedSpread = cacheEntry.spread;
        }

        for (const key of cacheKeyCandidates) {
          const keyed = loadChatCache(characterId, key);
          if (keyed?.length) {
            cached = keyed;
            cacheKeyUsed = key;
            break;
          }
        }
        if (!cached) {
          cached = loadChatCacheAny(characterId);
          if (cacheEntry?.cardsKey) cacheKeyUsed = cacheEntry.cardsKey;
        }
      }

      try {
        const params = new URLSearchParams({
          masterId: characterId,
          limit: String(restoreOpts?.limit ?? CHAT_HISTORY_PAGE_SIZE),
        });
        if (restoreOpts?.before) params.set("before", restoreOpts.before);
        if (restoreOpts?.archiveSessionId) {
          params.set("archiveSessionId", restoreOpts.archiveSessionId);
        } else if (restoreOpts?.sessionId) {
          params.set("sessionId", restoreOpts.sessionId);
        }

        const res = await fetchWithTimeout(`/api/chat/history?${params}`, {
          credentials: "include",
          timeoutMs: 15_000,
        });
        if (res.ok) {
          const data = await res.json();
          const rows = (data.messages ?? []) as {
            id: string;
            role: string;
            content: string;
            timestamp: string;
          }[];

          if (isLoggedIn) {
            const numerologToolId =
              (data.numerologToolId as RestoreChatResult["numerologToolId"]) ??
              decodeNumerologSpreadId(data.spreadId as string | null | undefined);
            const matrixBirthDate =
              (typeof data.matrixBirthDate === "string" && data.matrixBirthDate.trim()) ||
              (typeof (data.numerologToolParams as { matrixBirthDate?: string } | null)
                ?.matrixBirthDate === "string"
                ? (data.numerologToolParams as { matrixBirthDate?: string }).matrixBirthDate
                : null) ||
              null;
            const restored: Message[] = enrichNumerologMessagesOnRestore(
              rows.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                timestamp: new Date(m.timestamp),
              })),
              {
                numerologToolId,
                birthDate: matrixBirthDate || activeProfile?.birthDate,
              }
            );

            const spread = data.spread as RestoreChatResult["spread"] | null | undefined;
            return {
              messages: restored,
              hasMore: Boolean(data.hasMore),
              sessionId: data.sessionId as string | null | undefined,
              status: data.status as string | null | undefined,
              intention: data.intention as string | null | undefined,
              spreadType: data.spreadType as string | null | undefined,
              spreadId: data.spreadId as string | null | undefined,
              cards: data.cards as string[] | null | undefined,
              numerologToolId: data.numerologToolId as RestoreChatResult["numerologToolId"],
              numerologToolParams: data.numerologToolParams as RestoreChatResult["numerologToolParams"],
              matrixSubjectId:
                (typeof data.matrixSubjectId === "string" && data.matrixSubjectId) ||
                (data.numerologToolParams as { matrixSubjectId?: string } | null)
                  ?.matrixSubjectId ||
                null,
              matrixBirthDate,
              subjectName:
                (typeof data.subjectName === "string" && data.subjectName) ||
                (data.numerologToolParams as { subjectName?: string } | null)?.subjectName ||
                null,
              subjectKind:
                (typeof data.subjectKind === "string" && data.subjectKind) || null,
              sessionCreatedAt:
                (typeof data.sessionCreatedAt === "string" && data.sessionCreatedAt) || null,
              spread: spread ?? undefined,
            };
          }

          const cachedById = new Map((cached ?? []).map((m) => [m.id, m]));
          const cachedUiByContent = new Map<string, Message["numerologyUi"]>();
          for (const m of cached ?? []) {
            if (m.role === "assistant" && m.numerologyUi) {
              const key = m.content.trim().slice(0, 240);
              if (key) cachedUiByContent.set(key, m.numerologyUi);
            }
          }
          const restored: Message[] = rows.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.timestamp),
            numerologyUi:
              cachedById.get(m.id)?.numerologyUi ??
              (m.role === "assistant"
                ? cachedUiByContent.get(m.content.trim().slice(0, 240))
                : undefined),
          }));

          const spread = data.spread as RestoreChatResult["spread"] | null | undefined;

          const historyMeta = {
            sessionId: data.sessionId as string | null | undefined,
            status: data.status as string | null | undefined,
            intention: data.intention as string | null | undefined,
            spreadType: data.spreadType as string | null | undefined,
            spreadId: data.spreadId as string | null | undefined,
            cards: data.cards as string[] | null | undefined,
            numerologToolId: data.numerologToolId as RestoreChatResult["numerologToolId"],
            numerologToolParams: data.numerologToolParams as RestoreChatResult["numerologToolParams"],
            spread,
          };

          const resolvedKey = spread?.cardsKey || cacheKeyUsed;
          if (
            !isLoggedIn &&
            !restoreOpts?.before &&
            (restored.length > 0 || spread?.cards?.length)
          ) {
            saveChatCache(
              characterId,
              restored.length ? restored : (cached ?? []),
              resolvedKey || undefined,
              spread?.cards?.length
                ? {
                    cards: spread.cards,
                    system: spread.system,
                    variant: spread.type === "intention_spread" ? "intention" : "triplet",
                  }
                : cachedSpread
            );
          }

          if (
            restored.length > 0 ||
            spread?.cards?.length ||
            historyMeta.sessionId
          ) {
            return {
              messages: restored,
              hasMore: Boolean(data.hasMore),
              sessionId: historyMeta.sessionId,
              status: historyMeta.status,
              intention: historyMeta.intention,
              spreadType: historyMeta.spreadType,
              cards: historyMeta.cards,
              spread: spread ?? undefined,
            };
          }
        }
      } catch {
        /* fall through to offline cache for guests only */
      }

      if (!isLoggedIn && cached?.length && !restoreOpts?.before) {
        return {
          messages: cached,
          hasMore: false,
          spread: cachedSpread?.cards.length
            ? {
                cards: cachedSpread.cards,
                system: cachedSpread.system,
                type:
                  cachedSpread.variant === "intention" ? "intention_spread" : "reading",
                cardsKey: spreadKey(cachedSpread.cards),
              }
            : undefined,
        };
      }
      return null;
    },
    [getActiveProfile, sessionOffline, spreadCardsKey, masters, isLoggedIn]
  );

  const refreshSessionsList = useCallback(async (masterId: string) => {
    try {
      const res = await fetch(`/api/sessions?characterKey=${encodeURIComponent(masterId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        active: SessionListItem | null;
        completed: SessionListItem[];
      };
      setSessionsListData({
        active: data.active,
        completed: data.completed ?? [],
      });
    } catch {
      /* ignore */
    }
  }, []);

  const resolveConsultationSessionId = useCallback(async (masterId: string, hintId?: string) => {
    if (hintId) {
      setConsultationSessionId(hintId);
      setConsultationReadOnly(false);
      archiveSessionIdRef.current = null;
      return hintId;
    }
    try {
      const res = await fetch(`/api/sessions?characterKey=${encodeURIComponent(masterId)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { active: SessionListItem | null };
      if (data.active?.id) {
        setConsultationSessionId(data.active.id);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
        return data.active.id;
      }
    } catch {
      /* offline */
    }
    return null;
  }, []);

  const handleLoadMoreHistory = useCallback(async () => {
    if (!selectedCharacter || loadingMoreHistory || !historyHasMore) return;
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingMoreHistory(true);
    try {
      const batch = await restoreChatForCharacter(selectedCharacter, {
        before: oldest.timestamp.toISOString(),
        limit: CHAT_HISTORY_PAGE_SIZE,
        archiveSessionId: archiveSessionIdRef.current ?? undefined,
      });
      if (!batch) return;
      setHistoryHasMore(batch.hasMore);
      if (batch.messages.length === 0) return;

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = batch.messages.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [selectedCharacter, loadingMoreHistory, historyHasMore, messages, restoreChatForCharacter]);

  useEffect(() => {
    if (!isLoadingHistory) return;
    const timer = window.setTimeout(() => {
      setIsLoadingHistory(false);
      // Never clear an in-flight new-spread generation — that lets history hydrate an old chat.
      if (!pendingNewChatThreadRef?.current) {
        readingInFlightRef.current = false;
      }
    }, 130_000);
    return () => window.clearTimeout(timer);
  }, [isLoadingHistory, readingInFlightRef, pendingNewChatThreadRef]);

  useEffect(() => {
    if (!selectedCharacter || !messages.length || isLoggedIn) return;
    // Never persist until history restore finished for this master — otherwise
    // switching masters saves the previous master's messages under the new key.
    if (chatLoadedForRef.current !== selectedCharacter) return;
    saveChatCache(
      selectedCharacter,
      messages,
      sessionOnlyChatState ? SESSION_ONLY_CACHE_KEY : activeSpreadCardsKey
    );
  }, [selectedCharacter, messages, activeSpreadCardsKey, sessionOnlyChatState, isLoggedIn]);

  useEffect(() => {
    if (!selectedCharacter || !isLoggedIn) return;
    return subscribeChatCacheUpdates((characterId) => {
      if (exitingToSessionListRef.current) return;
      if (characterId !== selectedCharacter) return;
      if (
        sendingRef.current ||
        isLoading ||
        readingInFlightRef.current ||
        pendingNewChatThreadRef?.current
      ) {
        return;
      }
      const boundSessionId = consultationSessionIdRef.current ?? undefined;
      void restoreChatForCharacter(characterId, {
        archiveSessionId: archiveSessionIdRef.current ?? undefined,
        sessionId: boundSessionId,
      }).then((restored) => {
        if (!restored) return;
        if (pendingNewChatThreadRef?.current || readingInFlightRef.current) return;
        const bound = consultationSessionIdRef.current;
        if (bound && restored.sessionId && restored.sessionId !== bound) return;
        if (restored.spread) {
          onApplyRestoredSpread?.(restored.spread, characterId);
        }
        if (restored.messages.length > 0) {
          setMessages((prev) => {
            if (isLoggedIn) {
              return restored.messages;
            }
            const serverHasSpread = chatHasSpreadReading(restored.messages);
            const localHasSpread = chatHasSpreadReading(prev);
            if (localHasSpread && !serverHasSpread && prev.length >= restored.messages.length) {
              return prev;
            }
            if (restored.messages.length > prev.length || !localHasSpread) {
              return restored.messages;
            }
            return prev;
          });
          setHistoryHasMore(restored.hasMore);
        }
      });
    });
  }, [
    selectedCharacter,
    isLoggedIn,
    isLoading,
    restoreChatForCharacter,
    onApplyRestoredSpread,
    sendingRef,
    readingInFlightRef,
    pendingNewChatThreadRef,
  ]);

  const buildSessionOnlyWelcome = useCallback(
    (masterId: string): Message[] => {
      const master = findShowcaseMaster(masterId, masters) ?? getCharacterById(masterId);
      const masterName = master?.name ?? "Мастер";
      return [
        {
          id: generateId(),
          role: "assistant",
          content: `${masterName} готов к сеансу. Задайте свой вопрос — этот диалог не привязан к вашему раскладу из трёх карт.`,
          timestamp: new Date(),
        },
      ];
    },
    [masters]
  );

  return {
    messages,
    setMessages,
    isLoadingHistory,
    setIsLoadingHistory,
    loadingMoreHistory,
    setLoadingMoreHistory,
    historyHasMore,
    setHistoryHasMore,
    retryDraft,
    setRetryDraft,
    chatHeaderImage,
    setChatHeaderImage,
    sessionOnlyChat: sessionOnlyChatState,
    setSessionOnlyChat,
    sessionListMaster,
    setSessionListMaster,
    sessionsListData,
    setSessionsListData,
    sessionsListLoading,
    setSessionsListLoading,
    sessionListActionId,
    setSessionListActionId,
    consultationSessionId,
    consultationSessionIdRef,
    setConsultationSessionId,
    consultationReadOnly,
    setConsultationReadOnly,
    completingSession,
    setCompletingSession,
    archiveSessionIdRef,
    exitingToSessionListRef,
    chatLoadedForRef,
    prevSelectedCharacterRef,
    clearMessages,
    persistSessionMetaToServer,
    restoreChatForCharacter,
    refreshSessionsList,
    resolveConsultationSessionId,
    handleLoadMoreHistory,
    buildSessionOnlyWelcome,
  };
}
