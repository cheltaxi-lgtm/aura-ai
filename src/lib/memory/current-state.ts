/**
 * Deterministic current-state snapshots from ACTIVE raw facts.
 * IDs only — no derived prose. Fully rebuildable.
 */
import { query } from "@/lib/db";
import { assessFactFreshness } from "@/lib/memory/freshness";
import {
  domainForFact,
  isIntelligenceEligibleFact,
  MEMORY_INTELLIGENCE_ALGORITHM_VERSION,
  MEMORY_SNAPSHOT_DOMAINS,
  type CurrentStateSnapshot,
  type MemorySnapshotDomain,
} from "@/lib/memory/intelligence-types";
import type { UserFact } from "@/lib/memory/user-facts";

function unique(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function pickLatest(facts: UserFact[], predicate: string): UserFact | null {
  const matches = facts.filter((fact) => fact.predicateKey === predicate && fact.status === "active");
  if (!matches.length) return null;
  return [...matches].sort((a, b) => {
    const aAt = a.lastConfirmedAt || a.validFrom || a.sourceCapturedAt || a.updatedAt || "";
    const bAt = b.lastConfirmedAt || b.validFrom || b.sourceCapturedAt || b.updatedAt || "";
    return bAt.localeCompare(aAt);
  })[0];
}

function idsForPredicate(facts: UserFact[], predicate: string): string[] {
  return facts
    .filter((fact) => fact.predicateKey === predicate && fact.status === "active")
    .map((fact) => fact.id);
}

function freshnessFor(fact: UserFact | null): string | null {
  if (!fact) return null;
  return assessFactFreshness(fact).label;
}

function entityKeysOf(facts: UserFact[]): string[] {
  return unique(facts.map((fact) => fact.entityKey));
}

export function computeCurrentStateSnapshots(
  facts: UserFact[],
  now = new Date()
): CurrentStateSnapshot[] {
  void now;
  const eligible = facts.filter(
    (fact) => isIntelligenceEligibleFact(fact) && fact.status === "active"
  );
  const computedAt = new Date().toISOString();
  const snapshots: CurrentStateSnapshot[] = [];

  for (const domain of MEMORY_SNAPSHOT_DOMAINS) {
    const domainFacts = eligible.filter((fact) => domainForFact(fact) === domain);
    if (!domainFacts.length) continue;

    let state: Record<string, unknown> = {};
    let primaryFactIds: string[] = [];

    if (domain === "work") {
      const current = pickLatest(domainFacts, "employment.current");
      const searching = pickLatest(domainFacts, "employment.searching");
      const goals = idsForPredicate(
        eligible.filter(
          (fact) =>
            fact.predicateKey === "goal.current" &&
            (fact.category === "work" || domainForFact(fact) === "work" || domain === "work")
        ),
        "goal.current"
      );
      state = {
        current: current?.id ?? null,
        searching: searching?.id ?? null,
        former: idsForPredicate(domainFacts, "employment.former"),
        goals,
        relatedEntities: entityKeysOf(domainFacts),
        freshness: {
          current: freshnessFor(current),
          searching: freshnessFor(searching),
        },
      };
      primaryFactIds = unique([current?.id, searching?.id, ...goals]);
    } else if (domain === "relationship") {
      const status = pickLatest(domainFacts, "relationship.status");
      const partner = pickLatest(domainFacts, "relationship.partner");
      const former = idsForPredicate(domainFacts, "relationship.former_partner");
      const divorce = idsForPredicate(domainFacts, "relationship.divorce");
      state = {
        status: status?.id ?? null,
        partner: partner?.id ?? null,
        former,
        divorce,
        relatedEntities: entityKeysOf(domainFacts),
        freshness: {
          status: freshnessFor(status),
          partner: freshnessFor(partner),
        },
      };
      primaryFactIds = unique([status?.id, partner?.id, ...former, ...divorce]);
    } else if (domain === "family") {
      const children = idsForPredicate(domainFacts, "family.child");
      const parents = idsForPredicate(domainFacts, "family.parent");
      const spouse = pickLatest(domainFacts, "family.spouse");
      state = {
        children,
        parents,
        spouse: spouse?.id ?? null,
        relatives: idsForPredicate(domainFacts, "family.relative"),
        relatedEntities: entityKeysOf(domainFacts),
        freshness: { spouse: freshnessFor(spouse) },
      };
      primaryFactIds = unique([...children, ...parents, spouse?.id]);
    } else if (domain === "money") {
      const debts = idsForPredicate(domainFacts, "finance.debt");
      state = {
        debts,
        relatedEntities: entityKeysOf(domainFacts),
        freshness: debts[0]
          ? freshnessFor(domainFacts.find((fact) => fact.id === debts[0]) ?? null)
          : null,
      };
      primaryFactIds = debts;
    } else if (domain === "health") {
      const conditions = idsForPredicate(domainFacts, "health.condition");
      const procedures = idsForPredicate(domainFacts, "health.procedure");
      state = {
        conditions,
        procedures,
        relatedEntities: entityKeysOf(domainFacts),
      };
      primaryFactIds = unique([...conditions, ...procedures]);
    } else if (domain === "residence") {
      const current = pickLatest(domainFacts, "residence.current");
      state = {
        current: current?.id ?? null,
        former: idsForPredicate(domainFacts, "residence.former"),
        relatedEntities: entityKeysOf(domainFacts),
        freshness: { current: freshnessFor(current) },
      };
      primaryFactIds = unique([current?.id]);
    } else if (domain === "education") {
      const current = pickLatest(domainFacts, "education.current");
      state = {
        current: current?.id ?? null,
        former: idsForPredicate(domainFacts, "education.former"),
        relatedEntities: entityKeysOf(domainFacts),
        freshness: { current: freshnessFor(current) },
      };
      primaryFactIds = unique([current?.id]);
    } else if (domain === "goals") {
      const goals = idsForPredicate(domainFacts, "goal.current");
      state = {
        current: goals,
        relatedEntities: entityKeysOf(domainFacts),
      };
      primaryFactIds = goals;
    }

    const supportingFactIds = unique(domainFacts.map((fact) => fact.id));
    snapshots.push({
      domain,
      state,
      supportingFactIds,
      primaryFactIds,
      entityKeys: entityKeysOf(domainFacts),
      computedAt,
      algorithmVersion: MEMORY_INTELLIGENCE_ALGORITHM_VERSION,
    });
  }

  return snapshots;
}

export async function persistCurrentStateSnapshots(
  userId: string,
  snapshots: CurrentStateSnapshot[]
): Promise<void> {
  const domains = snapshots.map((snapshot) => snapshot.domain);
  if (!domains.length) {
    await query(`DELETE FROM user_memory_state_snapshots WHERE user_id = $1`, [userId]);
    return;
  }
  await query(
    `DELETE FROM user_memory_state_snapshots
      WHERE user_id = $1 AND NOT (domain = ANY($2::text[]))`,
    [userId, domains]
  );
  for (const snapshot of snapshots) {
    await query(
      `INSERT INTO user_memory_state_snapshots (
         user_id, domain, state_json, supporting_fact_ids, computed_at, algorithm_version
       ) VALUES ($1, $2, $3::jsonb, $4::uuid[], $5::timestamptz, $6)
       ON CONFLICT (user_id, domain) DO UPDATE SET
         state_json = EXCLUDED.state_json,
         supporting_fact_ids = EXCLUDED.supporting_fact_ids,
         computed_at = EXCLUDED.computed_at,
         algorithm_version = EXCLUDED.algorithm_version`,
      [
        userId,
        snapshot.domain,
        JSON.stringify(snapshot.state),
        snapshot.supportingFactIds,
        snapshot.computedAt,
        snapshot.algorithmVersion,
      ]
    );
  }
}

type SnapshotRow = {
  domain: MemorySnapshotDomain;
  state_json: Record<string, unknown> | string;
  supporting_fact_ids: string[] | null;
  computed_at: Date | string;
  algorithm_version: string;
};

function mapSnapshotRow(row: SnapshotRow): CurrentStateSnapshot {
  const state =
    typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json ?? {};
  const supporting = row.supporting_fact_ids ?? [];
  const primary = Array.isArray((state as { current?: unknown }).current)
    ? ((state as { current: string[] }).current ?? [])
    : unique([
        typeof (state as { current?: unknown }).current === "string"
          ? (state as { current: string }).current
          : null,
        typeof (state as { searching?: unknown }).searching === "string"
          ? (state as { searching: string }).searching
          : null,
        typeof (state as { partner?: unknown }).partner === "string"
          ? (state as { partner: string }).partner
          : null,
        typeof (state as { status?: unknown }).status === "string"
          ? (state as { status: string }).status
          : null,
      ]);
  return {
    domain: row.domain,
    state,
    supportingFactIds: supporting,
    primaryFactIds: primary,
    entityKeys: Array.isArray((state as { relatedEntities?: unknown }).relatedEntities)
      ? ((state as { relatedEntities: string[] }).relatedEntities ?? [])
      : [],
    computedAt:
      row.computed_at instanceof Date ? row.computed_at.toISOString() : String(row.computed_at),
    algorithmVersion: row.algorithm_version,
  };
}

export async function loadCurrentStateSnapshots(
  userId: string,
  domains?: MemorySnapshotDomain[]
): Promise<CurrentStateSnapshot[]> {
  if (!userId) return [];
  const { rows } = domains?.length
    ? await query<SnapshotRow>(
        `SELECT domain, state_json, supporting_fact_ids, computed_at, algorithm_version
           FROM user_memory_state_snapshots
          WHERE user_id = $1 AND domain = ANY($2::text[])`,
        [userId, domains]
      )
    : await query<SnapshotRow>(
        `SELECT domain, state_json, supporting_fact_ids, computed_at, algorithm_version
           FROM user_memory_state_snapshots
          WHERE user_id = $1`,
        [userId]
      );
  return rows.map(mapSnapshotRow);
}
