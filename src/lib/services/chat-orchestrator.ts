import { NextResponse } from "next/server";

import { checkAchievements } from "@/lib/achievements";
import {
  buildCharacterPrompt,
  buildChatPrompt,
  buildHumanChatPrompt,
  buildHumanReadingPrompt,
  generateChatReply,
  regenerateChatReply,
  llmUnavailableReply,
  type UserContext,
} from "@/lib/chat-prompts";
import {
  buildPaidSpreadReadingExtras,
  paidSpreadMaxTokens,
} from "@/lib/prompts/premium-reading";
import {
  resolveApiCharacterId,
  sanitizeChatHistory,
  sanitizeUserProfileForPrompt,
  LLM_CONTEXT_MESSAGES,
  type ChatHistoryMessage,
  type SanitizedUserProfile,
} from "@/lib/chat-sanitize";
import {
  normalizePersonDisplayName,
  normalizePersonDisplayNameOr,
} from "@/lib/normalize-person-name";
import { createChatResponseStream, createDeterministicTextStream } from "@/lib/chat-stream";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { completeProseWithContinuation } from "@/lib/prose-completion";
import {
  ensurePaidSpreadTextComplete,
  isPaidSpreadTextComplete,
} from "@/lib/spread-reading-complete";
import {
  evaluatePaidReadingQuality,
  meetsPaidDensityFloor,
  normalizePaidReadingStructure,
} from "@/lib/reading-quality-gate";
import type { ChatMessage } from "@/lib/llm";
import { query } from "@/lib/db";
import { intentionPromptBlock } from "@/lib/intention";
import { buildSpreadBlock, buildPeriodSpreadBlock } from "@/lib/spread-block";
import {
  getSpread,
  hasCompleteSpread,
  limitSpreadKeyCards,
  normalizeSpreadId,
  requiredCardCount,
  resolveSpreadPositions,
  sliceForSpread,
} from "@/lib/spreads";
import { isSessionTopicId } from "@/lib/session-topics";
import {
  LIFE_DEATH_TOPIC,
  LIFE_DEATH_LLM_OVERRIDE,
  LIFE_DEATH_AFTER_CONTEXT,
} from "@/lib/prompts/topics";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getRuneSettings } from "@/lib/rune-settings";
import { ensureChatSession, resolveSessionForUser } from "@/lib/session-access";
import {
  countSessionMemories,
  getSessionMemories,
  maybePersistSessionMemory,
  upsertSessionMemoryFromChat,
} from "@/lib/session-memory";
import type { ChargeChatBillingParams } from "@/lib/services/billing-service";
import type { ChatBillingHandle } from "@/lib/services/billing-service";
import { ClientMemory } from "@/lib/memory/client-memory";
import { assertChatProactivity } from "@/lib/chat-proactivity";
import {
  buildNumerologyPromptContext,
  generateNumerologStreamReply,
  tryNumerologEngineFallback,
  type NumerologEngineParams,
  type NumerologyUi,
} from "@/lib/services/numerology-service";
import { buildNatalPromptContext } from "@/lib/prompts/natal-context";
import { buildHdPromptContext } from "@/lib/prompts/hd-context";
import { resolveMatrixAwareFreeQuestionLimit } from "@/lib/numerology/matrix-chat-allowance";
import {
  getSession,
  saveMessage,
  getFreeQuestionLimit,
  getBloggerBySlug,
  getBloggerKnowledge,
  getSessionMessagesForLlm,
  setSessionAwaitingContext,
  getSessionChatMeta,
  updateSessionChatMeta,
  type SessionRow,
} from "@/lib/session";
import { ensureDb } from "@/lib/db";
import { getUserById, profileGenderForPersonalization } from "@/lib/users";
import { MAX_IMAGE_BYTES, validateImageBase64Payload, validateLastUserMessage } from "@/lib/api-guards";
import { appendUserMemoryToPrompt, buildPeriodSpreadAnchorBlock } from "@/lib/user-memory";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  recoverSpreadMetaFromChatMessages,
  recoverSpreadMetaFromHistory,
} from "@/lib/session-spread-meta";
import {
  chatReplyRejectionReason,
  isRejectedChatReply,
  stripMemoryLeakFromReply,
  type ChatReplyQualityOpts,
} from "@/lib/chat-reply-sanitize";
import {
  detectPeriodSpreadScope,
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import { filterLlmMessagesByTopic } from "@/lib/memory/memory-relevance";
import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";
import { topicLabel, isValidSessionIntention, type SessionTopicId } from "@/lib/session-topics";

export type ChatRequestBody = {
  characterId: string;
  messages: { role: string; content: string }[];
  imageBase64?: string;
  sessionId?: string;
  newChatThread?: boolean;
  intention?: string;
  spreadType?: "daily" | "new";
  spreadId?: string;
  cards?: string[];
  userProfile?: {
    name: string;
    gender: string;
    zodiac: string;
    birthDate: string;
    birthTime?: string;
    birthCity?: string;
    lifeFocus?: string;
    mainQuestion?: string;
    astroMeta?: import("@/lib/astro-profile").AstroMeta;
  };
  tarotCards?: { name: string; meaning: string }[];
  periodSpreadScope?: PeriodSpreadScope;
  customQuestion?: string;
};

export type ChatOrchestratorPrepareResult =
  | {
      ok: true;
      orchestrator: ChatOrchestrator;
      billingParams: ChargeChatBillingParams;
    }
  | { ok: false; response: NextResponse };

/**
 * Parses and validates the chat POST body. Returns 4xx responses on invalid input.
 */
export type ParsedChatRequest = ChatRequestBody & {
  characterId: string;
  messages: ChatHistoryMessage[];
};

export async function parseChatRequest(
  body: unknown
): Promise<
  | { ok: true; parsed: ParsedChatRequest }
  | { ok: false; response: NextResponse }
> {
  const raw = body as ChatRequestBody;

  let characterId: string;
  try {
    characterId = await resolveApiCharacterId(raw.characterId);
  } catch (charErr) {
    const message = charErr instanceof Error ? charErr.message : "Invalid characterId";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }

  const messages = sanitizeChatHistory(raw.messages ?? []);
  if (!messages.length) {
    return { ok: false, response: NextResponse.json({ error: "messages required" }, { status: 400 }) };
  }

  const msgError = validateLastUserMessage(messages);
  if (msgError) return { ok: false, response: msgError };

  if (raw.imageBase64) {
    const rawSize = Math.ceil((raw.imageBase64.length * 3) / 4);
    if (rawSize > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 400 }),
      };
    }
    const imageErr = validateImageBase64Payload(raw.imageBase64);
    if (imageErr) return { ok: false, response: imageErr };
  }

  return {
    ok: true,
    parsed: {
      ...raw,
      characterId,
      messages,
    },
  };
}

export class ChatOrchestrator {
  private dbOk = false;
  private profileUserId: string | null = null;
  private unlimited = false;
  private runeSettings: Awaited<ReturnType<typeof getRuneSettings>> | null = null;
  private freeLimit = 0;
  private session: SessionRow | null = null;
  private chatSessionCreated = false;
  private billingHandle: ChatBillingHandle | null = null;

