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
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";
import { listFactTimeline } from "@/lib/memory/user-facts";

export {
  markUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
} from "@/lib/memory/intelligence-dirty";

export async function rebuildUserMemoryIntelligence(userId: string): Promise<{
  snapshots: number;
  episodes: number;
  ms: number;
}> {
  const started = Date.now();
  if (!userId) return { snapshots: 0, episodes: 0, ms: 0 };
  const facts = await listFactTimeline(userId, 400);
  const snapshots = computeCurrentStateSnapshots(facts);
  const episodes = computeEpisodes(facts);
  await persistCurrentStateSnapshots(userId, snapshots);
  await persistEpisodes(userId, episodes);
  await clearUserMemoryIntelligenceDirty(userId);
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
  const userIds = await claimDirtyIntelligenceUsers(limit);
  let processed = 0;
  let failed = 0;
  let rebuildMs = 0;
  for (const userId of userIds) {
    try {
      const result = await rebuildUserMemoryIntelligence(userId);
      processed += 1;
      rebuildMs += result.ms;
    } catch {
      failed += 1;
      await failUserMemoryIntelligenceDirty(userId);
    }
  }
  return { processed, failed, rebuildMs };
}
