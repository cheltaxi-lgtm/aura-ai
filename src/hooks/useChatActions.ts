"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { parseInsufficientRunes, getRateLimitPayload } from "@/lib/api-errors";
import { rateLimitMessage } from "@/lib/rate-limit-messages";
import {
  loadChatCacheForMaster,
  loadChatCacheAny,
  saveChatCache,
  chatHasSpreadReading,
  MIN_SPREAD_READING_CHARS,
} from "@/lib/chat-cache";
import { mergeChatMessageMetadata, applyNumerologyUiToLastAssistant } from "@/lib/merge-chat-message-metadata";
import {
  FULL_SPREAD_REQUEST_RE,
  stripMemoryLeakFromReply,
  resolveClientReadingText,
} from "@/lib/chat-reply-sanitize";
import {
  persistSessionIntention,
  persistIntentionSpreadState,
  readIntentionSpreadForMaster,
  readSessionCustomQuestion,
  type SessionIntention,
  type SessionTopicId,
} from "@/lib/intention";
import { normalizeSessionIntention } from "@/lib/session-intention-normalize";
import { buildSessionSpreadCards, resolveSpreadSymbols } from "@/lib/intention-draw";
import { generateId } from "@/lib/id";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { fetchPlatformFeatures } from "@/lib/usePlatformFeatures";
import { spreadKey, resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import { resolveMasterSpread, findSavedSpreadReading } from "@/lib/spread-context";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  buildNumerologSpreadCards,
  numerologReadingCacheKey,
  numerologSpreadComplete,
  numerologToolCost,
  numerologToolDrawCount,
  resolveNumerologToolId,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import { waitForSpreadReadingRitual } from "@/components/SpreadReadingRitualPanel";
import {
  buildTeaser,
  persistPendingReading,
  clearPendingReading,
  resolveSpreadCardsForReading,
  readingPayloadForMaster,
  resolveTarotCardsForOutgoingChat,
  coerceSpreadReadingText,
} from "@/lib/chat-reading-helpers";
import { inferDailySpreadType } from "@/lib/daily-spread-client";
import {
  gateSpreadReadingRunes,
  isSpreadReadingBillingActive,
} from "@/lib/rune-afford-client";
import {
  detectPeriodSpreadScope,
  drawPeriodSpread,
  hasMasterQuickChips,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import { FLOW_STEP_KEY, LAST_MASTER_KEY } from "@/lib/home-flow-storage";
import type { StoredProfile } from "@/types/stored-profile";
import type { Message } from "@/types";
import type { StoredReadingRow } from "@/lib/reading-progress";
import type { RestoreChatResult } from "@/hooks/useChatSession";
import type { FlowStep } from "@/components/FlowStepper";
import type { RuneActionType } from "@/lib/rune-costs";
import {
  isSessionChatQuestionCapReached,
  SESSION_CHAT_LIMIT_MESSAGE,
} from "@/lib/session-limits";
import {
  DEFAULT_SPREAD_ID,
  hasCompleteSpread,
  spreadFlippedState,
  type SpreadId,
} from "@/lib/spreads";

type ApplyRestoredSpreadFn = (
  spread:
    | {
        cards: { name: string; meaning?: string }[];
        system: DeckSystem;
        type: string;
        cardsKey: string;
        intention?: string | null;
      }
    | null
    | undefined,
  characterId: string
) => void;

/** Early loading + spread-restore bridge — call before useChatSession. */
export function useChatReadingLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const readingInFlightRef = useRef(false);
  const applyRestoredChatSpreadRef = useRef<ApplyRestoredSpreadFn>(() => {});

  const onApplyRestoredSpread = useCallback<ApplyRestoredSpreadFn>(
    (spread, characterId) => applyRestoredChatSpreadRef.current(spread, characterId),
    []
  );

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      setIsLoading(false);
      readingInFlightRef.current = false;
    }, 130_000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  return {
    isLoading,
    setIsLoading,
    readingInFlightRef,
    applyRestoredChatSpreadRef,
    onApplyRestoredSpread,
  };
}

export interface UseChatActionsOptions {
  // Loading (from useChatReadingLoading)
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  readingInFlightRef: MutableRefObject<boolean>;
  applyRestoredChatSpreadRef: MutableRefObject<ApplyRestoredSpreadFn>;

  // useHomeFlow
  session: {
    offline?: boolean;
    sessionId?: string;
    hasAccess?: boolean;
    isUnlimited?: boolean;
    questionsRemaining?: number | null;
    freeLimit?: number;
    freeQuestionsUsed?: number;
  } | null;
  sessionLoading: boolean;
  refresh: (sessionId: string) => Promise<unknown>;
  setStep: (step: FlowStep) => void;

  // Auth / billing
  isLoggedIn: boolean;
  authLoading: boolean;
  runeConfig: { enabled: boolean; freeQuestions: number };
  runeCost: (action: RuneActionType) => number;
  formatRunes: (amount: number) => string;
  runeBalance: number;
  setRuneBalance: (balance: number) => void;
  insufficientRunes: { balance: number; required: number } | null;
  setInsufficientRunes: (value: { balance: number; required: number } | null) => void;
  handleOpenPaywall: (opts?: {
    balance?: number;
    requiredRunes?: number;
    shortage?: number;
  }) => void;
  showRateLimit: (action: string, retryAfter?: number) => void;

  // useChatSession
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isLoadingHistory: boolean;
  setIsLoadingHistory: Dispatch<SetStateAction<boolean>>;
  setHistoryHasMore: Dispatch<SetStateAction<boolean>>;
  setConsultationSessionId: Dispatch<SetStateAction<string | null>>;
  setConsultationReadOnly: Dispatch<SetStateAction<boolean>>;
  restoreChatForCharacter: (
    characterId: string,
    opts?: { archiveSessionId?: string; sessionId?: string }
  ) => Promise<RestoreChatResult | null>;
  resolveConsultationSessionId: (masterId: string, hintId?: string) => Promise<string | null>;
  consultationSessionIdRef: MutableRefObject<string | null>;
  buildSessionOnlyWelcome?: (masterId: string) => Message[];

  // Character / spread state
  selectedCharacter: string | null;
  selectedCharacterRef: MutableRefObject<string | null>;
  masters: ShowcaseMaster[];
  getActiveProfile: () => StoredProfile | null;
  spreadCardsKey: string;
  activeSpreadCardsKey: string;
  savedReadings: StoredReadingRow[];
  refreshSavedReadings: () => void;

  sessionIntention: SessionIntention | SessionTopicId | null;
  setSessionIntention: Dispatch<SetStateAction<SessionIntention | SessionTopicId | null>>;
  sessionOnlyChat: boolean;
  setSessionOnlyChat: Dispatch<SetStateAction<boolean>>;
  sessionListMaster: string | null;
  setSessionListMaster: Dispatch<SetStateAction<string | null>>;

  intentionSpread: {
    masterId: string;
    cards: SpreadSymbol[];
    system: DeckSystem;
    intention: SessionIntention | SessionTopicId;
  } | null;
  setIntentionSpread: Dispatch<
    SetStateAction<{
      masterId: string;
      cards: SpreadSymbol[];
      system: DeckSystem;
      intention: SessionIntention | SessionTopicId;
    } | null>
  >;
  chatSessionSpread: {
    masterId: string;
    cards: SpreadSymbol[];
    system: DeckSystem;
  } | null;
  setChatSessionSpread: Dispatch<
    SetStateAction<{
      masterId: string;
      cards: SpreadSymbol[];
      system: DeckSystem;
    } | null>
  >;