  private characterId: string;
  private messages: ChatHistoryMessage[];
  private userProfile: SanitizedUserProfile | undefined;
  private imageBase64?: string;
  private tarotCards?: { name: string; meaning: string }[];
  private intention?: string;
  private customQuestion?: string;
  private spreadType?: "daily" | "new";
  private spreadCardNames?: string[];
  private spreadId?: string;
  private periodSpreadScope?: PeriodSpreadScope;

  private resolvedIntention?: string;
  private resolvedSpreadType?: "daily" | "new";
  private resolvedSpreadId?: string;
  private resolvedCardNames: string[] = [];
  /** Default false — ask-first for life_death until awaiting_context clears. */
  private lifeDeathReadyToRead = false;
  private llmMessages: { role: string; content: string }[] = [];
  private lastUserMsg = "";
  private numerologParams: NumerologEngineParams | null = null;
  private numerologyUi: NumerologyUi | undefined;
  private memoryBlock = "";
  private memoryQuery = "";
  private clientMemoryBlock = "";
  private lastSystemPrompt = "";
  private chatTemperature: number | undefined;

  private constructor(parsed: ParsedChatRequest) {
    this.characterId = parsed.characterId;
    this.messages = parsed.messages;
    this.userProfile = sanitizeUserProfileForPrompt(parsed.userProfile);
    this.imageBase64 = parsed.imageBase64;
    this.tarotCards = parsed.tarotCards;
    this.intention = parsed.intention;
    this.customQuestion = parsed.customQuestion?.trim() || undefined;
    this.spreadType = parsed.spreadType;
    this.spreadCardNames = parsed.cards;
    this.spreadId = parsed.spreadId;
    this.lastUserMsg = parsed.messages[parsed.messages.length - 1]?.content ?? "";
    this.periodSpreadScope =
      parsed.periodSpreadScope ??
      detectPeriodSpreadScope(this.lastUserMsg) ??
      undefined;
    this.resolvedIntention = parsed.intention;
    this.resolvedSpreadType = parsed.spreadType;
    this.resolvedSpreadId = parsed.spreadId;
    this.resolvedCardNames = parsed.cards?.length ? [...parsed.cards] : [];
  }

  /** Load profile, ensure DB session — call before billing. */
  static async prepare(
    accountId: string,
    parsed: ParsedChatRequest
  ): Promise<ChatOrchestratorPrepareResult> {
    const orch = new ChatOrchestrator(parsed);

    orch.dbOk = await ensureDb();
    orch.profileUserId = await getProfileUserIdForAccount(accountId);

    if (orch.profileUserId) {
      const serverProfile = await getUserById(orch.profileUserId);
      if (serverProfile) {
        const knownGender = profileGenderForPersonalization(serverProfile);
        orch.userProfile = {
          name: serverProfile.name,
          gender: knownGender ?? "",
          zodiac: serverProfile.zodiac,
          birthDate: serverProfile.birth_date ?? undefined,
          birthTime: serverProfile.birth_time ?? undefined,
          birthCity: serverProfile.birth_city ?? undefined,
          lifeFocus: serverProfile.life_focus ?? undefined,
          mainQuestion: serverProfile.main_question ?? undefined,
          astroMeta: serverProfile.astro_meta as import("@/lib/astro-profile").AstroMeta,
        };
      }
    }

    orch.unlimited = await resolveUnlimitedAccess({
      accountId,
      profileUserId: orch.profileUserId ?? undefined,
    });

    orch.runeSettings = await getRuneSettings();
    orch.freeLimit = await getFreeQuestionLimit();

    const sessionError = await orch.ensureSession(parsed.sessionId, parsed.newChatThread);
    if (sessionError) {
      return { ok: false, response: sessionError };
    }

    orch.freeLimit = await resolveMatrixAwareFreeQuestionLimit({
      baseLimit: orch.freeLimit,
      profileUserId: orch.profileUserId,
      birthDate: orch.userProfile?.birthDate,
      spreadId: orch.session?.spread_id,
      requestSpreadId: orch.spreadId,
      numerologToolParams: orch.session?.numerolog_tool_params ?? null,
    });

    return {
      ok: true,
      orchestrator: orch,
      billingParams: {
        dbOk: orch.dbOk,
        profileUserId: orch.profileUserId,
        session: orch.session,
        unlimited: orch.unlimited,
        runeSettings: orch.runeSettings,
        freeLimit: orch.freeLimit,
        imageBase64: orch.imageBase64,
      },
    };
  }

  applyBilling(handle: ChatBillingHandle, session: SessionRow | null): void {
    this.billingHandle = handle;
    this.session = session;
  }

  /** Main pipeline: session meta → numerolog or LLM stream → SSE response. */
  async run(): Promise<Response> {
    await this.syncSessionMeta();
    await this.persistUserMessage();
    await this.loadPromptMemory();
    await this.loadLlmMessages();

    this.numerologyUi = undefined;
    this.numerologParams = this.buildNumerologParams();

    const numerologReply = await generateNumerologStreamReply(this.numerologParams);
    if (numerologReply) {
      this.numerologyUi = numerologReply.numerologyUi;
      return this.streamDeterministicReply(numerologReply.reply, { engineReply: true });
    }

    const systemPrompt = await this.buildSystemPrompt();
    this.lastSystemPrompt = systemPrompt;
    this.chatTemperature = this.resolvedIntention === "life_death" ? 0.4 : undefined;

    if (this.isLongFormSpreadReply() && !this.imageBase64) {
      return this.runBufferedSpreadReply(systemPrompt);
    }

    const streamResponse = await createChatResponseStream({
      systemPrompt,
      messages: this.llmMessages,
      imageBase64: this.imageBase64,
      temperature: this.chatTemperature,
      maxTokens: this.streamMaxTokens(),
      qualityOpts: this.chatQualityOpts(),
      onComplete: (meta) => this.handleStreamComplete(meta),
    });

    if (streamResponse) {
      return streamResponse;
    }

    return this.runNonStreamingFallback(systemPrompt, this.chatTemperature);
  }

  private async ensureSession(
    sessionId: string | undefined,
    newChatThread: boolean | undefined
  ): Promise<NextResponse | null> {
    if (this.dbOk && this.profileUserId) {
      const ensured = await ensureChatSession(sessionId, this.profileUserId, {
        forceNew: Boolean(newChatThread),
      });
      if (ensured.error) return ensured.error;
      this.session = ensured.session;
      this.chatSessionCreated = ensured.created;

      if (this.session && ensured.created && this.intention === "life_death") {
        try {
          await setSessionAwaitingContext(this.session.id, true);
          this.session = { ...this.session, awaiting_context: true };
        } catch (flagErr) {
          console.warn("awaiting_context set failed:", flagErr);
        }
      }
    } else if (sessionId && this.dbOk) {
      const candidate = await getSession(sessionId);
      if (candidate?.user_id) {
        return NextResponse.json({ error: "session_forbidden" }, { status: 403 });
      }
    }

    return null;
  }

