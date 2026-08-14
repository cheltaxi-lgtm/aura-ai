/**
 * Background rebuild of derived snapshots + episodes from raw user_facts.
 * Fail-safe: rebuild errors never break Memory V3.
 */
import { persistCurrentStateSnapshots, computeCurrentStateSnapshots } from "@/lib/memory/current-state";
import { computeEpisodes, persistEpisodes } from "@/lib/memory/episodes";
import {
  claimDirtyIntelligenceUsers,
  clearUserMemoryIntelligenceDirty,
  failUserMemoryIntelligenceDirty,
  markUserMemoryIntelligenceDirty,
  peekUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";
import { listFactsForIntelligenceRebuild } from "@/lib/memory/user-facts";

export {
  markUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";

export async function rebuildUserMemoryIntelligence(
  userId: string,
  opts?: { generation?: number; now?: Date }
): Promise<{
  snapshots: number;
  episodes: number;
  ms: number;
}> {
  const started = Date.now();
  if (!userId) return { snapshots: 0, episodes: 0, ms: 0 };
  const generation =
    opts?.generation ?? (await peekUserMemoryIntelligenceDirty(userId))?.generation;
  const now = opts?.now ?? new Date();
  const facts = await listFactsForIntelligenceRebuild(userId);
  const snapshots = computeCurrentStateSnapshots(facts, now);
  const episodes = computeEpisodes(facts, now);
  await persistCurrentStateSnapshots(userId, snapshots);
  await persistEpisodes(userId, episodes);
  if (generation != null) {
    await clearUserMemoryIntelligenceDirty(userId, generation);
  }
  return {
    snapshots: snapshots.length,
    episodes: episodes.length,
    ms: Date.now() - started,
  };
}

export async function processMemoryIntelligenceJobs(limit = 10): Promise<{
  processed: number;
  failed: number;
  rebuildMs: number;
}> {
  const claims = await claimDirtyIntelligenceUsers(limit);
  let processed = 0;
  let failed = 0;
  let rebuildMs = 0;
  for (const claim of claims) {
    try {
      const result = await rebuildUserMemoryIntelligence(claim.userId, {
        generation: claim.generation,
      });
      processed += 1;
      rebuildMs += result.ms;
    } catch {
      failed += 1;
      await failUserMemoryIntelligenceDirty(claim.userId, claim.generation);
    }
  }
  return { processed, failed, rebuildMs };
}
