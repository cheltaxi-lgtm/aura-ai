import { NextResponse } from "next/server";

import { checkAchievements } from "@/lib/achievements";
import {
  buildChatPrompt,
  buildHumanChatPrompt,
  generateChatReply,
  llmUnavailableReply,
} from "@/lib/chat-prompts";
import {
  resolveApiCharacterId,
  sanitizeChatHistory,
  sanitizeUserProfileForPrompt,
  type ChatHistoryMessage,
  type SanitizedUserProfile,
} from "@/lib/chat-sanitize";
import { createChatResponseStream, createDeterministicTextStream } from "@/lib/chat-stream";
import { query } from "@/lib/db";
import { maybeCreateDiaryEntry } from "@/lib/diary";
import { intentionPromptBlock } from "@/lib/intention";
import { buildSpreadBlock } from "@/lib/spread-block";
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
} from "@/lib/session-memory";
import type { ChargeChatBillingParams } from "@/lib/services/billing-service";
import type { ChatBillingHandle } from "@/lib/services/billing-service";
import { ClientMemory } from "@/lib/memory/client-memory";
import {
  buildNumerologyPromptContext,
  generateNumerologStreamReply,
  tryNumerologEngineFallback,
  type NumerologEngineParams,
  type NumerologyUi,
} from "@/lib/services/numerology-service";
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
import { getUserById } from "@/lib/users";
import { MAX_IMAGE_BYTES, validateImageBase64Payload, validateLastUserMessage } from "@/lib/api-guards";
import { appendUserMemoryToPrompt, buildClientBlock } from "@/lib/user-memory";