  private async syncSessionMeta(): Promise<void> {
    if (!this.dbOk || !this.session) return;

    if (this.periodSpreadScope) {
      this.intention = undefined;
      this.resolvedIntention = undefined;
    }

    if (this.profileUserId) {
      const resolved = await resolveSessionForUser(this.session.id, this.profileUserId);
      if (resolved.error) {
        throw new Error("session_forbidden");
      }
      if (resolved.session) {
        this.session = resolved.session;
      }
    }

    try {
      const meta = await getSessionChatMeta(this.session.id);
      if (meta) {
        if (!this.periodSpreadScope && !this.resolvedIntention && meta.intention) {
          this.resolvedIntention = meta.intention;
        }
        if (!this.resolvedSpreadType && meta.spread_type) {
          this.resolvedSpreadType = meta.spread_type as "daily" | "new";
        }
        if (!this.resolvedSpreadId && meta.spread_id) {
          this.resolvedSpreadId = meta.spread_id;
        }
        if (!this.resolvedCardNames.length && meta.cards?.length) {
          this.resolvedCardNames = meta.cards;
        }
      }
    } catch (metaErr) {
      console.warn("Session meta load failed:", metaErr);
    }

    if (
      this.profileUserId &&
      !this.periodSpreadScope &&
      (!this.resolvedCardNames.length || !this.resolvedIntention)
    ) {
      try {
        const recovered = await recoverSpreadMetaFromHistory(
          this.profileUserId,
          this.characterId,
          this.session.id
        );
        if (recovered) {
          if (!this.resolvedIntention && recovered.intention) {
            this.resolvedIntention = recovered.intention;
          }
          if (!this.resolvedSpreadType && recovered.spreadType) {
            this.resolvedSpreadType = recovered.spreadType;
          }
          if (!this.resolvedSpreadId && recovered.spreadId) {
            this.resolvedSpreadId = recovered.spreadId;
          }
          const recoverSpreadId = this.resolvedSpreadId ?? this.spreadId;
          if (
            !this.resolvedCardNames.length &&
            hasCompleteSpread(recovered.cards, recoverSpreadId, recovered.spreadType)
          ) {
            this.resolvedCardNames = sliceForSpread(
              recovered.cards,
              recoverSpreadId,
              recovered.spreadType
            );
          }
        }
      } catch (recoverErr) {
        console.warn("Session meta history recover failed:", recoverErr);
      }
    }

    if (this.profileUserId && !this.resolvedCardNames.length) {
      try {
        const fromChat = await recoverSpreadMetaFromChatMessages(
          this.session.id,
          this.characterId,
          this.profileUserId
        );
        const recoverSpreadId = this.resolvedSpreadId ?? this.spreadId;
        if (
          hasCompleteSpread(fromChat, recoverSpreadId, this.resolvedSpreadType ?? this.spreadType)
        ) {
          this.resolvedCardNames = sliceForSpread(
            fromChat,
            recoverSpreadId,
            this.resolvedSpreadType ?? this.spreadType
          );
        }
      } catch (chatRecoverErr) {
        console.warn("Session meta chat recover failed:", chatRecoverErr);
      }
    }

    try {
      const activeSpreadId = this.resolvedSpreadId ?? this.spreadId;
      const cardNames = this.spreadCardNames?.length
        ? this.spreadCardNames
        : this.resolvedCardNames.length
          ? this.resolvedCardNames
          : sliceForSpread(
              this.tarotCards?.map((c) => c.name) ?? [],
              activeSpreadId,
              this.resolvedSpreadType ?? this.spreadType
            );

      await updateSessionChatMeta(this.session.id, {
        characterKey: this.characterId,
        ...(this.intention ||
        this.spreadType ||
        cardNames?.length ||
        this.resolvedIntention ||
        this.resolvedSpreadType ||
        this.resolvedSpreadId ||
        this.resolvedCardNames.length ||
        this.periodSpreadScope
          ? {
              intention: this.periodSpreadScope
                ? null
                : (this.intention ?? this.resolvedIntention ?? null),
              spreadType: this.spreadType ?? this.resolvedSpreadType ?? null,
              spreadId: this.spreadId ?? this.resolvedSpreadId ?? null,
              cards: cardNames?.length
                ? cardNames
                : this.resolvedCardNames.length
                  ? this.resolvedCardNames
                  : null,
            }
          : {}),
      });

      if (this.intention && !this.periodSpreadScope) this.resolvedIntention = this.intention;
      if (this.spreadType) this.resolvedSpreadType = this.spreadType;
      if (this.spreadCardNames?.length) this.resolvedCardNames = this.spreadCardNames;
      else if (!this.resolvedCardNames.length && cardNames?.length) {
        this.resolvedCardNames = cardNames;
      }
    } catch (saveMetaErr) {
      console.warn("Session meta save failed:", saveMetaErr);
    }

    if (this.resolvedIntention === "life_death") {
      // Ask-first: stay in awaiting_context until the user answers who/when.
      // Clear only after at least one user message while awaiting.
      const userTurns = this.messages.filter((m) => m.role === "user").length;
      if (this.session.awaiting_context && userTurns >= 1) {
        try {
          await setSessionAwaitingContext(this.session.id, false);
          this.session = { ...this.session, awaiting_context: false };
        } catch (flagErr) {
          console.warn("awaiting_context clear failed:", flagErr);
        }
        this.lifeDeathReadyToRead = true;
      } else {
        this.lifeDeathReadyToRead = !this.session.awaiting_context;
      }
    } else {
      this.lifeDeathReadyToRead = true;
    }
  }

  private async persistUserMessage(): Promise<void> {
    if (!this.dbOk || !this.session || !this.profileUserId) return;
    const lastUser = this.messages[this.messages.length - 1];
    if (lastUser?.role !== "user") return;
    try {
      await saveMessage(
        this.session.id,
        this.characterId,
        "user",
        lastUser.content,
        this.profileUserId
      );
    } catch (dbErr) {
      console.error("Chat DB write failed:", dbErr);
      throw dbErr instanceof Error ? dbErr : new Error("Chat DB write failed");
    }
  }

