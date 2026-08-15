/**
 * Deterministic life episodes from raw facts.
 * Grouped by user + domain + entity/subject, then split by temporal gap
 * unless a predicate transition keeps the chapter open. No LLM. No graph DB.
 */
import { query } from "@/lib/db";
import {
  domainForFact,
  INTELLIGENCE_CLEAN_USER_SQL,
  isIntelligenceEligibleFact,
  MEMORY_INTELLIGENCE_ALGORITHM_VERSION,
  type MemoryEpisode,
  type MemoryEpisodeDomain,
  type MemoryEpisodeStatus,
} from "@/lib/memory/intelligence-types";
import type { UserFact } from "@/lib/memory/user-facts";

export const EPISODE_GAP_DAYS = {
  event: 90,
  work: 180,
  default: 180,
} as const;

const CURRENTISH_PREDICATES = new Set([
  "employment.current",
  "employment.searching",
  "relationship.partner",
  "relationship.status",
  "residence.current",
  "education.current",
  "goal.current",
]);

const FORMER_PREDICATES = new Set([
  "relationship.former_partner",
  "relationship.divorce",
  "employment.former",
  "residence.former",
  "education.former",
]);

function factTime(fact: UserFact): number {
  const raw = fact.validFrom || fact.sourceCapturedAt || fact.eventDate || fact.updatedAt || "";
  const at = raw ? new Date(raw.includes("T") || raw.includes(" ") ? raw : `${raw}T00:00:00Z`) : null;
  return at && !Number.isNaN(at.getTime()) ? at.getTime() : 0;
}

function isoOrNull(ms: number): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function groupingEntity(fact: UserFact): string {
  return (fact.entityKey || fact.subjectKey || "client").trim() || "client";
}

function gapDaysFor(domain: MemoryEpisodeDomain): number {
  if (domain === "event") return EPISODE_GAP_DAYS.event;
  if (domain === "work") return EPISODE_GAP_DAYS.work;
  return EPISODE_GAP_DAYS.default;
}

function isPersonEntityGroup(facts: UserFact[]): boolean {
  return facts.some((fact) => Boolean(fact.entityKey?.startsWith("person:")));
}

function isWorkTransition(prev: UserFact, next: UserFact): boolean {
  const a = prev.predicateKey ?? "";
  const b = next.predicateKey ?? "";
  if (a === "employment.searching" && (b === "employment.current" || b === "event.upcoming" || b === "employment.searching")) {
    return true;
  }
  if (a === "event.upcoming" && (b === "employment.current" || b === "event.upcoming" || b === "employment.searching")) {
    return true;
  }
  if (a === "employment.current" && b === "employment.former") return true;
  return false;
}

function shouldSplitSegment(
  domain: MemoryEpisodeDomain,
  prev: UserFact,
  next: UserFact
): boolean {
  const prevAt = factTime(prev);
  const nextAt = factTime(next);
  if (!prevAt || !nextAt) return false;
  const gapDays = Math.floor((nextAt - prevAt) / 86_400_000);
  if (gapDays <= gapDaysFor(domain)) return false;
  if (domain === "work" && isWorkTransition(prev, next)) return false;
  return true;
}

