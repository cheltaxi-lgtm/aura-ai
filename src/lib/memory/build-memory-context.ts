/**
 * Single entry point that assembles every memory layer for one prompt build.
 *
 * Before this module existed, the same five calls (composeMemoryQueryText +
 * loadClientMemoryBlock + buildMemoryBlock + buildCurrentSessionAnchorBlock +
 * buildClientBlock, wired through Promise.all) were copy-pasted across
 * chat-orchestrator, /api/reading, /api/intention-spread and
 * /api/photo-reading/stream — with small, easy-to-miss differences between
 * them (e.g. /api/reading used to render past-session memory twice: once via
 * the legacy `buildCharacterPrompt({ memory })` param, and again via its own
 * buildMemoryBlock() call). Centralizing it here means any future fix to
 * relevance gating, dedup, or block formatting only needs to happen once.
 */
import {
  appendUserMemoryToPrompt,
  buildClientBlock,
  buildCurrentSessionAnchorBlock,
  buildMemoryBlock,
  type ClientProfile,
  type SessionAnchorFallback,
} from "@/lib/user-memory";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";
import { canReadMemory } from "@/lib/memory/preferences";
import { canSessionReadLongTermMemory } from "@/lib/session";
import { recordMemoryProductEvent } from "@/lib/memory/product-analytics";
import type { MemoryDepth } from "@/lib/memory/memory-budget";
import type { MemoryRetrievalMetrics } from "@/lib/memory/client-memory-pack";
import { emptyMemoryMetrics } from "@/lib/memory/client-memory-pack";

export interface MemoryContextParams {
  userId?: string | null;
  characterId: string;
  /**
   * Current session id — used to exclude the active session from past memories
   * and to build the live session anchor. Past sessions load even when this is missing.
   */
  sessionId?: string | null;
  profile?: ClientProfile | null;
  lastUserMessage?: string | null;
  intention?: string | null;
  customQuestion?: string | null;
  mainQuestion?: string | null;
  /** Live "what we've already covered this session" anchor — chat flow only. */
  sessionAnchorFallback?: SessionAnchorFallback;
  includeSessionAnchor?: boolean;
  /** Default true — chat's period-spread mode turns this off. */
  includePastSessions?: boolean;
  /** compact | standard | deep — adaptive memory budget. */
  depth?: MemoryDepth;
  /** Product hint for budget (reading, natal, hd, matrix, daily, chat). */
  product?: string | null;
  /**
   * When set, upcoming-event retrieval uses this many days instead of the
   * default 45-day window (natal forecast horizon).
   */
  upcomingWithinDays?: number | null;
  /** Inclusive YYYY-MM-DD bounds from natal timing (preferred over rolling days). */
  upcomingWindow?: { start: string; end: string } | null;
}

export interface MemoryContext {
  /** The composed query text every block below was gated against. */
  queryText: string;
  /** ПРОФИЛЬ КЛИЕНТА block (sync, no DB/network call). */
  clientBlock: string;
  /** Past-session summaries from session_memories, relevance-gated. */
  pastSessionsBlock: string;
  /** Running anchor of the *current* session. "" unless includeSessionAnchor. */
  sessionAnchorBlock: string;
  /** Long-term semantic facts from user_facts (upcoming events + critical + search). */
  factsBlock: string;
  retrievalMetrics: MemoryRetrievalMetrics;
}

export async function buildMemoryContext(params: MemoryContextParams): Promise<MemoryContext> {
  const queryText = composeMemoryQueryText({
    lastUserMessage: params.lastUserMessage,
    intention: params.intention,
    customQuestion: params.customQuestion,
    mainQuestion: params.mainQuestion,
  });

  const userId = params.userId ?? "";
  const includePastSessions = params.includePastSessions ?? true;
  const consentOn = userId ? await canReadMemory(userId).catch(() => false) : false;
  const sessionAllowsLongTerm =
    !params.sessionId ||
    (userId
      ? await canSessionReadLongTermMemory(params.sessionId, userId).catch(() => false)
      : false);
  const memoryOn = consentOn && sessionAllowsLongTerm;

  const [factsLoaded, pastSessionsBlock, sessionAnchorBlock] = await Promise.all([
    memoryOn
      ? loadClientMemoryBlock({
          userId,
          queryText,
          sessionId: params.sessionId,
          depth: params.depth,
          product: params.product,
          upcomingWithinDays: params.upcomingWithinDays,
          upcomingWindow: params.upcomingWindow,
        })
      : Promise.resolve({ block: "", metrics: emptyMemoryMetrics() }),
    memoryOn && includePastSessions
      ? buildMemoryBlock(userId, params.characterId, params.sessionId ?? null, queryText)
      : Promise.resolve(""),
    // Live session anchor is operational context, not long-term memory storage.
    userId && params.sessionId && params.includeSessionAnchor
      ? buildCurrentSessionAnchorBlock(
          userId,
          params.sessionId,
          params.characterId,
          params.sessionAnchorFallback,
          queryText
        )
      : Promise.resolve(""),
  ]);
  const factsBlock = factsLoaded.block;
  const retrievalMetrics = factsLoaded.metrics;

  // Profile identity fields stay available; thematic fields remain relevance-gated.
  const clientBlock = params.profile ? buildClientBlock(params.profile, queryText) : "";

  if (userId && (factsBlock || pastSessionsBlock)) {
    void recordMemoryProductEvent({
      event: "memory_injected",
      userId,
      sessionId: params.sessionId ?? null,
      sourceType: "chat",
      memoryEnabled: true,
      numericValue: retrievalMetrics.memory_retrieval_ms,
      metrics: {
        memory_candidates_count: retrievalMetrics.memory_candidates_count,
        memory_selected_count: retrievalMetrics.memory_selected_count,
        memory_core_count: retrievalMetrics.memory_core_count,
        memory_entity_matches_count: retrievalMetrics.memory_entity_matches_count,
        memory_timeline_matches_count: retrievalMetrics.memory_timeline_matches_count,
        memory_archived_matches_count: retrievalMetrics.memory_archived_matches_count,
        memory_context_chars: retrievalMetrics.memory_context_chars,
        memory_retrieval_ms: retrievalMetrics.memory_retrieval_ms,
      },
    });
  }

  return {
    queryText,
    clientBlock,
    pastSessionsBlock,
    sessionAnchorBlock,
    factsBlock,
    retrievalMetrics,
  };
}

/**
 * Common concatenation for the reading/photo/intention-spread prompt builders
 * (no live session anchor — they render a fresh spread, not an ongoing chat).
 */
export function appendMemoryContextToPrompt(systemPrompt: string, ctx: MemoryContext): string {
  return appendUserMemoryToPrompt(
    systemPrompt,
    `${ctx.clientBlock}${ctx.pastSessionsBlock}${ctx.factsBlock}`.trim() || null
  );
}