  private async loadPromptMemory(): Promise<void> {
    if (!this.profileUserId) return;

    const cardNames =
      this.resolvedCardNames.length > 0
        ? this.resolvedCardNames
        : this.tarotCards?.map((c) => c.name);

    const ctx = await buildMemoryContext({
      userId: this.profileUserId,
      characterId: this.characterId,
      sessionId: this.dbOk && this.session ? this.session.id : null,
      profile: this.userProfile
        ? {
            name: this.userProfile.name,
            gender: this.userProfile.gender,
            zodiac: this.userProfile.zodiac,
            birthDate: this.userProfile.birthDate,
            mainQuestion: this.userProfile.mainQuestion,
            lifeFocus: this.userProfile.lifeFocus,
          }
        : null,
      lastUserMessage: this.lastUserMsg,
      intention: this.periodSpreadScope ? null : this.resolvedIntention,
      customQuestion: this.customQuestion,
      mainQuestion: this.userProfile?.mainQuestion,
      includePastSessions: !this.periodSpreadScope,
      includeSessionAnchor: true,
      sessionAnchorFallback: { cardNames, intention: this.resolvedIntention },
    });

    // Period spreads ("на неделю"/"на месяц") get a fresh, topic-scoped anchor
    // instead of the DB-derived "continue where we left off" one — otherwise a
    // quick period spread would drag the previous chat topic into its prompt.
    const sessionAnchor =
      this.periodSpreadScope && cardNames?.length
        ? buildPeriodSpreadAnchorBlock(this.periodSpreadScope, cardNames)
        : ctx.sessionAnchorBlock;

    this.memoryQuery = ctx.queryText;
    this.clientMemoryBlock = ctx.clientBlock;
    this.memoryBlock = [sessionAnchor, ctx.pastSessionsBlock, ctx.factsBlock]
      .filter(Boolean)
      .join("\n\n");
  }

  private async loadLlmMessages(): Promise<void> {
    this.llmMessages = this.messages.slice(-LLM_CONTEXT_MESSAGES);
    if (!this.dbOk || !this.session) return;

    try {
      const sessionMessages = await getSessionMessagesForLlm(
        this.session.id,
        this.characterId,
        LLM_CONTEXT_MESSAGES
      );
      if (sessionMessages.length > 0) {
        this.llmMessages = filterLlmMessagesByTopic(
          sessionMessages,
          this.memoryQuery,
          LLM_CONTEXT_MESSAGES
        );
      } else {
        const lastUser = this.messages[this.messages.length - 1];
        this.llmMessages = lastUser ? [lastUser] : [];
      }
    } catch (loadErr) {
      console.warn("Session messages load failed:", loadErr);
    }
  }

  private buildNumerologParams(): NumerologEngineParams {
    const spreadNumbers =
      this.resolvedCardNames.length >= 3
        ? this.resolvedCardNames.slice(0, 3)
        : (this.tarotCards?.map((c) => c.name).slice(0, 3) ?? []);

    const recentUserMessages = this.messages
      .filter((m) => m.role === "user")
      .slice(0, -1)
      .slice(-12)
      .map((m) => m.content);

    const addressName = normalizePersonDisplayNameOr(this.userProfile?.name, "друг");
    return {
      characterId: this.characterId,
      imageBase64: this.imageBase64,
      userName: addressName,
      birthDate: this.userProfile?.birthDate,
      profileName: addressName,
      gender: this.userProfile?.gender || null,
      lastUserMessage: this.lastUserMsg,
      recentUserMessages,
      spreadNumbers,
      memoryBlock:
        [this.clientMemoryBlock, this.memoryBlock].filter(Boolean).join("\n\n") ||
        undefined,
      intention: this.periodSpreadScope ? null : this.resolvedIntention,
    };
  }

  private buildChatContext() {
    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const addressName = normalizePersonDisplayNameOr(this.userProfile?.name, "друг");

    return {
      userName: addressName,
      gender: this.userProfile?.gender,
      zodiac: this.userProfile?.zodiac,
      birthDate: this.userProfile?.birthDate,
      birthTime: this.userProfile?.birthTime,
      birthCity: this.userProfile?.birthCity,
      lifeFocus: this.userProfile?.lifeFocus,
      mainQuestion: this.userProfile?.mainQuestion,
      astroMeta: this.userProfile?.astroMeta,
      today,
      tarotCards: this.tarotCards,
      isPaid: this.promptHasFullAccess(),
    };
  }

  /** Full decode access: legacy unlock, spent runes, or paid question beyond free quota. */
  private promptHasFullAccess(): boolean {
    if (this.unlimited) return true;
    if (this.billingHandle?.sessionHasFullAccess) return true;
    if ((this.billingHandle?.charge?.spentRunes ?? 0) > 0) return true;
    if (
      this.billingHandle?.useRuneBilling &&
      (this.billingHandle?.questionIndex ?? 0) >= this.freeLimit
    ) {
      return true;
    }
    return false;
  }

  /** Paid opening of a full spread — use reading-mode depth, not chat 5–12 sentences. */
  private shouldUsePremiumReadingPrompt(): boolean {
    const paid = this.promptHasFullAccess();
    if (!paid || !this.isLongFormSpreadReply()) return false;
    if (this.periodSpreadScope) return true;
    const userTurns = this.messages.filter((m) => m.role === "user").length;
    if (userTurns <= 1) return true;
    if (
      this.resolvedIntention === "life_death" &&
      this.lifeDeathReadyToRead &&
      userTurns <= 2
    ) {
      return true;
    }
    return false;
  }

  private toReadingUserContext(chatCtx: ReturnType<ChatOrchestrator["buildChatContext"]>): UserContext {
    return {
      userName: chatCtx.userName ?? "друг",
      gender: chatCtx.gender ?? "",
      zodiac: chatCtx.zodiac ?? "",
      birthDate: chatCtx.birthDate ?? "",
      today: chatCtx.today ?? "",
      tarotCards: (chatCtx.tarotCards ?? []).map((c) => ({
        name: c.name,
        meaning: c.meaning ?? "",
        position: (c as { position?: string }).position,
      })),
      isPaid: Boolean(chatCtx.isPaid),
      birthTime: chatCtx.birthTime,
      birthCity: chatCtx.birthCity,
      lifeFocus: chatCtx.lifeFocus,
      mainQuestion: chatCtx.mainQuestion,
      astroMeta: chatCtx.astroMeta,
    };
  }

