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
  markUserMemoryIntelligenceDirty,
  peekUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
  type MemoryIntelligenceOpsCounts,
} from "@/lib/memory/intelligence-dirty";
import { listFactsForIntelligenceRebuild } from "@/lib/memory/user-facts";

export {
  markUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";

export async function rebuildUserMemoryIntelligence(
  userId: string,
  opts?: { generation?: number; now?: Date; pageSize?: number; maxPages?: number }
): Promise<{
  snapshots: number;
  episodes: number;
  ms: number;
  truncated: boolean;
}> {
  const started = Date.now();
  if (!userId) return { snapshots: 0, episodes: 0, ms: 0, truncated: false };
  const generation =
    opts?.generation ?? (await peekUserMemoryIntelligenceDirty(userId))?.generation;
  const now = opts?.now ?? new Date();
  const { facts, truncated } = await listFactsForIntelligenceRebuild(userId, {
    pageSize: opts?.pageSize,
    maxPages: opts?.maxPages,
  });
  const snapshots = computeCurrentStateSnapshots(facts, now);
  const episodes = computeEpisodes(facts, now);
  await persistCurrentStateSnapshots(userId, snapshots);
  await persistEpisodes(userId, episodes);
  if (truncated) {
    await incrementIntelligenceRebuildTruncated();
  }
  if (generation != null) {
    await clearUserMemoryIntelligenceDirty(userId, generation);
  }
  return {
    snapshots: snapshots.length,
    episodes: episodes.length,
    ms: Date.now() - started,
    truncated,
  };
}

export async function processMemoryIntelligenceJobs(limit = 10): Promise<{
  processed: number;
  failed: number;
  rebuildMs: number;
  truncated: number;
} & MemoryIntelligenceOpsCounts> {
  const claims = await claimDirtyIntelligenceUsers(limit);
  let processed = 0;
  let failed = 0;
  let rebuildMs = 0;
  let truncated = 0;
  for (const claim of claims) {
    try {
      const result = await rebuildUserMemoryIntelligence(claim.userId, {
        generation: claim.generation,
      });
      processed += 1;
      rebuildMs += result.ms;
      if (result.truncated) truncated += 1;
    } catch {
      failed += 1;
      await failUserMemoryIntelligenceDirty(claim.userId, claim.generation);
    }
  }
  const ops = await countMemoryIntelligenceOps();
  return { processed, failed, rebuildMs, truncated, ...ops };
}
