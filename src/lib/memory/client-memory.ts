/**
 * Unified client memory facade — the single entry point for chat and
 * spread/reading flows (replaces the previous Mem0 path).
 *
 * Read:  loadClientMemoryBlock() — assembles a hidden prompt block from
 *        upcoming dated events + critical facts + query-relevant facts.
 * Write: recordTurn() — fire-and-forget fact extraction + persistence, with
 *        opportunistic re-embedding of any facts stored while embeddings were down.
 */
import { extractFactsFromTurn } from "@/lib/memory/extract-facts";
import {
  getCriticalFacts,
  getUpcomingEvents,
  reembedMissingFacts,
  searchFacts,
  upsertFacts,
  type UserFact,
} from "@/lib/memory/user-facts";
import { filterActiveMemoryFacts } from "@/lib/memory/fact-date-filter";
import {
  isTextRelevantToQuery,
  MEMORY_USAGE_RULES,
} from "@/lib/memory/memory-relevance";

const MAX_BLOCK_CHARS = 3500;
const MAX_FACT_LINES = 10;
/** Matches the cron reminder's default lead time (see getGlobalUpcomingEvents). */
const IMMINENT_EVENT_DAYS = 3;

function daysUntil(eventDate: string | null): number | null {
  if (!eventDate) return null;
  const d = new Date(`${eventDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function dedupeById(groups: UserFact[][]): UserFact[] {
  const seen = new Set<string>();
  const out: UserFact[] = [];
  for (const group of groups) {
    for (const f of group) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

/**
 * Build the hidden "long-term memory" block injected into the system prompt.
 * Returns "" when there is nothing relevant or memory is unavailable.
 */
export async function loadClientMemoryBlock(params: {
  userId: string;
  queryText?: string;
  topK?: number;
}): Promise<string> {
  const { userId, queryText = "", topK = 8 } = params;
  if (!userId) return "";

  let upcoming: UserFact[] = [];
  let critical: UserFact[] = [];
  let relevant: UserFact[] = [];
  try {
    [upcoming, critical, relevant] = await Promise.all([
      getUpcomingEvents(userId),
      getCriticalFacts(userId),
      searchFacts(userId, queryText, { topK }),
    ]);
  } catch (err) {
    console.warn("[memory] load failed:", err instanceof Error ? err.message : err);
    return "";
  }

  const upcomingIds = new Set(upcoming.map((f) => f.id));
  const queryTrimmed = queryText.trim();
  // NB: no early `if (!queryTrimmed) return ""` here — that used to make the
  // "imminent events are unconditional" branch below unreachable whenever the
  // composed query was empty (e.g. a daily 3-card pull with no intention and
  // no saved main question, or a short chat reply). searchFacts()/relevance
  // checks already degrade correctly on their own for an empty query (see
  // their own guards), so removing this just lets imminent events through as
  // documented instead of suppressing the whole block.

  const relevantSearch = filterActiveMemoryFacts(relevant);
  // Events that are days away get surfaced unconditionally (same lead time as the
  // cron reminder), since "it's happening very soon" is worth mentioning even when
  // the current message isn't obviously about it. Everything further out still goes
  // through the relevance gate to avoid cluttering unrelated turns.
  upcoming = filterActiveMemoryFacts(
    upcoming.filter((f) => {
      const days = daysUntil(f.eventDate);
      if (days !== null && days <= IMMINENT_EVENT_DAYS) return true;
      return isTextRelevantToQuery(queryTrimmed, f.fact);
    })
  );
  const criticalFiltered = filterActiveMemoryFacts(
    critical.filter(
      (f) =>
        relevantSearch.some((r) => r.id === f.id) ||
        isTextRelevantToQuery(queryTrimmed, f.fact)
    )
  );
  const general = filterActiveMemoryFacts(
    dedupeById([criticalFiltered, relevantSearch]).filter((f) => !upcomingIds.has(f.id))
  );

  if (!upcoming.length && !general.length) return "";

  const sections: string[] = ["ДОЛГОСРОЧНАЯ ПАМЯТЬ О КЛИЕНТЕ:"];

  if (upcoming.length) {
    const lines = upcoming
      .map((f) => {
        const date = formatEventDate(f.eventDate);
        return `— ${date ? `${date}: ` : ""}${f.fact}`;
      })
      .join("\n");
    sections.push(`БЛИЖАЙШИЕ СОБЫТИЯ:\n${lines}`);
  }

  if (general.length) {
    const lines = general
      .slice(0, MAX_FACT_LINES)
      .map((f) => {
        const date = formatEventDate(f.eventDate);
        return `— ${f.fact}${date ? ` (${date})` : ""}`;
      })
      .join("\n");
    sections.push(`ФАКТЫ:\n${lines}`);
  }

  sections.push(MEMORY_USAGE_RULES);

  const block = `\n${sections.join("\n\n")}\n`;
  return block.length > MAX_BLOCK_CHARS ? `${block.slice(0, MAX_BLOCK_CHARS - 1)}…` : block;
}

/** Retry schedule for the background write pipeline (fire-and-forget path). */
const RECORD_TURN_RETRY_DELAYS_MS = [5_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordTurnOnce(params: {
  userId: string;
  characterId?: string;
  userMessage: string;
  assistantReply: string;
}): Promise<void> {
  const { userId, characterId, userMessage, assistantReply } = params;

  // Best-effort: heal any facts stored without a vector while embeddings were down.
  await reembedMissingFacts(userId).catch(() => 0);

  // Context lookup (Mem0-style): give the extractor the related known facts
  // so it skips duplicates and phrases changes against current state.
  const known = await searchFacts(userId, userMessage, { topK: 12 }).catch(() => []);
  const facts = await extractFactsFromTurn(
    userMessage,
    assistantReply,
    known.map((f) => f.fact)
  );
  if (!facts.length) return;
  await upsertFacts(
    userId,
    facts.map((f) => ({ ...f, sourceCharacter: characterId ?? f.sourceCharacter ?? null }))
  );
  console.log(`[memory] stored ${facts.length} fact(s) for user ${userId.slice(0, 8)}…`);
}

/**
 * Extract and persist durable facts from one conversational exchange.
 * Fire-and-forget: never await on the user-facing path. Transient LLM/DB
 * failures are retried in-process with backoff instead of silently dropping
 * the turn (upsert is idempotent via dedup, so a retry after partial success
 * only merges).
 */
export async function recordTurn(params: {
  userId: string;
  characterId?: string;
  userMessage: string;
  assistantReply: string;
}): Promise<void> {
  if (!params.userId || !params.userMessage?.trim()) return;

  for (let attempt = 0; ; attempt++) {
    try {
      await recordTurnOnce(params);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= RECORD_TURN_RETRY_DELAYS_MS.length) {
        console.warn(`[memory] recordTurn failed after ${attempt + 1} attempts:`, message);
        return;
      }
      console.warn(`[memory] recordTurn attempt ${attempt + 1} failed, will retry:`, message);
      await sleep(RECORD_TURN_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export const ClientMemory = {
  loadClientMemoryBlock,
  recordTurn,
};