  setIntentionHighlight: Dispatch<SetStateAction<boolean>>;
  setIntentionSpreadLoading: Dispatch<SetStateAction<boolean>>;
  setReadingRitualActive: Dispatch<SetStateAction<boolean>>;
  setReadingRitualCountdownDone: Dispatch<SetStateAction<boolean>>;
  setSpreadReadingRitualOpen: Dispatch<SetStateAction<boolean>>;
  setHideChatSpread: Dispatch<SetStateAction<boolean>>;
  setSpreadFlipped: Dispatch<SetStateAction<boolean[]>>;
  setPhotoChatSpread: Dispatch<
    SetStateAction<{ masterId: string; cards: DeckCardInput[]; system: DeckSystem } | null>
  >;
  setLastMasterId: Dispatch<SetStateAction<string | null>>;
  setSelectedCharacter: Dispatch<SetStateAction<string | null>>;

  // Refs from HomePage
  skipNextReadingRef: MutableRefObject<boolean>;
  pendingNewChatThreadRef: MutableRefObject<boolean>;
  pendingReadingMasterRef: MutableRefObject<string | null>;
  sessionSpreadMetaRef: MutableRefObject<{
    spreadType?: "daily" | "new" | "photo";
    spreadId?: string;
    cardNames?: string[];
    numerologToolId?: NumerologToolId;
    numerologToolParams?: NumerologToolParams;
  } | null>;
  sendingRef: MutableRefObject<boolean>;
  archiveSessionIdRef: MutableRefObject<string | null>;
  exitingToSessionListRef: MutableRefObject<boolean>;
  chatLoadedForRef: MutableRefObject<string | null>;
  prevSelectedCharacterRef: MutableRefObject<string | null>;

  // Spread display / auto-load
  needsSpreadFlip: boolean;
  allSpreadFlipped: boolean;
  shouldAutoLoadSpreadReading: (masterId: string, cardsKey: string) => boolean;
  chatDisplaySpread: {
    source?: "triplet" | "photo" | "intention" | "master" | "numerolog";
    cards?: DeckCardInput[];
    system?: DeckSystem;
    spreadId?: SpreadId | string;
    cardCount?: number;
    positions?: string[];
  } | null;

  // HomePage callbacks
  attachSceneToAssistantMessage: (
    messageId: string,
    content: string,
    characterId: string,
    scene: "destiny_card" | "scene_illustration",
    userQuestion?: string
  ) => Promise<void>;
  setRetryDraft: Dispatch<SetStateAction<{ content: string; imageBase64?: string } | null>>;
  setAchievementPopup: Dispatch<
    SetStateAction<{
      label: string;
      description: string;
      bonus: number;
      phrase: string;
    } | null>
  >;
}

function buildSessionOnlyWelcomeInline(masterId: string, masters: ShowcaseMaster[]): Message[] {
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
}