  /** Assembles system prompt: character, blogger knowledge, user memory, intention/spread blocks. */
  async buildSystemPrompt(): Promise<string> {
    const chatCtx = this.buildChatContext();
    const { numerologyBlock } = buildNumerologyPromptContext({
      characterId: this.characterId,
      birthDate: this.userProfile?.birthDate,
      profileName: normalizePersonDisplayName(this.userProfile?.name) || undefined,
      gender: this.userProfile?.gender || null,
      lastUserMessage: this.lastUserMsg,
      intention: this.periodSpreadScope ? null : this.resolvedIntention,
    });
    const natalChartBlock = await buildNatalPromptContext({
      characterId: this.characterId,
      profileUserId: this.profileUserId,
      topic: this.lastUserMsg,
      purpose: "chat",
    });
    const humanDesignBlock = await buildHdPromptContext({
      characterId: this.characterId,
      profileUserId: this.profileUserId,
    });

    let sessionNumber = 1;
    if (this.profileUserId && this.dbOk) {
      try {
        const sessionMemories = await getSessionMemories(
          this.profileUserId,
          this.characterId,
          3,
          this.session?.id
        );
        sessionNumber = sessionMemories.length
          ? sessionMemories.length + 1
          : (await countSessionMemories(this.profileUserId, this.characterId)) + 1;
      } catch (memErr) {
        console.warn("Session memories load failed:", memErr);
      }
    }

    const sessionHasFullAccess = this.promptHasFullAccess();
    const usePremiumReading = this.shouldUsePremiumReadingPrompt();
    const readingCtx = this.toReadingUserContext(chatCtx);
    const positionLabels = (chatCtx.tarotCards ?? []).map((c, i) => {
      const pos = (c as { position?: string }).position?.trim();
      return pos || `Позиция ${i + 1}`;
    });
    const cardCount = Math.max(1, readingCtx.tarotCards.length);

    let systemPrompt: string;

    if (this.dbOk) {
      const humanSlug = !isAiMasterId(this.characterId)
        ? this.characterId
        : this.session?.referrer_slug;

      if (humanSlug) {
        const blogger = await getBloggerBySlug(humanSlug);
        if (blogger) {
          const knowledge = await getBloggerKnowledge(blogger.id);
          if (!isAiMasterId(this.characterId)) {
            systemPrompt = usePremiumReading
              ? buildHumanReadingPrompt(
                  blogger,
                  readingCtx,
                  knowledge,
                  this.periodSpreadScope ? null : this.resolvedIntention,
                  {
                    spreadId: this.resolvedSpreadId ?? this.spreadId,
                    positionLabels,
                    forceThematicReading: true,
                  }
                )
              : buildHumanChatPrompt(blogger, chatCtx, knowledge);
            if (usePremiumReading) {
              systemPrompt += `\n\n${buildPaidSpreadReadingExtras({
                cardCount,
                masterId: this.characterId,
              })}`;
            }
          } else if (usePremiumReading) {
            systemPrompt = buildCharacterPrompt(this.characterId, readingCtx, {
              sessionNumber,
              memory: [],
              lastUserMessage: this.lastUserMsg,
              intention: this.periodSpreadScope ? null : this.resolvedIntention,
              spreadId: this.resolvedSpreadId ?? this.spreadId,
              forceThematicReading: true,
              positionLabels,
              numerologyBlock,
              natalChartBlock,
              humanDesignBlock,
            });
            systemPrompt += `\n\nСтиль мастера ${blogger.display_name}: ${blogger.style_notes ?? ""}\nБаза знаний:\n${knowledge}`;
            systemPrompt += `\n\n${buildPaidSpreadReadingExtras({
              cardCount,
              masterId: this.characterId,
            })}`;
          } else {
            systemPrompt = buildChatPrompt(this.characterId, chatCtx, {
              sessionNumber,
              memory: [],
              lastUserMessage: this.lastUserMsg,
              intention: this.periodSpreadScope ? null : this.resolvedIntention,
              numerologyBlock,
              natalChartBlock,
              humanDesignBlock,
            });
            systemPrompt += `\n\nСтиль мастера ${blogger.display_name}: ${blogger.style_notes ?? ""}\nБаза знаний:\n${knowledge}`;
          }
        } else {
          systemPrompt = "";
        }
      } else {
        systemPrompt = "";
      }
    } else {
      systemPrompt = "";
    }

    if (!systemPrompt) {
      systemPrompt = usePremiumReading
        ? buildCharacterPrompt(this.characterId, readingCtx, {
            sessionNumber,
            memory: [],
            lastUserMessage: this.lastUserMsg,
            intention: this.periodSpreadScope ? null : this.resolvedIntention,
            spreadId: this.resolvedSpreadId ?? this.spreadId,
            forceThematicReading: true,
            positionLabels,
            numerologyBlock,
            natalChartBlock,
            humanDesignBlock,
          })
        : buildChatPrompt(this.characterId, chatCtx, {
            sessionNumber,
            memory: [],
            lastUserMessage: this.lastUserMsg,
            intention: this.periodSpreadScope ? null : this.resolvedIntention,
            numerologyBlock,
            natalChartBlock,
            humanDesignBlock,
          });
      if (usePremiumReading) {
        systemPrompt += `\n\n${buildPaidSpreadReadingExtras({
          cardCount,
          masterId: this.characterId,
        })}`;
      }
    }

    if (!sessionHasFullAccess && this.userProfile && this.tarotCards?.length) {
      const spread = getSpread(this.resolvedSpreadId ?? this.spreadId);
      if (spread.cardCount <= 1) {
        systemPrompt +=
          "\n\nНапоминание: при частичном доступе — полная расшифровка только первого символа.";
      } else {
        systemPrompt += `\n\nНапоминание: при частичном доступе — подробно только первый символ. По остальным ${spread.cardCount - 1} — крючок без полной расшифровки.`;
      }
    }

    if (this.profileUserId) {
      // clientMemoryBlock/memoryBlock were already computed once in
      // loadPromptMemory() — reusing them here avoids re-running buildClientBlock
      // (and its relevance gating) a second time for the same request.
      systemPrompt = appendUserMemoryToPrompt(
        systemPrompt,
        `${this.clientMemoryBlock}${this.memoryBlock}`.trim() || null
      );
    }

    if (!this.periodSpreadScope) {
      const activeSpreadId = this.resolvedSpreadId ?? this.spreadId;
      const labels = this.tarotCards?.length
        ? resolveSpreadPositions(
            activeSpreadId,
            this.resolvedIntention && isSessionTopicId(this.resolvedIntention)
              ? this.resolvedIntention
              : null
          ).map((p) => p.label)
        : undefined;
      systemPrompt += intentionPromptBlock(
        this.resolvedIntention,
        this.customQuestion,
        {
          spreadId: activeSpreadId,
          cardCount: this.tarotCards?.length,
          positionLabels: labels,
        }
      );
    }

    const cardNamesForBlock = this.resolvedCardNames.length
      ? this.resolvedCardNames
      : this.tarotCards?.map((c) => c.name) ?? [];
    const cardsWithMeanings = (this.tarotCards ?? []).map((c) => ({
      name: c.name,
      meaning: c.meaning ?? "",
      position: (c as { position?: string }).position,
    }));

    if (this.periodSpreadScope && cardNamesForBlock.length >= 1) {
      systemPrompt += `\n\n${buildPeriodSpreadBlock(this.periodSpreadScope, cardNamesForBlock, {
        cardsWithMeanings,
      })}`;
    } else {
      systemPrompt += buildSpreadBlock(
        this.resolvedSpreadType,
        cardNamesForBlock,
        this.resolvedIntention,
        {
          readyToRead: this.lifeDeathReadyToRead,
          spreadId: this.resolvedSpreadId ?? this.spreadId,
          cardsWithMeanings,
        }
      );
    }

    if (this.resolvedIntention === "life_death") {
      systemPrompt += `\n\n${LIFE_DEATH_TOPIC}`;
      systemPrompt += `\n\n${LIFE_DEATH_LLM_OVERRIDE}`;
      if (this.lifeDeathReadyToRead) {
        systemPrompt += `\n\n${LIFE_DEATH_AFTER_CONTEXT}`;
      }
    }

    if (this.lastUserMsg.trim()) {
      if (usePremiumReading) {
        systemPrompt += `

ОПЛАЧЕННЫЙ ПОЛНЫЙ РАСКЛАД — запрос клиента:
«${this.lastUserMsg.trim().slice(0, 400)}»

Дай развёрнутую расшифровку всех символов по правилам выше. Память — только если про ту же тему. Без чат-тизера и без удержания глубины.`;
      } else {
        systemPrompt += `

ЧАТ — ПОСЛЕДНЯЯ РЕПЛИКА КЛИЕНТА (ответь на неё):
«${this.lastUserMsg.trim().slice(0, 400)}»

Правила этого ответа:
- тема ответа = последняя реплика; память из служебного контекста — только если она про эту же тему;
- каждая руна/карта расклада — отдельная мысль, без повторения одной формулировки;
- не пересказывай слова клиента дословно;
- если вопрос уже уточнён (например «переезд») — не спрашивай снова «какой выбор», отвечай по сути.`;
      }
    }

    if (this.llmMessages.length > 2 && this.memoryBlock) {
      systemPrompt += `

В переписке могли быть другие темы. Память и якорь ниже уже отфильтрованы — используй их только если они про последний вопрос клиента.`;
    }

    return systemPrompt;
  }

