/**
 * Background rebuild of derived snapshots + episodes from raw user_facts.
 * Fail-safe: rebuild errors never break Memory V3.
 */
import { persistCurrentStateSnapshots, computeCurrentStateSnapshots } from "@/lib/memory/current-state";
import { computeEpisodes, persistEpisodes } from "@/lib/memory/episodes";
import {
  claimDirtyIntelligenceUsers,
  clearUserMemoryIntelligenceDirty,
  countMemoryIntelligenceOps,
  failUserMemoryIntelligenceDirty,
  incrementIntelligenceRebuildTruncated,
  isMemoryIntelligenceClaimCurrent,
  markUserMemoryIntelligenceDirty,
  peekUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
  releaseMemoryIntelligenceClaim,
  type MemoryIntelligenceOpsCounts,
} from "@/lib/memory/intelligence-dirty";
import { listFactsForIntelligenceRebuild } from "@/lib/memory/user-facts";

export {
  markUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";

export async function rebuildUserMemoryIntelligence(
  userId: string,
  opts?: {
    generation?: number;
    processingAt?: string | null;
    now?: Date;
    pageSize?: number;
    maxPages?: number;
    beforePersist?: () => Promise<void>;
  }
): Promise<{
  snapshots: number;
  episodes: number;
  ms: number;
  truncated: boolean;
  skipped: boolean;
}> {
  const started = Date.now();
  const empty = { snapshots: 0, episodes: 0, ms: 0, truncated: false, skipped: false };
  if (!userId) return empty;
  const peeked = await peekUserMemoryIntelligenceDirty(userId);
  const generation = opts?.generation ?? peeked?.generation;
  const processingAt = opts?.processingAt ?? peeked?.processingAt ?? null;
  const now = opts?.now ?? new Date();
  const { facts, truncated } = await listFactsForIntelligenceRebuild(userId, {
    pageSize: opts?.pageSize,
    maxPages: opts?.maxPages,
  });
  const snapshots = computeCurrentStateSnapshots(facts, now);
  const episodes = computeEpisodes(facts, now);
  if (opts?.beforePersist) {
    await opts.beforePersist();
  }
  if (processingAt && generation != null) {
    const current = await isMemoryIntelligenceClaimCurrent(userId, generation, processingAt);
    if (!current) {
      await releaseMemoryIntelligenceClaim(userId, processingAt);
      return { ...empty, ms: Date.now() - started, skipped: true };
    }
  } else {
    const latest = await peekUserMemoryIntelligenceDirty(userId);
    if (latest?.processingAt) {
      return { ...empty, ms: Date.now() - started, skipped: true };
    }
    if (generation != null && latest && latest.generation !== generation) {
      return { ...empty, ms: Date.now() - started, skipped: true };
    }
  }
  await persistCurrentStateSnapshots(userId, snapshots);
  await persistEpisodes(userId, episodes);
  if (truncated) {
    await incrementIntelligenceRebuildTruncated();
  }
  if (generation != null) {
    await clearUserMemoryIntelligenceDirty(userId, generation, processingAt);
  }
  return {
    snapshots: snapshots.length,
    episodes: episodes.length,
    ms: Date.now() - started,
    truncated,
    skipped: false,
  };
}

export async function processMemoryIntelligenceJobs(limit = 10): Promise<{
  processed: number;
  failed: number;
  skipped: number;
  rebuildMs: number;
  truncated: number;
} & MemoryIntelligenceOpsCounts> {
  const claims = await claimDirtyIntelligenceUsers(limit);
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let rebuildMs = 0;
  let truncated = 0;
  for (const claim of claims) {
    try {
      const result = await rebuildUserMemoryIntelligence(claim.userId, {
        generation: claim.generation,
        processingAt: claim.processingAt,
      });
      rebuildMs += result.ms;
      if (result.skipped) {
        skipped += 1;
      } else {
        processed += 1;
        if (result.truncated) truncated += 1;
      }
    } catch {
      failed += 1;
      await failUserMemoryIntelligenceDirty(claim.userId, claim.generation, claim.processingAt);
    }
  }
  const ops = await countMemoryIntelligenceOps();
  return { processed, failed, skipped, rebuildMs, truncated, ...ops };
}