function segmentFacts(domain: MemoryEpisodeDomain, facts: UserFact[]): UserFact[][] {
  const sorted = [...facts].sort((a, b) => {
    const delta = factTime(a) - factTime(b);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
  if (!sorted.length) return [];
  if (
    (domain === "relationship" || domain === "family") &&
    isPersonEntityGroup(sorted)
  ) {
    return [sorted];
  }
  const segments: UserFact[][] = [];
  let current: UserFact[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = current[current.length - 1];
    const next = sorted[i];
    if (shouldSplitSegment(domain, prev, next)) {
      segments.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  segments.push(current);
  return segments;
}

function episodeKeyFor(
  domain: MemoryEpisodeDomain,
  groupId: string,
  facts: UserFact[]
): string {
  const safe = groupId.replace(/[^a-z0-9:_-]+/gi, "_").slice(0, 120);
  if ((domain === "relationship" || domain === "family") && isPersonEntityGroup(facts)) {
    return `p1:${domain}:${safe}:${domain}`;
  }
  const startMs = Math.min(...facts.map(factTime).filter(Boolean));
  const bucket = startMs
    ? new Date(startMs).toISOString().slice(0, 10)
    : `id:${facts[0].id.replace(/-/g, "").slice(0, 12)}`;
  return `p1:${domain}:${safe}:${bucket}`;
}

function episodeStatus(facts: UserFact[]): MemoryEpisodeStatus {
  const active = facts.filter((fact) => (fact.status ?? "active") === "active");
  if (!active.length) return "historical";
  const currentish = active.some((fact) => CURRENTISH_PREDICATES.has(fact.predicateKey ?? ""));
  const onlyFormer = active.every((fact) => FORMER_PREDICATES.has(fact.predicateKey ?? ""));
  if (onlyFormer && !currentish) return "historical";
  return "active";
}

function sharedEntityKey(facts: UserFact[]): string | null {
  const keys = [...new Set(facts.map((fact) => fact.entityKey).filter(Boolean))] as string[];
  return keys.length === 1 ? keys[0] : null;
}

export function computeEpisodes(facts: UserFact[], now = new Date()): MemoryEpisode[] {
  const eligible = facts.filter(isIntelligenceEligibleFact);
  const groups = new Map<string, { domain: MemoryEpisodeDomain; facts: UserFact[] }>();

  for (const fact of eligible) {
    const domain = domainForFact(fact);
    if (!domain) continue;
    const groupId = `${domain}:${groupingEntity(fact)}`;
    const existing = groups.get(groupId);
    if (existing) existing.facts.push(fact);
    else groups.set(groupId, { domain, facts: [fact] });
  }

  const computedAt = now.toISOString();
  const episodes: MemoryEpisode[] = [];
  for (const [groupId, group] of groups) {
    const entityOrClient = groupId.slice(group.domain.length + 1);
    for (const segment of segmentFacts(group.domain, group.facts)) {
      if (!segment.length) continue;
      const times = segment.map(factTime).filter(Boolean);
      episodes.push({
        domain: group.domain,
        entityKey: sharedEntityKey(segment),
        startAt: times.length ? isoOrNull(Math.min(...times)) : null,
        endAt: times.length ? isoOrNull(Math.max(...times)) : null,
        status: episodeStatus(segment),
        supportingFactIds: [...new Set(segment.map((fact) => fact.id))],
        episodeKey: episodeKeyFor(group.domain, entityOrClient, segment),
        computedAt,
        algorithmVersion: MEMORY_INTELLIGENCE_ALGORITHM_VERSION,
      });
    }
  }
  return episodes.sort((a, b) => a.episodeKey.localeCompare(b.episodeKey));
}

export async function persistEpisodes(userId: string, episodes: MemoryEpisode[]): Promise<void> {
  const keys = episodes.map((episode) => episode.episodeKey);
  if (!keys.length) {
    await query(`DELETE FROM user_memory_episodes WHERE user_id = $1`, [userId]);
    return;
  }
  await query(
    `DELETE FROM user_memory_episodes
      WHERE user_id = $1 AND NOT (episode_key = ANY($2::text[]))`,
    [userId, keys]
  );
  for (const episode of episodes) {
    await query(
      `INSERT INTO user_memory_episodes (
         user_id, domain, entity_key, start_at, end_at, status,
         supporting_fact_ids, episode_key, computed_at, algorithm_version
       ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::uuid[], $8, $9::timestamptz, $10)
       ON CONFLICT (user_id, episode_key) DO UPDATE SET
         domain = EXCLUDED.domain,
         entity_key = EXCLUDED.entity_key,
         start_at = EXCLUDED.start_at,
         end_at = EXCLUDED.end_at,
         status = EXCLUDED.status,
         supporting_fact_ids = EXCLUDED.supporting_fact_ids,
         computed_at = EXCLUDED.computed_at,
         algorithm_version = EXCLUDED.algorithm_version`,
      [
        userId,
        episode.domain,
        episode.entityKey,
        episode.startAt,
        episode.endAt,
        episode.status,
        episode.supportingFactIds,
        episode.episodeKey,
        episode.computedAt,
        episode.algorithmVersion,
      ]
    );
  }
}

type EpisodeRow = {
  id: string;
  domain: MemoryEpisodeDomain;
  entity_key: string | null;
  start_at: Date | string | null;
  end_at: Date | string | null;
  status: MemoryEpisodeStatus;
  supporting_fact_ids: string[] | null;
  episode_key: string;
  computed_at: Date | string;
  algorithm_version: string;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapEpisodeRow(row: EpisodeRow): MemoryEpisode {
  return {
    id: row.id,
    domain: row.domain,
    entityKey: row.entity_key,
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    status: row.status,
    supportingFactIds: row.supporting_fact_ids ?? [],
    episodeKey: row.episode_key,
    computedAt: iso(row.computed_at) ?? new Date().toISOString(),
    algorithmVersion: row.algorithm_version,
  };
}

export async function loadEpisodes(
  userId: string,
  opts?: { domains?: MemoryEpisodeDomain[]; entityKeys?: string[] }
): Promise<MemoryEpisode[]> {
  if (!userId) return [];
  const domains = opts?.domains;
  const { rows } = domains?.length
    ? await query<EpisodeRow>(
        `SELECT id, domain, entity_key, start_at, end_at, status,
                supporting_fact_ids, episode_key, computed_at, algorithm_version
           FROM user_memory_episodes
          WHERE user_id = $1 AND domain = ANY($2::text[])
            AND ${INTELLIGENCE_CLEAN_USER_SQL}
          ORDER BY status ASC, computed_at DESC`,
        [userId, domains]
      )
    : await query<EpisodeRow>(
        `SELECT id, domain, entity_key, start_at, end_at, status,
                supporting_fact_ids, episode_key, computed_at, algorithm_version
           FROM user_memory_episodes
          WHERE user_id = $1
            AND ${INTELLIGENCE_CLEAN_USER_SQL}
          ORDER BY status ASC, computed_at DESC`,
        [userId]
      );
  const mapped = rows.map(mapEpisodeRow);
  const entityKeys = opts?.entityKeys ?? [];
  if (!entityKeys.length) return mapped;
  return mapped.filter(
    (episode) => episode.entityKey && entityKeys.includes(episode.entityKey)
  );
}
