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
  const memoryOn = userId ? await canReadMemory(userId).catch(() => false) : false;

  const [factsBlock, pastSessionsBlock, sessionAnchorBlock] = await Promise.all([
    memoryOn ? loadClientMemoryBlock({ userId, queryText }) : Promise.resolve(""),
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

  // Profile identity fields stay available; thematic fields remain relevance-gated.
  const clientBlock = params.profile ? buildClientBlock(params.profile, queryText) : "";

  return { queryText, clientBlock, pastSessionsBlock, sessionAnchorBlock, factsBlock };
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