  private chatQualityOpts(): ChatReplyQualityOpts {
    return {
      lastUserMessage: this.lastUserMsg,
      cardNames: this.resolvedCardNames.length
        ? this.resolvedCardNames
        : this.tarotCards?.map((c) => c.name),
    };
  }

  /** Long-form spread replies (period chips, new/daily spread) need more output budget. */
  private streamMaxTokens(): number {
    const cards = this.activeSpreadCardNames();
    if (this.shouldUsePremiumReadingPrompt() || this.periodSpreadScope) {
      return paidSpreadMaxTokens(cards.length || 3);
    }
    const spreadId = this.resolvedSpreadId ?? this.spreadId;
    if (
      cards.length >= 3 &&
      hasCompleteSpread(cards, spreadId, this.resolvedSpreadType ?? this.spreadType)
    ) {
      return paidSpreadMaxTokens(cards.length);
    }
    return 1800;
  }

  private isLongFormSpreadReply(): boolean {
    if (this.periodSpreadScope) return true;
    const spreadId = this.resolvedSpreadId ?? this.spreadId;
    const cards = this.resolvedCardNames.length
      ? this.resolvedCardNames
      : this.tarotCards?.map((c) => c.name) ?? [];
    return (
      cards.length >= 3 &&
      hasCompleteSpread(cards, spreadId, this.resolvedSpreadType ?? this.spreadType)
    );
  }

  private activeSpreadCardNames(): string[] {
    return this.resolvedCardNames.length
      ? this.resolvedCardNames
      : this.tarotCards?.map((c) => c.name) ?? [];
  }

  /** Topic line for cabinet / session list after a one-shot spread reply. */
  private quickSpreadTopicSummary(cardNames: string[]): string {
    if (this.periodSpreadScope) {
      return periodSpreadTaskLabel(this.periodSpreadScope);
    }
    const intention = this.resolvedIntention ?? this.intention;
    if (intention === "custom" && this.customQuestion?.trim()) {
      return this.customQuestion.trim().slice(0, 120);
    }
    if (intention && isValidSessionIntention(intention)) {
      return topicLabel(intention as SessionTopicId);
    }
    const spreadId = normalizeSpreadId(this.resolvedSpreadId ?? this.spreadId);
    const spread = getSpread(spreadId);
    if (spread.id !== "triplet" || this.resolvedSpreadType === "new") {
      return spread.label;
    }
    const q = this.lastUserMsg.trim();
    return q.length > 0 ? q.slice(0, 120) : "Сеанс";
  }

  /** Persist to cabinet immediately — all quick spreads + first consultation turn. */
  private shouldPersistSessionMemoryImmediately(finalReply: string): boolean {
    if (this.isLongFormSpreadReply()) return true;
    const userTurns = this.messages.filter((m) => m.role === "user").length;
    return userTurns === 1 && finalReply.trim().length >= MIN_SPREAD_READING_CHARS;
  }

