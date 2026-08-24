/**
 * Unified client memory facade.
 * Read: consent-gated prompt block (structured XML serialization).
 * Write: durable extraction outbox (not fire-and-forget LLM).
 */
import { extractFactsFromTurnDetailed } from "@/lib/memory/extract-facts";
import {
  claimMemoryExtractionJobs,
  completeMemoryExtractionJob,
  enqueueMemoryExtraction,
  failMemoryExtractionJob,
} from "@/lib/memory/extraction-jobs";
import {
  buildClientMemoryPack,
  emptyMemoryMetrics,
  serializeClientMemoryPack,
  type MemoryRetrievalMetrics,
} from "@/lib/memory/client-memory-pack";
import { memoryBudgetFor, resolveMemoryDepth, type MemoryDepth } from "@/lib/memory/memory-budget";
import {
  canAutoCapture,
  canCaptureSensitive,
  canReadMemory,
  isMemoryMoatV2Eligible,
} from "@/lib/memory/preferences";
import { isSensitiveFact } from "@/lib/memory/predicates";
import { getSetting } from "@/lib/settings";
import {
  reembedMissingFacts,
  searchFacts,
  upsertFacts,
} from "@/lib/memory/user-facts";

/**
 * Build the hidden "long-term memory" block injected into the system prompt.
 * Returns "" when consent is off, nothing relevant, or memory unavailable.
 */
export async function loadClientMemoryBlock(params: {
  userId: string;
  queryText?: string;
  topK?: number;
  sessionId?: string | null;
  depth?: MemoryDepth | null;
  product?: string | null;
  upcomingWithinDays?: number | null;
  upcomingWindow?: { start: string; end: string } | null;
}): Promise<{ block: string; metrics: MemoryRetrievalMetrics }> {
  const { userId, queryText = "", sessionId } = params;
  const started = Date.now();
  if (!userId) {
    return { block: "", metrics: emptyMemoryMetrics(0) };
  }

  try {
    if (!(await canReadMemory(userId))) {
      return { block: "", metrics: emptyMemoryMetrics(Date.now() - started) };
    }
  } catch {
    return { block: "", metrics: emptyMemoryMetrics(Date.now() - started) };
  }

  const queryTrimmed = queryText.trim();
  if (!queryTrimmed) {
    // Empty query: do not inject critical/past/events (fail-closed relevance).
    return { block: "", metrics: emptyMemoryMetrics(Date.now() - started) };
  }

  try {
    const pack = await buildClientMemoryPack({
      userId,
      queryText,
      sessionId,
      depth: params.depth,
      product: params.product,
      upcomingWithinDays: params.upcomingWithinDays,
      upcomingWindow: params.upcomingWindow,
    });
    const depth = resolveMemoryDepth({
      depth: params.depth,
      product: params.product,
      queryText,
    });
    const block = serializeClientMemoryPack(pack, memoryBudgetFor(depth));
    pack.metrics.memory_context_chars = block.length;
    pack.metrics.memory_retrieval_ms = Date.now() - started;
    if (!block.includes("<fact ")) {
      return { block: "", metrics: pack.metrics };
    }
    return { block, metrics: pack.metrics };
  } catch (err) {
    console.warn("[memory] load failed:", err instanceof Error ? err.message : err);
    return { block: "", metrics: emptyMemoryMetrics(Date.now() - started) };
  }
}

/**
 * Enqueue durable extraction. Never runs LLM on the request path.
 */
const FACTLESS_TURN_RE =
  /^(спасибо[!.\s]*|благодарю[!.\s]*|привет[!.\s]*|здравствуй(те)?[!.\s]*|да[!.\s]*|нет[!.\s]*|ок(ей)?[!.\s]*|хорошо[!.\s]*|понятно[!.\s]*|ясно[!.\s]*|угу[!.\s]*|ага[!.\s]*|спс[!.\s]*)+$/i;

export async function recordTurn(params: {
  userId: string;
  characterId?: string;
  userMessage: string;
  assistantReply: string;
  sourceType?: string;
  sourceEntityId?: string | null;
}): Promise<void> {
  if (!params.userId || !params.userMessage?.trim()) return;
  const userMessage = params.userMessage.trim();
  // Skip trivial turns early — no outbox noise / embedding burn.
  if (userMessage.length < 8) return;
  if (userMessage.length < 40 && FACTLESS_TURN_RE.test(userMessage)) return;
  try {
    if (!(await canAutoCapture(params.userId))) return;
    await enqueueMemoryExtraction({
      userId: params.userId,
      sourceType: params.sourceType ?? "chat",
      sourceEntityId: params.sourceEntityId ?? null,
      characterId: params.characterId ?? null,
      userMessage,
      assistantReply: params.assistantReply,
    });
  } catch (err) {
    console.warn(
      "[memory] enqueue failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Process pending extraction jobs (cron / admin maintenance). */
export async function processMemoryExtractionJobs(
  limit = 10,
  userId?: string
): Promise<{ processed: number; stored: number; failed: number }> {
  const jobs = await claimMemoryExtractionJobs(limit, userId);
  let stored = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (!(await canAutoCapture(job.userId))) {
        await completeMemoryExtractionJob(job.id);
        continue;
      }
      const allowSensitive = await canCaptureSensitive(job.userId);
      const features = await getSetting("features");
      const draftCaptureEnabled =
        features.personalMemoryDraftCaptureEnabled !== false &&
        (await isMemoryMoatV2Eligible(job.userId).catch(() => false));
      await reembedMissingFacts(job.userId).catch(() => 0);
      const known = await searchFacts(job.userId, job.userMessage, { topK: 12 }).catch(
        () => []
      );
      const extraction = await extractFactsFromTurnDetailed(
        job.userMessage,
        job.assistantReply ?? "",
        known.map((f) => f.fact)
      );
      const filtered = extraction.facts.filter((f) => {
        if (!allowSensitive && isSensitiveFact(f)) return false;
        if ((f.confidence ?? 1) < 0.85 && !draftCaptureEnabled) return false;
        return true;
      });
      let storedForJob = 0;
      if (filtered.length) {
        storedForJob = await upsertFacts(
          job.userId,
          filtered.map((f) => ({
            ...f,
            sourceCharacter: job.characterId ?? f.sourceCharacter ?? null,
            sourceType: job.sourceType,
            sourceEntityId: job.sourceEntityId,
            allowSensitive,
          }))
        );
        stored += storedForJob;
      }
      await completeMemoryExtractionJob(job.id, {
        extractedCount: extraction.parsedCount,
        storedCount: storedForJob,
        groundingRejectedCount: extraction.groundingRejectedCount,
      });
    } catch (err) {
      failed += 1;
      await failMemoryExtractionJob(
        job.id,
        err instanceof Error ? err.message : String(err)
      ).catch(() => undefined);
    }
  }

  return { processed: jobs.length, stored, failed };
}

export async function loadClientMemoryBlockText(params: {
  userId: string;
  queryText?: string;
  topK?: number;
  sessionId?: string | null;
  depth?: MemoryDepth | null;
  product?: string | null;
  upcomingWithinDays?: number | null;
  upcomingWindow?: { start: string; end: string } | null;
}): Promise<string> {
  const loaded = await loadClientMemoryBlock(params);
  return loaded.block;
}

export const ClientMemory = {
  loadClientMemoryBlock,
  loadClientMemoryBlockText,
  recordTurn,
  processMemoryExtractionJobs,
};