export function useChatActions(options: UseChatActionsOptions) {
  const {
    isLoading,
    setIsLoading,
    readingInFlightRef,
    applyRestoredChatSpreadRef,
    session,
    sessionLoading,
    refresh,
    setStep,
    isLoggedIn,
    authLoading,
    runeConfig,
    runeCost,
    formatRunes,
    runeBalance,
    setRuneBalance,
    insufficientRunes,
    setInsufficientRunes,
    handleOpenPaywall,
    showRateLimit,
    messages,
    setMessages,
    isLoadingHistory,
    setIsLoadingHistory,
    setHistoryHasMore,
    setConsultationSessionId,
    setConsultationReadOnly,
    restoreChatForCharacter,
    resolveConsultationSessionId,
    consultationSessionIdRef,
    buildSessionOnlyWelcome,
    selectedCharacter,
    selectedCharacterRef,
    masters,
    getActiveProfile,
    spreadCardsKey,
    activeSpreadCardsKey,
    savedReadings,
    refreshSavedReadings,
    sessionIntention,
    setSessionIntention,
    sessionOnlyChat,
    setSessionOnlyChat,
    sessionListMaster,
    setSessionListMaster,
    intentionSpread,
    setIntentionSpread,
    chatSessionSpread,
    setChatSessionSpread,
    setIntentionHighlight,
    setIntentionSpreadLoading,
    setReadingRitualActive,
    setReadingRitualCountdownDone,
    setSpreadReadingRitualOpen,
    setHideChatSpread,
    setSpreadFlipped,
    setPhotoChatSpread,
    setLastMasterId,
    setSelectedCharacter,
    skipNextReadingRef,
    pendingNewChatThreadRef,
    pendingReadingMasterRef,
    sessionSpreadMetaRef,
    sendingRef,
    archiveSessionIdRef,
    exitingToSessionListRef,
    chatLoadedForRef,
    prevSelectedCharacterRef,
    needsSpreadFlip,
    allSpreadFlipped,
    shouldAutoLoadSpreadReading,
    chatDisplaySpread,
    attachSceneToAssistantMessage,
    setRetryDraft,
    setAchievementPopup,
  } = options;

  const loadReadingAttemptKeyRef = useRef<string | null>(null);
  const loadReadingInFlightKeyRef = useRef<string | null>(null);

  const usesRuneBilling =
    isLoggedIn && !session?.hasAccess && !session?.offline && runeConfig.enabled;

  const questionsLeft =
    session?.offline || session?.hasAccess
      ? null
      : (session?.questionsRemaining ??
        Math.max(
          0,
          (session?.freeLimit ?? runeConfig.freeQuestions) - (session?.freeQuestionsUsed ?? 0)
        ));

  const sessionWelcome = useCallback(
    (masterId: string) =>
      buildSessionOnlyWelcome?.(masterId) ?? buildSessionOnlyWelcomeInline(masterId, masters),
    [buildSessionOnlyWelcome, masters]
  );

  const loadReading = useCallback(
    async (
      characterId: string,
      profileOverride?: StoredProfile,
      loadOptions?: {
        force?: boolean;
        replaceExisting?: boolean;
        preserveChat?: boolean;
        sessionId?: string;
        readingScope?: PeriodSpreadScope;
        spreadCardsOverride?: SpreadSymbol[];
      }
    ) => {
      const appendReadingMessage = (prev: Message[], readingMsg: Message): Message[] => {
        if (loadOptions?.replaceExisting || loadOptions?.preserveChat) {
          const idx = prev.findLastIndex(
            (m) =>
              m.role === "assistant" &&
              (m.content?.trim().length ?? 0) >= MIN_SPREAD_READING_CHARS
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = readingMsg;
            return next;
          }
          return [...prev, readingMsg];
        }
        if (chatHasSpreadReading(prev)) return prev;
        return [readingMsg, ...prev];
      };

      const closeSpreadReadingRitual = () => {
        setSpreadReadingRitualOpen(false);
        setReadingRitualActive(false);
        setReadingRitualCountdownDone(true);
        setIntentionSpreadLoading(false);
      };
      const openSpreadReadingRitual = () => {
        setSpreadReadingRitualOpen(true);
        setReadingRitualActive(true);
        setReadingRitualCountdownDone(false);
        setIntentionSpreadLoading(true);
      };

      try {
        const activeProfile = profileOverride ?? getActiveProfile();
        if (!activeProfile) {
          return;
        }

        if (sessionIntention === "life_death") {
          return;
        }

        const metaSpreadId = sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID;
        const metaSpreadType = sessionSpreadMetaRef.current?.spreadType;
        const metaNumerologToolId = isNumerologMaster(characterId)
          ? resolveNumerologToolId(
              sessionSpreadMetaRef.current?.spreadId,
              sessionSpreadMetaRef.current?.numerologToolId
            )
          : DEFAULT_NUMEROLOG_SESSION_TOOL;

        const spreadComplete = (names: string[]) =>
          isNumerologMaster(characterId)
            ? numerologSpreadComplete(names, metaNumerologToolId)
            : hasCompleteSpread(names, metaSpreadId, metaSpreadType);

        const cardsForMaster =
          loadOptions?.spreadCardsOverride &&
          spreadComplete(loadOptions.spreadCardsOverride.map((c) => c.name))
            ? loadOptions.spreadCardsOverride
            : resolveSpreadCardsForReading({
                profile: activeProfile,
                characterId,
                masters,
                sessionSpreadMeta: sessionSpreadMetaRef.current,
                intentionSpread,
                chatSessionSpread,
                chatDisplaySpread,
              });

        if (!spreadComplete(cardsForMaster.map((c) => c.name))) {
          return;
        }

        const cardNames = cardsForMaster.map((c) => c.name);
        const cardsKey = isNumerologMaster(characterId)
          ? numerologReadingCacheKey({
              characterId,
              toolId: metaNumerologToolId,
              birthDate: activeProfile.birthDate,
              cardNames,
              params: sessionSpreadMetaRef.current?.numerologToolParams,
            })
          : spreadKey(cardsForMaster) || spreadCardsKey;
        const loadAttemptKey = `${characterId}:${cardsKey}`;
        if (!loadOptions?.force) {
          if (loadReadingInFlightKeyRef.current === loadAttemptKey) return;
          if (loadReadingAttemptKeyRef.current === loadAttemptKey) return;
        }
        loadReadingInFlightKeyRef.current = loadAttemptKey;
        const masterCtx = resolveMasterSpread(activeProfile, characterId, masters);
        const effectiveSpreadType =
          inferDailySpreadType({
            explicitSpreadType: sessionSpreadMetaRef.current?.spreadType,
            sessionSpreadType: sessionSpreadMetaRef.current?.spreadType,
            sessionIntention: sessionIntention ?? undefined,
            cards: cardsForMaster,
            profile: activeProfile,
          }) ?? sessionSpreadMetaRef.current?.spreadType;

        let apiCallStarted = false;
        try {
        if (!loadOptions?.force && !isLoggedIn) {
          const chatCached =
            loadChatCacheForMaster(characterId, cardsKey) ?? loadChatCacheAny(characterId);
          if (chatHasSpreadReading(chatCached)) {
            setMessages((prev) => (chatHasSpreadReading(prev) ? prev : chatCached!));
            return;
          }
        }

        const cachedReading =
          loadOptions?.force
            ? undefined
            : findSavedSpreadReading(savedReadings, characterId, cardsKey);

        if (cachedReading?.contextData) {
          const ctx = cachedReading.contextData as {
            type?: string;
            reading?: string;
            tarotCards?: { name: string; meaning?: string }[];
            deckSystem?: DeckSystem;
            system?: DeckSystem;
            intention?: SessionIntention;
          };
          const readingText = coerceSpreadReadingText(ctx.reading ?? "", cardNames);
          if (readingText) {
            const readingTs = cachedReading.createdAt
              ? new Date(cachedReading.createdAt)
              : new Date();
            const readingMsgId = generateId();
            const readingMsg: Message = {
              id: readingMsgId,
              role: "assistant",
              content: readingText,
              timestamp: readingTs,
            };
            const deckSystem = ctx.deckSystem ?? ctx.system ?? masterCtx.system;
            if (ctx.type === "intention_spread" && ctx.tarotCards?.length) {
              const intentionCardsKey = spreadKey(ctx.tarotCards);
              setIntentionSpread({
                masterId: characterId,
                cards: ctx.tarotCards as SpreadSymbol[],
                system: deckSystem,
                intention: ctx.intention ?? sessionIntention ?? "Любовь",
              });
              setSpreadFlipped(spreadFlippedState(ctx.tarotCards.length, true));
              persistIntentionSpreadState(characterId, {
                cardsKey: intentionCardsKey,
                cards: ctx.tarotCards,
                system: deckSystem,
                intention: ctx.intention ?? sessionIntention ?? "Любовь",
              });
            }
            setMessages((prev) => {
              const updated = appendReadingMessage(prev, readingMsg);
              if (!isLoggedIn) {
                saveChatCache(
                  characterId,
                  updated,
                  ctx.type === "intention_spread" && ctx.tarotCards?.length
                    ? spreadKey(ctx.tarotCards)
                    : cardsKey,
                  ctx.type === "intention_spread" && ctx.tarotCards?.length
                    ? {
                        cards: ctx.tarotCards,
                        system: deckSystem,
                        variant: "intention",
                      }
                    : undefined
                );
              }
              return updated;
            });
            return;
          }
        }

        const requiredReadingCost = isNumerologMaster(characterId)
          ? numerologToolCost(metaNumerologToolId)
          : runeCost("READING");
        const billingActive = isSpreadReadingBillingActive({
          spreadType: effectiveSpreadType,
          isLoggedIn,
          runeBillingEnabled: runeConfig.enabled,
          hasFullAccess: session?.hasAccess,
          sessionOffline: session?.offline,
          isUnlimited: session?.isUnlimited,
        });
        const affordGate = gateSpreadReadingRunes({
          billingActive,
          balance: runeBalance,
          cost: requiredReadingCost,
        });
        if (affordGate.blocked) {
          loadReadingAttemptKeyRef.current = loadAttemptKey;
          pendingReadingMasterRef.current = characterId;
          persistPendingReading(characterId, affordGate.required);
          setInsufficientRunes({ balance: affordGate.balance, required: affordGate.required });
          handleOpenPaywall({
            balance: affordGate.balance,
            requiredRunes: affordGate.required,
          });
          return;
        }

        openSpreadReadingRitual();
        apiCallStarted = true;
        setIsLoading(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        try {
          const res = await Promise.all([
            fetch("/api/reading", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                characterId,
                sessionId:
                  loadOptions?.sessionId ??
                  (session?.offline ? undefined : session?.sessionId),
                intention: sessionIntention ?? undefined,
                forceRegenerate: loadOptions?.force ?? false,
                spreadType: effectiveSpreadType,
                readingScope: loadOptions?.readingScope,
                ...readingPayloadForMaster(
                  activeProfile,
                  characterId,
                  cardsForMaster,
                  masters,
                  metaSpreadId,
                  metaSpreadType,
                  metaNumerologToolId,
                  sessionSpreadMetaRef.current?.numerologToolParams
                ),
              }),
            }),
            waitForSpreadReadingRitual(),
          ]).then(([response]) => response);
          const data = await res.json();
          if (res.status === 401) {
            closeSpreadReadingRitual();
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: "Для расшифровки нужна регистрация. Создайте аккаунт и начните расклад заново.",
                timestamp: new Date(),
              },
            ]);
            return;
          }
          if (res.status === 429) {
            const rl = getRateLimitPayload(data);
            showRateLimit(rl?.action ?? "reading", rl?.retryAfter);
            const base = rateLimitMessage(rl?.action ?? "reading");
            const retrySec = rl?.retryAfter;
            closeSpreadReadingRitual();
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: retrySec
                  ? `${base} Повторите через ${retrySec} сек.`
                  : base,
                timestamp: new Date(),
              },
            ]);
            return;
          }
          if (res.status === 402) {
            const parsed = parseInsufficientRunes(data);
            if (parsed) {
              const required = parsed.required || runeCost("READING");
              pendingReadingMasterRef.current = characterId;
              persistPendingReading(characterId, required);
              setInsufficientRunes({ balance: parsed.balance, required });
              handleOpenPaywall({
                balance: parsed.balance,
                requiredRunes: required,
                shortage: parsed.shortage,
              });
              closeSpreadReadingRitual();
              setMessages([
                {
                  id: generateId(),
                  role: "assistant",
                  content: `Для полной расшифровки нужно ${formatRunes(required)}. Пополните баланс — расшифровка начнётся автоматически.`,
                  timestamp: new Date(),
                },
              ]);
              return;
            }
            closeSpreadReadingRitual();
            handleOpenPaywall();
            return;
          }
          if (typeof data.runeBalance === "number") {
            setRuneBalance(data.runeBalance);
            emitRuneBalanceUpdate(data.runeBalance);
            if (session?.sessionId && !session.offline) {
              void refresh(session.sessionId);
            }
          }
          if (res.ok && data.reading) {
            clearPendingReading();
            pendingReadingMasterRef.current = null;
            const readingMsgId = generateId();
            const readingTs = data.createdAt ? new Date(data.createdAt) : new Date();
            const cleanedReading =
              coerceSpreadReadingText(data.reading, cardNames) || buildTeaser(activeProfile);
            const readingMsg: Message = {
              id: readingMsgId,
              role: "assistant",
              content: cleanedReading,
              timestamp: readingTs,
              ...(data.numerologyUi ? { numerologyUi: data.numerologyUi as Message["numerologyUi"] } : {}),
            };
            setMessages((prev) => {
              const updated = appendReadingMessage(prev, readingMsg);
              if (!isLoggedIn) {
                saveChatCache(characterId, updated, cardsKey);
              }
              return updated;
            });
            refreshSavedReadings();
          } else {
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: buildTeaser(activeProfile),
                timestamp: new Date(),
              },
            ]);
          }
        } finally {
          clearTimeout(timeout);
          setIsLoading(false);
          setIsLoadingHistory(false);
          loadReadingAttemptKeyRef.current = loadAttemptKey;
          loadReadingInFlightKeyRef.current = null;
          setIntentionSpreadLoading(false);
        }
        } finally {
          if (!apiCallStarted && loadReadingInFlightKeyRef.current === loadAttemptKey) {
            loadReadingInFlightKeyRef.current = null;
          }
        }
      } catch (err) {
        console.error("loadReading failed:", err);
        closeSpreadReadingRitual();
        loadReadingInFlightKeyRef.current = null;
        setMessages([
          {
            id: generateId(),
            role: "assistant",
            content: "Мастер на связи. Задайте ваш вопрос.",
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
        setIsLoadingHistory(false);
      }
    },
    [
      getActiveProfile,
      session?.offline,
      session?.sessionId,
      session?.hasAccess,
      session?.isUnlimited,
      refreshSavedReadings,
      spreadCardsKey,
      runeCost,
      runeConfig.enabled,
      runeBalance,
      isLoggedIn,
      savedReadings,
      masters,
      sessionIntention,
      setMessages,
      setIntentionSpread,
      setSpreadFlipped,
      setIsLoading,
      setIsLoadingHistory,
      setIntentionSpreadLoading,
      setReadingRitualActive,
      setReadingRitualCountdownDone,
      setSpreadReadingRitualOpen,
      setRuneBalance,
      setInsufficientRunes,
      handleOpenPaywall,
      showRateLimit,
      formatRunes,
      refresh,
      pendingReadingMasterRef,
      sessionSpreadMetaRef,
      intentionSpread,
      chatSessionSpread,
      chatDisplaySpread,
      selectedCharacterRef,
    ]
  );

  const applyRestoredChatSpread = useCallback<ApplyRestoredSpreadFn>(
    (spread, characterId) => {
      if (characterId !== selectedCharacterRef.current) return;
      if (!spread?.cards?.length) return;

      const spreadId = sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID;
      const spreadType =
        sessionSpreadMetaRef.current?.spreadType ??
        (spread.type === "intention_spread" ? "new" : "daily");
      const cardNames = spread.cards.map((c) => c.name);
      if (!hasCompleteSpread(cardNames, spreadId, spreadType)) return;

      const intention = normalizeSessionIntention(spread.intention);

      if (spread.type === "intention_spread" && intention) {
        setIntentionSpread({
          masterId: characterId,
          cards: spread.cards as SpreadSymbol[],
          system: spread.system,
          intention,
        });
        persistIntentionSpreadState(characterId, {
          cardsKey: spread.cardsKey,
          cards: spread.cards,
          system: spread.system,
          intention,
        });
        setSessionIntention(intention);
        persistSessionIntention(characterId, intention);
      } else if (hasCompleteSpread(cardNames, spreadId, spreadType)) {
        if (isNumerologMaster(characterId) && !intention) {
          setChatSessionSpread({
            masterId: characterId,
            cards: spread.cards as SpreadSymbol[],
            system: spread.system,
          });
        } else if (intention) {
          setIntentionSpread({
            masterId: characterId,
            cards: spread.cards as SpreadSymbol[],
            system: spread.system,
            intention,
          });
          persistIntentionSpreadState(characterId, {
            cardsKey: spread.cardsKey,
            cards: spread.cards,
            system: spread.system,
            intention,
          });
          setSessionIntention(intention);
          persistSessionIntention(characterId, intention);
        } else {
          setChatSessionSpread({
            masterId: characterId,
            cards: spread.cards as SpreadSymbol[],
            system: spread.system,
          });
        }
      }

      setSpreadFlipped(spreadFlippedState(spread.cards.length, true));
    },
    [
      selectedCharacterRef,
      setIntentionSpread,
      setSessionIntention,
      setChatSessionSpread,
      setSpreadFlipped,
    ]
  );

  useEffect(() => {
    applyRestoredChatSpreadRef.current = applyRestoredChatSpread;
  }, [applyRestoredChatSpread, applyRestoredChatSpreadRef]);

  const applyHistorySessionMeta = useCallback(
    (
      data: {
        sessionId?: string | null;
        intention?: string | null;
        spreadType?: string | null;
        spreadId?: string | null;
        cards?: string[] | null;
        numerologToolId?: import("@/lib/numerology/tools").NumerologToolId | null;
        numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams | null;
        spread?:
          | {
              cards: { name: string; meaning?: string }[];
              system: DeckSystem;
              type: string;
              cardsKey: string;
              intention?: string | null;
            }
          | null;
      },
      characterId: string
    ) => {
      if (characterId !== selectedCharacterRef.current) return;

      const intention = normalizeSessionIntention(
        data.intention ?? data.spread?.intention ?? null
      );
      if (intention) {
        setSessionIntention(intention);
        persistSessionIntention(characterId, intention);
      } else {
        const persisted = readIntentionSpreadForMaster(characterId);
        if (!persisted?.intention) {
          setSessionIntention(null);
          persistSessionIntention(characterId, null);
        }
      }

      const cardNames =
        data.cards?.length ? data.cards : (data.spread?.cards?.map((c) => c.name) ?? []);
      const spreadId = data.spreadId ?? sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID;
      const numerologToolId = isNumerologMaster(characterId)
        ? resolveNumerologToolId(
            data.spreadId ?? sessionSpreadMetaRef.current?.spreadId,
            data.numerologToolId ?? sessionSpreadMetaRef.current?.numerologToolId
          )
        : null;
      const numerologToolParams =
        data.numerologToolParams ?? sessionSpreadMetaRef.current?.numerologToolParams;

      const profile = getActiveProfile();
      const inferredSpreadType = inferDailySpreadType({
        explicitSpreadType: data.spreadType,
        sessionSpreadType: data.spreadType,
        sessionIntention: intention,
        cards:
          isNumerologMaster(characterId) && numerologToolId
            ? numerologSpreadComplete(cardNames, numerologToolId)
              ? buildNumerologSpreadCards(characterId, cardNames, numerologToolId).spreadCards
              : []
            : hasCompleteSpread(cardNames, spreadId, data.spreadType)
              ? buildSessionSpreadCards(characterId, cardNames).spreadCards
              : [],
        profile,
      });
      const spreadType: "daily" | "new" =
        inferredSpreadType ??
        ((data.spreadType as "daily" | "new" | undefined) ?? "new");

      if (cardNames.length) {
        sessionSpreadMetaRef.current = {
          spreadType,
          spreadId,
          cardNames,
          ...(numerologToolId
            ? {
                numerologToolId,
                numerologToolParams,
              }
            : {}),
        };
      } else {
        sessionSpreadMetaRef.current = null;
      }

      if (data.spread?.cards?.length) {
        applyRestoredChatSpread(data.spread, characterId);
      } else if (hasCompleteSpread(cardNames, spreadId, spreadType) && intention) {
        const system = resolveMasterDeckSystem(characterId);
        const symbols = resolveSpreadSymbols(system, cardNames);
        if (hasCompleteSpread(symbols.map((c) => c.name), spreadId, spreadType)) {
          const cardsKey = spreadKey(symbols);
          setIntentionSpread({ masterId: characterId, cards: symbols, system, intention });
          persistIntentionSpreadState(characterId, {
            cardsKey,
            cards: symbols,
            system,
            intention,
          });
          setSpreadFlipped(spreadFlippedState(symbols.length, true));
        }
      } else if (
        isNumerologMaster(characterId) &&
        numerologToolId &&
        !intention &&
        numerologSpreadComplete(cardNames, numerologToolId)
      ) {
        const drawCount = numerologToolDrawCount(numerologToolId);
        if (drawCount > 0) {
          const { spreadCards, system } = buildNumerologSpreadCards(
            characterId,
            cardNames,
            numerologToolId
          );
          setChatSessionSpread({ masterId: characterId, cards: spreadCards, system });
          setSpreadFlipped(spreadFlippedState(spreadCards.length, true));
        } else {
          setChatSessionSpread(null);
          setSpreadFlipped([]);
        }
      } else if (
        hasCompleteSpread(cardNames, DEFAULT_SPREAD_ID, "daily") &&
        spreadType === "daily" &&
        !intention &&
        !isNumerologMaster(characterId)
      ) {
        const { spreadCards, system } = buildSessionSpreadCards(characterId, cardNames);
        setChatSessionSpread({ masterId: characterId, cards: spreadCards, system });
        setSpreadFlipped(spreadFlippedState(spreadCards.length, true));
      } else if (!readIntentionSpreadForMaster(characterId)) {
        setIntentionSpread(null);
        persistIntentionSpreadState(characterId, null);
      }
    },
    [
      selectedCharacterRef,
      applyRestoredChatSpread,
      setSessionIntention,
      sessionSpreadMetaRef,
      setIntentionSpread,
      setChatSessionSpread,
      setSpreadFlipped,
      getActiveProfile,
    ]
  );

  useEffect(() => {
    if (exitingToSessionListRef.current) return;
    if (!selectedCharacter) {
      prevSelectedCharacterRef.current = null;
      chatLoadedForRef.current = null;
      return;
    }
    if (prevSelectedCharacterRef.current !== selectedCharacter) {
      prevSelectedCharacterRef.current = selectedCharacter;
      chatLoadedForRef.current = null;
      loadReadingAttemptKeyRef.current = null;
      loadReadingInFlightKeyRef.current = null;
      setSpreadReadingRitualOpen(false);
      setMessages([]);
      setHistoryHasMore(false);
      setIsLoadingHistory(true);

      const preserveSessionStart =
        pendingNewChatThreadRef.current ||
        readingInFlightRef.current ||
        skipNextReadingRef.current;
      if (!preserveSessionStart) {
        setSessionIntention(null);
        setIntentionSpread(null);
        setIntentionHighlight(false);
        setIntentionSpreadLoading(false);
        setSessionOnlyChat(false);
        setHideChatSpread(false);
        setSpreadFlipped(spreadFlippedState(3, false));
      }
    }
  }, [
    selectedCharacter,
    exitingToSessionListRef,
    prevSelectedCharacterRef,
    chatLoadedForRef,
    pendingNewChatThreadRef,
    readingInFlightRef,
    skipNextReadingRef,
    setSessionIntention,
    setIntentionSpread,
    setIntentionHighlight,
    setIntentionSpreadLoading,
    setSessionOnlyChat,
    setHideChatSpread,
    setSpreadFlipped,
    setMessages,
    setHistoryHasMore,
    setIsLoadingHistory,
  ]);

  useEffect(() => {
    if (exitingToSessionListRef.current) return;
    if (!selectedCharacter || sessionLoading || authLoading || !isLoggedIn) return;
    if (chatLoadedForRef.current === selectedCharacter) {
      setIsLoadingHistory(false);
      return;
    }
    if (readingInFlightRef.current) return;

    const skipSpreadLoad = skipNextReadingRef.current;
    if (skipNextReadingRef.current) {
      skipNextReadingRef.current = false;
    }

    readingInFlightRef.current = true;
    setIsLoadingHistory(true);
    void (async () => {
      try {
        const boundSessionId = await resolveConsultationSessionId(
          selectedCharacter,
          archiveSessionIdRef.current ??
            consultationSessionIdRef.current ??
            undefined
        );
        const restored = await restoreChatForCharacter(selectedCharacter, {
          archiveSessionId: archiveSessionIdRef.current ?? undefined,
          sessionId: boundSessionId ?? undefined,
        });
        chatLoadedForRef.current = selectedCharacter;

        if (restored?.sessionId) setConsultationSessionId(restored.sessionId);
        if (restored?.status === "completed") setConsultationReadOnly(true);

        applyHistorySessionMeta(restored ?? {}, selectedCharacter);

        if (restored?.spread) {
          applyRestoredChatSpread(restored.spread, selectedCharacter);
        }

        if (restored !== null) {
          setHistoryHasMore(restored.hasMore);
          const archiveId = archiveSessionIdRef.current;
          if (restored.messages.length > 0) {
            setMessages(restored.messages);
            if (sessionOnlyChat || chatHasSpreadReading(restored.messages)) return;
          } else if (archiveId && restored.sessionId) {
            setMessages([]);
            if (skipSpreadLoad) return;
          } else if (sessionOnlyChat) {
            setMessages(sessionWelcome(selectedCharacter));
            return;
          }
          if (skipSpreadLoad) return;
          if (needsSpreadFlip && !allSpreadFlipped) return;
          const attemptKey = `${selectedCharacter}:${activeSpreadCardsKey}`;
          if (loadReadingAttemptKeyRef.current === attemptKey) return;
          if (loadReadingInFlightKeyRef.current === attemptKey) return;
          if (insufficientRunes) return;
          if (shouldAutoLoadSpreadReading(selectedCharacter, activeSpreadCardsKey)) {
            setIsLoadingHistory(false);
            await loadReading(selectedCharacter);
          }
          return;
        }

        if (sessionOnlyChat) {
          setMessages(sessionWelcome(selectedCharacter));
          return;
        }

        if (skipSpreadLoad) return;
        if (needsSpreadFlip && !allSpreadFlipped) return;
        const attemptKey = `${selectedCharacter}:${activeSpreadCardsKey}`;
        if (loadReadingAttemptKeyRef.current === attemptKey) return;
        if (loadReadingInFlightKeyRef.current === attemptKey) return;
        if (insufficientRunes) return;
        if (shouldAutoLoadSpreadReading(selectedCharacter, activeSpreadCardsKey)) {
          setIsLoadingHistory(false);
          await loadReading(selectedCharacter);
        }
      } finally {
        setIsLoadingHistory(false);
        readingInFlightRef.current = false;
      }
    })();
  }, [
    selectedCharacter,
    sessionLoading,
    authLoading,
    isLoggedIn,
    sessionOnlyChat,
    loadReading,
    restoreChatForCharacter,
    masters,
    activeSpreadCardsKey,
    needsSpreadFlip,
    allSpreadFlipped,
    shouldAutoLoadSpreadReading,
    insufficientRunes,
    savedReadings,
    applyRestoredChatSpread,
    applyHistorySessionMeta,
    exitingToSessionListRef,
    chatLoadedForRef,
    readingInFlightRef,
    skipNextReadingRef,
    archiveSessionIdRef,
    setIsLoadingHistory,
    setConsultationSessionId,
    setConsultationReadOnly,
    setHistoryHasMore,
    setMessages,
    sessionWelcome,
    messages.length,
  ]);

  useEffect(() => {
    if (!selectedCharacter || !isNumerologMaster(selectedCharacter)) return;
    if (sessionOnlyChat || isLoadingHistory) return;
    if (chatHasSpreadReading(messages)) return;
    if ((chatDisplaySpread?.cards?.length ?? 0) < (chatDisplaySpread?.cardCount ?? 3)) return;
    if (readingInFlightRef.current || isLoading) return;
    const stuckOnTeaser =
      messages.length === 1 &&
      messages[0]?.role === "assistant" &&
      /готовит полную расшифровку/i.test(messages[0]?.content ?? "");
    if (!stuckOnTeaser) return;
    void loadReading(selectedCharacter);
  }, [
    selectedCharacter,
    messages,
    chatDisplaySpread?.cards?.length,
    sessionOnlyChat,
    isLoadingHistory,
    isLoading,
    loadReading,
    readingInFlightRef,
  ]);

  useEffect(() => {
    if (!selectedCharacter || !allSpreadFlipped || sessionOnlyChat) return;
    if (chatHasSpreadReading(messages)) return;
    if (readingInFlightRef.current || isLoadingHistory) return;
    if (!needsSpreadFlip) return;
    if (
      intentionSpread?.masterId === selectedCharacter &&
      intentionSpread.cards.length
    ) return;
    if (!shouldAutoLoadSpreadReading(selectedCharacter, activeSpreadCardsKey)) return;
    if (insufficientRunes) return;

    const attemptKey = `${selectedCharacter}:${activeSpreadCardsKey}`;
    if (loadReadingAttemptKeyRef.current === attemptKey) return;
    if (loadReadingInFlightKeyRef.current === attemptKey) return;

    readingInFlightRef.current = true;
    void loadReading(selectedCharacter).finally(() => {
      readingInFlightRef.current = false;
    });
  }, [
    allSpreadFlipped,
    selectedCharacter,
    sessionOnlyChat,
    needsSpreadFlip,
    messages,
    loadReading,
    isLoadingHistory,
    intentionSpread,
    shouldAutoLoadSpreadReading,
    activeSpreadCardsKey,
    readingInFlightRef,
  ]);

  useEffect(() => {
    if (!selectedCharacter || sessionOnlyChat || isLoadingHistory) return;
    if (chatHasSpreadReading(messages)) return;
    if (readingInFlightRef.current || isLoading) return;

    const activeProfile = getActiveProfile();
    if (!activeProfile) return;

    const cardsForMaster = resolveSpreadCardsForReading({
      profile: activeProfile,
      characterId: selectedCharacter,
      masters,
      sessionSpreadMeta: sessionSpreadMetaRef.current,
      intentionSpread,
      chatSessionSpread,
      chatDisplaySpread,
    });
    const meta = sessionSpreadMetaRef.current;
    const spreadId = meta?.spreadId ?? DEFAULT_SPREAD_ID;
    const spreadType = meta?.spreadType ?? "new";
    if (
      !hasCompleteSpread(
        cardsForMaster.map((c) => c.name),
        spreadId,
        spreadType
      )
    ) {
      return;
    }

    const cardsKey = spreadKey(cardsForMaster);
    const saved = findSavedSpreadReading(savedReadings, selectedCharacter, cardsKey);
    if (!saved?.contextData) return;

    const ctx = saved.contextData as { reading?: string };
    const readingText = coerceSpreadReadingText(
      ctx.reading ?? "",
      cardsForMaster.map((c) => c.name)
    );
    if (!readingText) return;

    setMessages((prev) => {
      if (chatHasSpreadReading(prev)) return prev;
      return [
        {
          id: generateId(),
          role: "assistant" as const,
          content: readingText,
          timestamp: saved.createdAt ? new Date(saved.createdAt) : new Date(),
        },
        ...prev,
      ];
    });
  }, [
    selectedCharacter,
    sessionOnlyChat,
    isLoadingHistory,
    isLoading,
    messages,
    savedReadings,
    masters,
    getActiveProfile,
    intentionSpread,
    chatSessionSpread,
    chatDisplaySpread,
    sessionSpreadMetaRef,
    readingInFlightRef,
    setMessages,
  ]);

  const openChatWithCharacter = useCallback(
    async (
      characterId: string,
      openOptions?: {
        forceNew?: boolean;
        sessionOnly?: boolean;
        intention?: SessionIntention | null;
      }
    ) => {
      if (!isLoggedIn) return;

      setSessionListMaster(null);
      const openingArchive = Boolean(archiveSessionIdRef.current);

      if (characterId !== selectedCharacterRef.current && !openingArchive) {
        setSessionIntention(null);
        setIntentionSpread(null);
        setIntentionHighlight(false);
        setIntentionSpreadLoading(false);
        setHideChatSpread(false);
      }

      if (openOptions?.sessionOnly !== undefined) {
        setSessionOnlyChat(openOptions.sessionOnly);
      }

      if (openOptions?.intention !== undefined) {
        setSessionIntention(openOptions.intention);
        persistSessionIntention(characterId, openOptions.intention);
        setIntentionHighlight(Boolean(openOptions.intention));
      }

      localStorage.setItem(LAST_MASTER_KEY, characterId);
      localStorage.setItem(FLOW_STEP_KEY, "chat");
      setLastMasterId(characterId);
      setStep("chat");
      if (!openingArchive) {
        setSpreadFlipped(spreadFlippedState(3, false));
      }

      if (openOptions?.forceNew) {
        chatLoadedForRef.current = null;
        skipNextReadingRef.current = false;
        setPhotoChatSpread(null);
        setIntentionSpread(null);
      }

      if (openOptions?.intention === null) {
        setSessionIntention(null);
        persistSessionIntention(characterId, null);
        setIntentionHighlight(false);
      }

      setSelectedCharacter(characterId);
      if (!archiveSessionIdRef.current) {
        const hint = consultationSessionIdRef.current;
        if (hint) {
          void resolveConsultationSessionId(characterId, hint);
        } else {
          void resolveConsultationSessionId(characterId);
        }
      }
    },
    [
      isLoggedIn,
      setStep,
      resolveConsultationSessionId,
      consultationSessionIdRef,
      selectedCharacterRef,
      setSessionListMaster,
      setSessionIntention,
      setIntentionSpread,
      setIntentionHighlight,
      setIntentionSpreadLoading,
      setHideChatSpread,
      setSessionOnlyChat,
      setLastMasterId,
      setSpreadFlipped,
      chatLoadedForRef,
      skipNextReadingRef,
      setPhotoChatSpread,
      setSelectedCharacter,
      archiveSessionIdRef,
    ]
  );

  const handleSendMessage = useCallback(
    async (content: string, imageBase64?: string) => {
      if (!selectedCharacter || !content.trim() || !isLoggedIn || sendingRef.current) return;

      if (usesRuneBilling) {
        const required = imageBase64 ? runeCost("VISION_ANALYSIS") : runeCost("QUESTION");
        const needsRunes =
          imageBase64 ||
          (questionsLeft !== null && questionsLeft <= 0);
        if (needsRunes && runeBalance < required) {
          setInsufficientRunes({ balance: runeBalance, required });
          handleOpenPaywall({
            balance: runeBalance,
            requiredRunes: required,
            shortage: required - runeBalance,
          });
          return;
        }
      }

      if (session?.offline) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: "Сессия не синхронизирована с сервером. Обновите страницу и попробуйте снова.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (
        !imageBase64 &&
        isSessionChatQuestionCapReached(session?.freeQuestionsUsed)
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: SESSION_CHAT_LIMIT_MESSAGE,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (!imageBase64 && FULL_SPREAD_REQUEST_RE.test(content.trim())) {
        const userMessage: Message = {
          id: generateId(),
          role: "user",
          content: content.trim(),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);
        try {
          await loadReading(selectedCharacter, undefined, {
            force: true,
            preserveChat: true,
          });
        } catch (err) {
          console.error("Full spread request failed:", err);
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: "Не удалось получить полный расклад. Попробуйте ещё раз через минуту.",
              timestamp: new Date(),
            },
          ]);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      const periodScope = detectPeriodSpreadScope(content.trim());
      let periodSpreadCards: SpreadSymbol[] | null = null;

      if (!imageBase64 && periodScope && hasMasterQuickChips(selectedCharacter)) {
        const drawn = drawPeriodSpread(selectedCharacter);
        periodSpreadCards = drawn.cards;
        loadReadingAttemptKeyRef.current = null;
        loadReadingInFlightKeyRef.current = null;
        setIntentionSpread(null);
        persistIntentionSpreadState(selectedCharacter, null);
        setSessionIntention(null);
        persistSessionIntention(selectedCharacter, null);
        setChatSessionSpread({
          masterId: selectedCharacter,
          cards: drawn.cards,
          system: drawn.system,
        });
        setSpreadFlipped(spreadFlippedState(drawn.cards.length, true));
        sessionSpreadMetaRef.current = {
          spreadType: "new",
          spreadId: DEFAULT_SPREAD_ID,
          cardNames: drawn.cards.map((c) => c.name),
        };
      }

      sendingRef.current = true;

      const chatSpreadId = sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID;
      const chatSpreadType = sessionSpreadMetaRef.current?.spreadType ?? "new";

      if (
        intentionSpread?.masterId === selectedCharacter &&
        hasCompleteSpread(
          intentionSpread.cards.map((c) => c.name),
          chatSpreadId,
          chatSpreadType
        )
      ) {
        if (!sessionSpreadMetaRef.current) {
          sessionSpreadMetaRef.current = {
            spreadType: "new",
            spreadId: chatSpreadId,
            cardNames: intentionSpread.cards.map((c) => c.name),
          };
        }
        if (!sessionIntention && intentionSpread.intention) {
          setSessionIntention(intentionSpread.intention);
          persistSessionIntention(selectedCharacter, intentionSpread.intention);
        }
      }

      const activeProfile = getActiveProfile();

      const tarotCardsForChat = resolveTarotCardsForOutgoingChat({
        characterId: selectedCharacter,
        sessionSpreadMeta: sessionSpreadMetaRef.current,
        chatSessionSpread,
        intentionSpread,
        periodSpreadCards,
        activeProfile,
        masters,
      });

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      const outgoing = [...messages, userMessage];
      setMessages(outgoing);
      setIsLoading(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      try {
        const chatBody: Record<string, unknown> = {
            characterId: selectedCharacter,
            sessionId: session?.offline ? undefined : session?.sessionId,
            newChatThread: pendingNewChatThreadRef.current,
            messages: outgoing.map((m) => ({ role: m.role, content: m.content })),
            imageBase64,
            userProfile: activeProfile
              ? {
                  name: activeProfile.name,
                  gender: activeProfile.gender === "male" ? "Мужской" : "Женский",
                  zodiac: activeProfile.zodiac,
                  birthDate: activeProfile.birthDate,
                  birthTime: activeProfile.birthTime,
                  birthCity: activeProfile.birthCity,
                  lifeFocus: activeProfile.lifeFocus,
                  mainQuestion: activeProfile.mainQuestion,
                  astroMeta: activeProfile.astroMeta,
                }
              : undefined,
            tarotCards: tarotCardsForChat,
            intention: periodScope ? undefined : sessionIntention ?? undefined,
            customQuestion:
              !periodScope && sessionIntention === "custom"
                ? readSessionCustomQuestion(selectedCharacter) ?? undefined
                : undefined,
            spreadType: periodScope ? undefined : sessionSpreadMetaRef.current?.spreadType,
            spreadId: sessionSpreadMetaRef.current?.spreadId,
            cards:
              periodSpreadCards?.map((c) => c.name) ??
              sessionSpreadMetaRef.current?.cardNames,
            periodSpreadScope: periodScope ?? undefined,
          };

        const platformFeatures = await fetchPlatformFeatures();
        const captchaErr = await attachRecaptchaToken(chatBody, "chat", platformFeatures);
        if (captchaErr) {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              id: generateId(),
              role: "assistant",
              content: captchaErr,
              timestamp: new Date(),
            },
          ]);
          return;
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(chatBody),
        });

        if (response.status === 401) {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              id: generateId(),
              role: "assistant",
              content: "Для чата с мастером нужна регистрация. Войдите или создайте аккаунт.",
              timestamp: new Date(),
            },
          ]);
          return;
        }

        if (response.status === 402) {
          const errData = await response.json().catch(() => ({}));
          const parsed = parseInsufficientRunes(errData);
          if (parsed) {
            setInsufficientRunes({ balance: parsed.balance, required: parsed.required });
            handleOpenPaywall({
              balance: parsed.balance,
              requiredRunes: parsed.required,
              shortage: parsed.shortage,
            });
          } else {
            handleOpenPaywall();
          }
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        if (response.status === 403) {
          const errData = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (errData.error === "session_question_limit") {
            setMessages((prev) => [
              ...prev.slice(0, -1),
              {
                id: generateId(),
                role: "assistant",
                content: errData.message ?? SESSION_CHAT_LIMIT_MESSAGE,
                timestamp: new Date(),
              },
            ]);
            if (session?.sessionId && !session.offline) {
              void refresh(session.sessionId).catch(() => undefined);
            }
            return;
          }
        }

        if (response.status === 429) {
          const errData = await response.json().catch(() => ({}));
          const rl = getRateLimitPayload(errData);
          showRateLimit(rl?.action ?? "default", rl?.retryAfter);
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const replyId = generateId();

        if (contentType.includes("text/event-stream") && response.body) {
          setMessages((prev) => [
            ...prev,
            { id: replyId, role: "assistant", content: "", timestamp: new Date() },
          ]);

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = "";
          let streamMeta: Record<string, unknown> = {};

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

            for (const line of lines) {
              const data = line.replace("data: ", "").trim();
              if (data === "[DONE]") break;
              try {
                const json = JSON.parse(data) as {
                  token?: string;
                  type?: string;
                  reply?: string;
                  llmFailed?: boolean;
                  runeBalance?: number;
                  sessionId?: string;
                  numerologyUi?: Message["numerologyUi"];
                  achievement?: {
                    label: string;
                    description: string;
                    bonus: number;
                    phrase: string;
                  };
                };
                if (json.type === "done") {
                  streamMeta = json;
                  if (typeof json.reply === "string") {
                    fullText = json.reply;
                  }
                } else if (json.token) {
                  fullText += json.token;
                }
                const displayText =
                  json.type === "done"
                    ? fullText
                    : stripMemoryLeakFromReply(fullText);
                const doneNumerologyUi =
                  json.type === "done" ? json.numerologyUi : undefined;
                setMessages((prev) => {
                  const updated = [...prev];
                  const idx = updated.findIndex((m) => m.id === replyId);
                  if (idx >= 0) {
                    updated[idx] = {
                      ...updated[idx]!,
                      content: displayText,
                      ...(doneNumerologyUi ? { numerologyUi: doneNumerologyUi } : {}),
                    };
                  }
                  return updated;
                });
              } catch {
                /* skip malformed */
              }
            }
          }

          const llmFailed = Boolean(streamMeta.llmFailed);
          if (typeof streamMeta.runeBalance === "number") {
            setRuneBalance(streamMeta.runeBalance);
            emitRuneBalanceUpdate(streamMeta.runeBalance);
            setInsufficientRunes(null);
          }
          setRetryDraft(null);

          if (!llmFailed && fullText) {
            void attachSceneToAssistantMessage(
              replyId,
              fullText,
              selectedCharacter,
              "scene_illustration",
              content.trim()
            );
          }

          if (typeof streamMeta.sessionId === "string" && streamMeta.sessionId) {
            localStorage.setItem("aura_session_id", streamMeta.sessionId);
          }
          const refreshSessionId =
            typeof streamMeta.sessionId === "string" && streamMeta.sessionId
              ? streamMeta.sessionId
              : session?.sessionId && !session.offline
                ? session.sessionId
                : undefined;
          if (refreshSessionId) {
            void refresh(refreshSessionId).catch(() => undefined);
          }

          const streamNumerologyUi = streamMeta.numerologyUi as
            | Message["numerologyUi"]
            | undefined;
          if (streamNumerologyUi?.pythagorasSquare) {
            setMessages((prev) =>
              applyNumerologyUiToLastAssistant(prev, streamNumerologyUi)
            );
          }

          const ach = streamMeta.achievement as {
            label: string;
            description: string;
            bonus: number;
            phrase: string;
          } | undefined;
          if (ach?.label) {
            setAchievementPopup(ach);
            setTimeout(() => setAchievementPopup(null), 4000);
          }

          return;
        }

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Chat failed");
        }

        if (typeof data.runeBalance === "number") {
          setRuneBalance(data.runeBalance);
          emitRuneBalanceUpdate(data.runeBalance);
          setInsufficientRunes(null);
        }

        setRetryDraft(null);

        const rawReply = data.reply ?? "Энергии сегодня нестабильны. Попробуйте позже.";
        const reply = stripMemoryLeakFromReply(rawReply) || rawReply;

        setMessages((prev) => [
          ...prev,
          {
            id: replyId,
            role: "assistant",
            content: reply,
            timestamp: new Date(),
            ...(data.numerologyUi ? { numerologyUi: data.numerologyUi as Message["numerologyUi"] } : {}),
          },
        ]);

        if (!data.llmFailed) {
          void attachSceneToAssistantMessage(
            replyId,
            reply,
            selectedCharacter,
            "scene_illustration",
            content.trim()
          );
        }

        if (data.achievement?.label) {
          setAchievementPopup(data.achievement);
          setTimeout(() => setAchievementPopup(null), 4000);
        }

        if (typeof data.sessionId === "string" && data.sessionId) {
          localStorage.setItem("aura_session_id", data.sessionId);
        }
        const refreshSessionId =
          typeof data.sessionId === "string" && data.sessionId
            ? data.sessionId
            : session?.sessionId && !session.offline
              ? session.sessionId
              : undefined;
        if (refreshSessionId) {
          void refresh(refreshSessionId).catch(() => undefined);
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setRetryDraft({ content: content.trim(), imageBase64 });
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            id: generateId(),
            role: "assistant",
            content: aborted
              ? "Мастер думал слишком долго — повторите вопрос."
              : "Связь с астральным планом прервана. Нажмите «Отправить снова».",
            timestamp: new Date(),
          },
        ]);
        if (session?.sessionId && !session.offline) {
          await refresh(session.sessionId).catch(() => undefined);
        }
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
        sendingRef.current = false;
        pendingNewChatThreadRef.current = false;
      }
    },
    [
      selectedCharacter,
      isLoggedIn,
      sendingRef,
      usesRuneBilling,
      runeCost,
      questionsLeft,
      runeBalance,
      setInsufficientRunes,
      handleOpenPaywall,
      session?.offline,
      session?.sessionId,
      session?.freeQuestionsUsed,
      setMessages,
      loadReading,
      setIsLoading,
      intentionSpread,
      sessionSpreadMetaRef,
      sessionIntention,
      setSessionIntention,
      getActiveProfile,
      masters,
      chatSessionSpread,
      messages,
      pendingNewChatThreadRef,
      setRuneBalance,
      setRetryDraft,
      attachSceneToAssistantMessage,
      refresh,
      setAchievementPopup,
      showRateLimit,
      setIntentionSpread,
      persistIntentionSpreadState,
      setChatSessionSpread,
      setSpreadFlipped,
    ]
  );

  return {
    isLoading,
    setIsLoading,
    readingInFlightRef,
    loadReading,
    handleSendMessage,
    openChatWithCharacter,
    applyRestoredChatSpread,
    applyHistorySessionMeta,
  };
}