  private async buildSpreadContextMessages(systemPrompt: string): Promise<ChatMessage[]> {
    const fullPrompt = await wrapSystemPrompt(systemPrompt);
    return [
      { role: "system", content: fullPrompt },
      ...this.llmMessages.map((m) => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
      })),
    ];
  }

  /**
   * Complete a paid spread via AI continuation, then via a lean-prompt AI rescue.
   * Returns empty only when every model in the chain failed.
   */
  private async finalizeSpreadReply(
    raw: string | null,
    contextMessages: ChatMessage[]
  ): Promise<string> {
    const cardNames = this.activeSpreadCardNames();
    let text = raw?.trim() ?? "";

    if (text && !isPaidSpreadTextComplete(text, cardNames)) {
      const ensured = await ensurePaidSpreadTextComplete(contextMessages, text, cardNames, {
        maxTokens: Math.max(2200, this.streamMaxTokens()),
        temperature: this.chatTemperature ?? 0.75,
        maxRounds: 4,
      });
      if (ensured) text = ensured;
    }

    const cleaned = text ? this.sanitizeChatReply(text) : "";
    const displayName =
      normalizePersonDisplayName(this.userProfile?.name) ||
      this.userProfile?.name?.trim() ||
      null;
    const prepared = cleaned
      ? normalizePaidReadingStructure(cleaned, this.characterId, displayName)
      : "";
    if (prepared && this.acceptPremiumSpreadText(prepared, cardNames)) return prepared;
    if (prepared && this.softAcceptPremiumSpreadText(prepared, cardNames)) {
      console.warn("[chat] paid spread soft-shipped before rescue");
      return prepared;
    }

    const rescued = await this.rescueSpreadReplyWithAi(prepared || cleaned || text);
    if (rescued) return rescued;

    console.error("[chat] paid spread: all AI attempts failed");
    return "";
  }

  /** Completeness + premium quality (verdict, simply-words). */
  private acceptPremiumSpreadText(text: string, cardNames: string[]): boolean {
    if (!isPaidSpreadTextComplete(text, cardNames)) return false;
    return evaluatePaidReadingQuality(text, {
      cardCount: cardNames.length,
      characterId: this.characterId,
    }).ok;
  }

  /** Complete AI draft with all cards — ship even if verdict/structure imperfect. */
  private softAcceptPremiumSpreadText(text: string, cardNames: string[]): boolean {
    return (
      text.trim().length >= 200 &&
      meetsPaidDensityFloor(text, cardNames.length) &&
      isPaidSpreadTextComplete(text, cardNames)
    );
  }

  /**
   * Lean-prompt regeneration across the whole model chain.
   * Fail-closed on templates: only model-authored text can ship as a paid reading.
   */
  private async rescueSpreadReplyWithAi(draft: string): Promise<string | null> {
    const cardNames = this.activeSpreadCardNames();
    if (!cardNames.length) return null;

    const { rescueReadingWithAi } = await import("@/lib/reading-ai-rescue");
    const cards = cardNames.map((name, i) => ({
      name,
      position: `Позиция ${i + 1}`,
      meaning: this.tarotCards?.find((c) => c.name === name)?.meaning,
    }));

    return rescueReadingWithAi({
      characterId: this.characterId,
      userName: this.userProfile?.name?.trim() || "друг",
      question: this.customQuestion?.trim() || this.lastUserMsg || "Разбор расклада",
      cards,
      maxTokens: Math.max(2200, this.streamMaxTokens()),
      previousDraft: draft,
      accept: (candidate) => {
        const clean = this.sanitizeChatReply(candidate);
        const displayName =
          normalizePersonDisplayName(this.userProfile?.name) ||
          this.userProfile?.name?.trim() ||
          null;
        const prepared = clean
          ? normalizePaidReadingStructure(clean, this.characterId, displayName)
          : "";
        return prepared && this.acceptPremiumSpreadText(prepared, cardNames) ? prepared : null;
      },
      softAccept: (candidate) => {
        const clean = this.sanitizeChatReply(candidate);
        const displayName =
          normalizePersonDisplayName(this.userProfile?.name) ||
          this.userProfile?.name?.trim() ||
          null;
        const prepared = clean
          ? normalizePaidReadingStructure(clean, this.characterId, displayName)
          : "";
        return prepared && this.softAcceptPremiumSpreadText(prepared, cardNames)
          ? prepared
          : null;
      },
    });
  }

  /** Generate full spread off-stream, then stream the complete text (no mid-word cutoffs). */
  private async runBufferedSpreadReply(systemPrompt: string): Promise<Response> {
    const contextMessages = await this.buildSpreadContextMessages(systemPrompt);
    const draft = await completeProseWithContinuation(contextMessages, {
      maxTokens: this.streamMaxTokens(),
      temperature: this.chatTemperature ?? 0.75,
      maxPasses: 3,
      cardNames: this.activeSpreadCardNames(),
    });
    const reply = await this.finalizeSpreadReply(draft, contextMessages);
    if (!reply) {
      let runesRefunded = false;
      if (this.billingHandle) {
        const rollback = await this.billingHandle.rollbackLlmFailure();
        runesRefunded = rollback.runesRefunded;
      }
      return this.streamDeterministicReply(
        llmUnavailableReply({ runesRefunded }),
        { llmFailed: true, runesRefunded }
      );
    }
    return this.streamDeterministicReply(reply);
  }

  private sanitizeChatReply(raw: string): string {
    const cleaned = stripMemoryLeakFromReply(raw);
    return cleaned || "";
  }

  /** Reject loop/echo → one OpenRouter retry → deterministic card-aware fallback. */
  private async resolveFinalChatReply(
    rawReply: string,
    llmFailed: boolean
  ): Promise<{ reply: string; llmFailed: boolean; usedFallback: boolean }> {
    const qualityOpts = this.chatQualityOpts();
    let reply = this.sanitizeChatReply(rawReply);
    let failed = llmFailed || !reply;

    if (!failed && isRejectedChatReply(reply, qualityOpts)) {
      const reason = chatReplyRejectionReason(reply, qualityOpts) ?? "low quality";
      console.warn(`[chat] reply rejected (${reason}), regenerating…`);
      failed = true;
      reply = "";
    }

    const usePremiumModel =
      this.unlimited ||
      (this.billingHandle?.useRuneBilling &&
        (Boolean(this.imageBase64) ||
          (this.billingHandle?.questionIndex ?? 0) >= this.freeLimit)) ||
      (!this.billingHandle?.useRuneBilling &&
        (this.billingHandle?.sessionHasFullAccess ?? false));

    if (failed && this.lastSystemPrompt) {
      const reason =
        chatReplyRejectionReason(rawReply, qualityOpts) ?? "LLM unavailable";
      const regenerated = await regenerateChatReply(
        this.lastSystemPrompt,
        this.llmMessages,
        {
          rejectionReason: reason,
          imageBase64: this.imageBase64,
          isPaid: usePremiumModel,
          temperature: this.chatTemperature ?? 0.75,
        }
      );
      const regClean = regenerated ? this.sanitizeChatReply(regenerated) : "";
      if (regClean && !isRejectedChatReply(regClean, qualityOpts)) {
        return { reply: regClean, llmFailed: false, usedFallback: false };
      }
    }

    if (failed) {
      // Long-form / paid spreads: rescue with another AI pass, never a template.
      if (this.isLongFormSpreadReply()) {
        const rescued = await this.rescueSpreadReplyWithAi(this.sanitizeChatReply(rawReply));
        if (rescued) {
          return { reply: rescued, llmFailed: false, usedFallback: false };
        }
        console.error("[chat] long-form spread: all AI attempts failed");
        return { reply: "", llmFailed: true, usedFallback: false };
      }
      // Short chat: explicit unavailable message only (not a reading).
      return { reply: "", llmFailed: true, usedFallback: false };
    }

    return { reply, llmFailed: false, usedFallback: false };
  }

  private baseResponseMeta(extra: Record<string, unknown> = {}) {
    return {
      characterId: this.characterId,
      isPaid: this.promptHasFullAccess(),
      runeBalance: this.billingHandle?.runeBalance,
      freeQuestionsRemaining: this.billingHandle?.freeQuestionsRemaining,
      sessionId: this.session?.id,
      sessionCreated: this.chatSessionCreated,
      ...(this.numerologyUi ? { numerologyUi: this.numerologyUi } : {}),
      ...extra,
    };
  }

  /** Post-complete: save assistant reply, session memory, achievements, diary. */
  private async persistAssistantOutcome(
    finalReply: string,
    llmFailed: boolean
  ): Promise<Awaited<ReturnType<typeof checkAchievements>>> {
    // Technical refusals are UI error-state only — never store as master messages.
    if (this.dbOk && this.session && this.profileUserId && finalReply && !llmFailed) {
      try {
        await saveMessage(
          this.session.id,
          this.characterId,
          "assistant",
          finalReply,
          this.profileUserId
        );
      } catch (dbErr) {
        console.error("Chat assistant save failed:", dbErr);
        throw dbErr instanceof Error ? dbErr : new Error("Chat assistant save failed");
      }
    }

    if (this.profileUserId && !llmFailed && finalReply) {
      void ClientMemory.recordTurn({
        userId: this.profileUserId,
        characterId: this.characterId,
        userMessage: this.lastUserMsg,
        assistantReply: finalReply,
        sourceType: "chat",
        sourceEntityId: this.session?.id ?? null,
      }).catch((err) => console.error("[memory] recordTurn failed:", err));
    }

    let achievementPayload: Awaited<ReturnType<typeof checkAchievements>> = null;

    if (this.profileUserId && this.dbOk && !llmFailed) {
      try {
        achievementPayload = await checkAchievements(
          this.profileUserId,
          this.characterId,
          this.lastUserMsg
        );
      } catch (achErr) {
        console.warn("Achievement check failed:", achErr);
      }

      if (this.session) {
        try {
          const cardNames =
            this.tarotCards?.map((c) => c.name) ??
            (this.resolvedCardNames.length ? this.resolvedCardNames : []);
          // Quick spreads (period chips, inline cards) and first consultation turn
          // must appear in cabinet / master session list without waiting for 3+ chat turns.
          if (this.shouldPersistSessionMemoryImmediately(finalReply)) {
            await upsertSessionMemoryFromChat({
              userId: this.profileUserId,
              sessionId: this.session.id,
              characterKey: this.characterId,
              topicSummary: this.quickSpreadTopicSummary(cardNames),
              keyCards: limitSpreadKeyCards(cardNames),
              prediction: finalReply,
            });
          } else {
            void maybePersistSessionMemory({
              userId: this.profileUserId,
              sessionId: this.session.id,
              characterKey: this.characterId,
              messages: this.llmMessages.map((m) => ({ role: m.role, content: m.content })),
              cardNames,
              lastAssistantReply: finalReply,
            }).catch((err) => console.warn("Session memory persist failed:", err));
          }
        } catch (diaryErr) {
          console.warn("Diary count failed:", diaryErr);
        }
      }
    }

    return achievementPayload;
  }

  private async persistAssistantOutcomeWithRollback(
    finalReply: string,
    llmFailed: boolean
  ): Promise<{
    achievement: Awaited<ReturnType<typeof checkAchievements>>;
    persistFailed: boolean;
    runesRefunded: boolean;
  }> {
    try {
      const achievement = await this.persistAssistantOutcome(finalReply, llmFailed);
      return { achievement, persistFailed: false, runesRefunded: false };
    } catch (persistErr) {
      console.error("Assistant persist failed, rolling back billing:", persistErr);
      let runesRefunded = false;
      if (this.billingHandle) {
        await this.billingHandle.rollbackOnError();
        runesRefunded = true;
      }
      return { achievement: null, persistFailed: true, runesRefunded };
    }
  }

  private streamDeterministicReply(
    reply: string,
    extra: Record<string, unknown> = {}
  ): Response {
    const llmFailed = extra.llmFailed === true;
    return createDeterministicTextStream({
      reply,
      llmFailed,
      onComplete: async () => {
        const persisted = await this.persistAssistantOutcomeWithRollback(reply, llmFailed);
        if (persisted.persistFailed) {
          return {
            ...this.baseResponseMeta(extra),
            llmFailed: true,
            runesRefunded: persisted.runesRefunded,
            reply: llmUnavailableReply({ runesRefunded: persisted.runesRefunded }),
          };
        }
        return {
          ...this.baseResponseMeta(extra),
          llmFailed,
          runesRefunded: extra.runesRefunded === true,
          ...(persisted.achievement ? { achievement: persisted.achievement } : {}),
        };
      },
    });
  }

  private async handleStreamComplete(meta: {
    reply: string;
    llmFailed: boolean;
    finishReason?: string | null;
    streamInterrupted?: boolean;
  }): Promise<Record<string, unknown>> {
    let llmFailed = meta.llmFailed || Boolean(meta.streamInterrupted);
    let runesRefunded = false;

    const resolved = await this.resolveFinalChatReply(meta.reply, llmFailed);
    let finalReply = resolved.reply;
    llmFailed = resolved.llmFailed;

    if (!llmFailed && finalReply && this.isLongFormSpreadReply()) {
      const cardNames = this.activeSpreadCardNames();
      if (!isPaidSpreadTextComplete(finalReply, cardNames) && this.lastSystemPrompt) {
        const contextMessages = await this.buildSpreadContextMessages(this.lastSystemPrompt);
        finalReply = await this.finalizeSpreadReply(finalReply, contextMessages);
        if (!finalReply) llmFailed = true;
      }
    }

    // Engine math may answer tool-style numerology chips, but never replaces a paid long-form AI reading.
    if (llmFailed && this.numerologParams && !this.isLongFormSpreadReply()) {
      const engineFallback = tryNumerologEngineFallback(this.numerologParams);
      if (engineFallback) {
        finalReply = engineFallback.reply;
        if (engineFallback.numerologyUi) {
          this.numerologyUi = engineFallback.numerologyUi;
        }
        llmFailed = false;
      }
    }

    if (llmFailed && this.billingHandle) {
      const rollback = await this.billingHandle.rollbackLlmFailure();
      runesRefunded = rollback.runesRefunded;
    }

    if (llmFailed && !finalReply) {
      finalReply = llmUnavailableReply({ runesRefunded });
    }

    const persisted = await this.persistAssistantOutcomeWithRollback(finalReply, llmFailed);
    if (persisted.persistFailed) {
      llmFailed = true;
      runesRefunded = persisted.runesRefunded;
      finalReply = llmUnavailableReply({ runesRefunded });
    }

    if (!llmFailed && finalReply) {
      assertChatProactivity(finalReply, this.characterId);
    }

    return {
      ...this.baseResponseMeta(),
      llmFailed,
      runesRefunded,
      achievement: persisted.achievement,
      reply: finalReply,
    };
  }

  private async runNonStreamingFallback(
    systemPrompt: string,
    chatTemperature: number | undefined
  ): Promise<Response> {
    const usePremiumModel =
      this.unlimited ||
      (this.billingHandle?.useRuneBilling &&
        (Boolean(this.imageBase64) ||
          (this.billingHandle?.questionIndex ?? 0) >= this.freeLimit)) ||
      (!this.billingHandle?.useRuneBilling && (this.billingHandle?.sessionHasFullAccess ?? false));

    const llmReply = await generateChatReply(
      systemPrompt,
      this.llmMessages,
      this.imageBase64,
      usePremiumModel,
      chatTemperature
    );

    this.lastSystemPrompt = systemPrompt;
    this.chatTemperature = chatTemperature;

    let llmFailed = !llmReply;
    let runesRefunded = false;
    let reply = llmReply ?? "";

    const resolved = await this.resolveFinalChatReply(reply, llmFailed);
    reply = resolved.reply;
    llmFailed = resolved.llmFailed;

    if (llmFailed && this.numerologParams && !this.isLongFormSpreadReply()) {
      const engineFallback = tryNumerologEngineFallback(this.numerologParams);
      if (engineFallback) {
        reply = engineFallback.reply;
        if (engineFallback.numerologyUi) {
          this.numerologyUi = engineFallback.numerologyUi;
        }
        llmFailed = false;
      }
    }

    if (llmFailed && this.billingHandle) {
      const rollback = await this.billingHandle.rollbackLlmFailure();
      runesRefunded = rollback.runesRefunded;
    }

    if (llmFailed) {
      reply = llmUnavailableReply({ runesRefunded });
    }

    const finalReply = reply ?? llmUnavailableReply({ runesRefunded });
    if (!llmFailed && finalReply) {
      assertChatProactivity(finalReply, this.characterId);
    }
    const achievement = await this.persistAssistantOutcome(finalReply, llmFailed);

    if (achievement) {
      return NextResponse.json({
        reply: finalReply,
        llmFailed,
        ...this.baseResponseMeta({ achievement }),
      });
    }

    return NextResponse.json({
      reply: finalReply,
      llmFailed,
      ...this.baseResponseMeta(),
    });
  }
}