export type ChatRequestBody = {
  characterId: string;
  messages: { role: string; content: string }[];
  imageBase64?: string;
  sessionId?: string;
  newChatThread?: boolean;
  intention?: string;
  spreadType?: "daily" | "new";
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
  private spreadType?: "daily" | "new";
  private spreadCardNames?: string[];

  private resolvedIntention?: string;
  private resolvedSpreadType?: "daily" | "new";
  private resolvedCardNames: string[] = [];
  private lifeDeathReadyToRead = true;
  private llmMessages: { role: string; content: string }[] = [];
  private lastUserMsg = "";
  private numerologParams: NumerologEngineParams | null = null;
  private numerologyUi: NumerologyUi | undefined;
  private memoryBlock = "";

  private constructor(parsed: ParsedChatRequest) {
    this.characterId = parsed.characterId;
    this.messages = parsed.messages;
    this.userProfile = sanitizeUserProfileForPrompt(parsed.userProfile);
    this.imageBase64 = parsed.imageBase64;
    this.tarotCards = parsed.tarotCards;
    this.intention = parsed.intention;
    this.spreadType = parsed.spreadType;
    this.spreadCardNames = parsed.cards;
    this.resolvedIntention = parsed.intention;
    this.resolvedSpreadType = parsed.spreadType;
    this.resolvedCardNames = parsed.cards?.length ? [...parsed.cards] : [];
    this.lastUserMsg = parsed.messages[parsed.messages.length - 1]?.content ?? "";
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
        orch.userProfile = {
          name: serverProfile.name,
          gender: serverProfile.gender === "male" ? "Мужской" : "Женский",
          zodiac: serverProfile.zodiac,
          birthDate: serverProfile.birth_date,
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
    await this.loadClientMemory();
    await this.loadLlmMessages();

    this.numerologParams = this.buildNumerologParams();

    const numerologReply = await generateNumerologStreamReply(this.numerologParams);
    if (numerologReply) {
      this.numerologyUi = numerologReply.numerologyUi ?? this.numerologyUi;
      return this.streamDeterministicReply(numerologReply.reply, { engineReply: true });
    }

    const systemPrompt = await this.buildSystemPrompt();
    const chatTemperature = this.resolvedIntention === "life_death" ? 0.4 : undefined;

    const streamResponse = await createChatResponseStream({
      systemPrompt,
      messages: this.llmMessages,
      imageBase64: this.imageBase64,
      temperature: chatTemperature,
      onComplete: (meta) => this.handleStreamComplete(meta),
    });

    if (streamResponse) {
      return streamResponse;
    }

    return this.runNonStreamingFallback(systemPrompt, chatTemperature);
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
        if (!this.resolvedIntention && meta.intention) this.resolvedIntention = meta.intention;
        if (!this.resolvedSpreadType && meta.spread_type) {
          this.resolvedSpreadType = meta.spread_type as "daily" | "new";
        }
        if (!this.resolvedCardNames.length && meta.cards?.length) {
          this.resolvedCardNames = meta.cards;
        }
      }
    } catch (metaErr) {
      console.warn("Session meta load failed:", metaErr);
    }

    try {
      const cardNames = this.spreadCardNames?.length
        ? this.spreadCardNames
        : this.resolvedCardNames.length
          ? this.resolvedCardNames
          : this.tarotCards?.map((c) => c.name).slice(0, 3);

      await updateSessionChatMeta(this.session.id, {
        characterKey: this.characterId,
        ...(this.intention || this.spreadType || cardNames?.length
          ? {
              intention: this.intention ?? this.resolvedIntention ?? null,
              spreadType: this.spreadType ?? this.resolvedSpreadType ?? null,
              cards: cardNames?.length ? cardNames : null,
            }
          : {}),
      });

      if (this.intention) this.resolvedIntention = this.intention;
      if (this.spreadType) this.resolvedSpreadType = this.spreadType;
      if (this.spreadCardNames?.length) this.resolvedCardNames = this.spreadCardNames;
      else if (!this.resolvedCardNames.length && cardNames?.length) {
        this.resolvedCardNames = cardNames;
      }
    } catch (saveMetaErr) {
      console.warn("Session meta save failed:", saveMetaErr);
    }

    this.lifeDeathReadyToRead = this.resolvedIntention !== "life_death";

    if (this.resolvedIntention === "life_death") {
      this.lifeDeathReadyToRead = true;
      if (this.session.awaiting_context) {
        try {
          await setSessionAwaitingContext(this.session.id, false);
          this.session = { ...this.session, awaiting_context: false };
        } catch (flagErr) {
          console.warn("awaiting_context clear failed:", flagErr);
        }
      }
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

  private async loadClientMemory(): Promise<void> {
    if (!this.profileUserId) return;
    this.memoryBlock = await ClientMemory.loadClientMemoryBlock({
      userId: this.profileUserId,
      queryText: this.lastUserMsg,
    });
  }

  private async loadLlmMessages(): Promise<void> {
    this.llmMessages = this.messages.slice(-20);
    if (!this.dbOk || !this.session) return;

    try {
      const sessionMessages = await getSessionMessagesForLlm(this.session.id, this.characterId, 20);
      if (sessionMessages.length > 0) {
        this.llmMessages = sessionMessages;
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
        ? this.resolvedCardNames
        : (this.tarotCards?.map((c) => c.name) ?? []);

    const recentUserMessages = this.messages
      .filter((m) => m.role === "user")
      .slice(0, -1)
      .slice(-12)
      .map((m) => m.content);

    const { numerologyUi } = buildNumerologyPromptContext({
      characterId: this.characterId,
      birthDate: this.userProfile?.birthDate,
      profileName: this.userProfile?.name,
      lastUserMessage: this.lastUserMsg,
    });
    this.numerologyUi = numerologyUi;

    return {
      characterId: this.characterId,
      imageBase64: this.imageBase64,
      userName: this.userProfile?.name,
      birthDate: this.userProfile?.birthDate,
      profileName: this.userProfile?.name,
      lastUserMessage: this.lastUserMsg,
      recentUserMessages,
      spreadNumbers,
      memoryBlock: this.memoryBlock || undefined,
    };
  }

  private buildChatContext() {
    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return {
      userName: this.userProfile?.name,
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
      isPaid: this.billingHandle?.sessionHasFullAccess ?? false,
    };
  }

  /** Assembles system prompt: character, blogger knowledge, user memory, intention/spread blocks. */
  async buildSystemPrompt(): Promise<string> {
    const chatCtx = this.buildChatContext();
    const { numerologyBlock } = buildNumerologyPromptContext({
      characterId: this.characterId,
      birthDate: this.userProfile?.birthDate,
      profileName: this.userProfile?.name,
      lastUserMessage: this.lastUserMsg,
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

    let systemPrompt = buildChatPrompt(this.characterId, chatCtx, {
      sessionNumber,
      memory: [],
      lastUserMessage: this.lastUserMsg,
      intention: this.resolvedIntention,
      numerologyBlock,
    });

    if (this.dbOk) {
      const humanSlug = !isAiMasterId(this.characterId)
        ? this.characterId
        : this.session?.referrer_slug;

      if (humanSlug) {
        const blogger = await getBloggerBySlug(humanSlug);
        if (blogger) {
          const knowledge = await getBloggerKnowledge(blogger.id);
          if (!isAiMasterId(this.characterId)) {
            systemPrompt = buildHumanChatPrompt(blogger, chatCtx, knowledge);
          } else {
            systemPrompt += `\n\nСтиль мастера ${blogger.display_name}: ${blogger.style_notes ?? ""}\nБаза знаний:\n${knowledge}`;
          }
        }
      }
    }

    const sessionHasFullAccess = this.billingHandle?.sessionHasFullAccess ?? false;
    if (!sessionHasFullAccess && this.userProfile && this.tarotCards?.length) {
      systemPrompt +=
        "\n\nНапоминание: при частичном доступе — 2-я и 3-я карты только крючком.";
    }

    if (this.profileUserId) {
      const clientBlock = buildClientBlock({
        name: this.userProfile?.name,
        gender: this.userProfile?.gender,
        zodiac: this.userProfile?.zodiac,
        birthDate: this.userProfile?.birthDate,
        mainQuestion: this.userProfile?.mainQuestion,
        lifeFocus: this.userProfile?.lifeFocus,
      });
      systemPrompt = appendUserMemoryToPrompt(
        systemPrompt,
        `${clientBlock}${this.memoryBlock}`.trim() || null
      );
    }

    systemPrompt += intentionPromptBlock(this.resolvedIntention);
    systemPrompt += buildSpreadBlock(
      this.resolvedSpreadType,
      this.resolvedCardNames.length
        ? this.resolvedCardNames
        : this.tarotCards?.map((c) => c.name),
      this.resolvedIntention,
      { readyToRead: this.lifeDeathReadyToRead }
    );

    if (this.resolvedIntention === "life_death") {
      systemPrompt += `\n\n${LIFE_DEATH_TOPIC}`;
      systemPrompt += `\n\n${LIFE_DEATH_LLM_OVERRIDE}`;
      if (this.lifeDeathReadyToRead) {
        systemPrompt += `\n\n${LIFE_DEATH_AFTER_CONTEXT}`;
      }
    }

    return systemPrompt;
  }

  private baseResponseMeta(extra: Record<string, unknown> = {}) {
    return {
      characterId: this.characterId,
      isPaid: this.billingHandle?.sessionHasFullAccess ?? false,
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
    if (this.dbOk && this.session && this.profileUserId && finalReply) {
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
          const { rows: countRows } = await query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM chat_messages
             WHERE session_id = $1 AND role = 'user'`,
            [this.session.id]
          );
          const userMsgCount = Number(countRows[0]?.cnt ?? 0);
          void maybeCreateDiaryEntry(
            this.profileUserId,
            this.characterId,
            userMsgCount,
            this.llmMessages.map((m) => ({ role: m.role, content: m.content })),
            this.tarotCards?.map((c) => c.name) ?? []
          ).catch((err) => console.warn("Diary entry failed:", err));

          void maybePersistSessionMemory({
            userId: this.profileUserId,
            sessionId: this.session.id,
            characterKey: this.characterId,
            messages: this.llmMessages.map((m) => ({ role: m.role, content: m.content })),
            cardNames: this.tarotCards?.map((c) => c.name) ?? [],
            lastAssistantReply: finalReply,
          }).catch((err) => console.warn("Session memory persist failed:", err));
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
    return createDeterministicTextStream({
      reply,
      llmFailed: false,
      onComplete: async () => {
        const persisted = await this.persistAssistantOutcomeWithRollback(reply, false);
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
          ...(persisted.achievement ? { achievement: persisted.achievement } : {}),
        };
      },
    });
  }

  private async handleStreamComplete(meta: {
    reply: string;
    llmFailed: boolean;
  }): Promise<Record<string, unknown>> {
    let llmFailed = meta.llmFailed;
    let runesRefunded = false;
    let finalReply = meta.reply;

    if (llmFailed && this.numerologParams) {
      const engineFallback = tryNumerologEngineFallback(this.numerologParams);
      if (engineFallback) {
        finalReply = engineFallback.reply;
        if (engineFallback.numerologyUi) {
          this.numerologyUi = engineFallback.numerologyUi;
        }
        llmFailed = false;
      } else {
        finalReply = llmUnavailableReply({ runesRefunded });
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

    let llmFailed = !llmReply;
    let runesRefunded = false;
    let reply = llmReply;

    if (llmFailed && this.numerologParams) {
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
