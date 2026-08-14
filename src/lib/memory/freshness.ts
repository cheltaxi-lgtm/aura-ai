/**
 * Deterministic freshness / staleness for raw user_facts.
 * Never rewrites facts. stale ≠ false / delete / superseded.
 */
import type { UserFact } from "@/lib/memory/user-facts";

export type FreshnessClass = "stable" | "semi_stable" | "volatile" | "event";
export type FreshnessLabel = "fresh" | "aging" | "stale";
export type FreshnessUsageMode = "current" | "previously_reported" | "historical";

export const FRESHNESS_THRESHOLDS = {
  volatile: { agingDays: 14, staleDays: 45 },
  semi_stable: { agingDays: 90, staleDays: 180 },
  event: { staleAfterEventDays: 14, undatedAgingDays: 30, undatedStaleDays: 60 },
} as const;

const STABLE_PREDICATES = new Set([
  "family.child",
  "family.parent",
  "relationship.divorce",
  "preference.stated",
]);

const SEMI_STABLE_PREDICATES = new Set([
  "employment.current",
  "employment.former",
  "relationship.status",
  "relationship.partner",
  "relationship.former_partner",
  "residence.current",
  "residence.former",
  "education.current",
  "education.former",
  "family.spouse",
  "family.relative",
  "family.friend",
  "family.colleague",
]);

const VOLATILE_PREDICATES = new Set([
  "employment.searching",
  "goal.current",
  "finance.debt",
  "health.condition",
]);

const EVENT_PREDICATES = new Set(["event.upcoming", "health.procedure"]);

export type FreshnessInput = {
  predicateKey?: string | null;
  status?: string | null;
  eventDate?: string | null;
  lastConfirmedAt?: string | null;
  validFrom?: string | null;
  sourceCapturedAt?: string | null;
  updatedAt?: string | null;
};

export type FreshnessAssessment = {
  freshnessClass: FreshnessClass;
  label: FreshnessLabel;
  ageDays: number | null;
  isStale: boolean;
  confidenceLabel: FreshnessLabel;
  usageMode: FreshnessUsageMode;
};

export function freshnessClassForPredicate(
  predicateKey: string | null | undefined
): FreshnessClass {
  const key = predicateKey ?? "";
  if (STABLE_PREDICATES.has(key)) return "stable";
  if (EVENT_PREDICATES.has(key)) return "event";
  if (VOLATILE_PREDICATES.has(key)) return "volatile";
  if (SEMI_STABLE_PREDICATES.has(key)) return "semi_stable";
  if (key.startsWith("event.")) return "event";
  if (key.startsWith("goal.")) return "volatile";
  return "semi_stable";
}

export function freshnessAnchorAt(
  input: FreshnessInput,
  now = new Date()
): Date | null {
  const raw =
    input.lastConfirmedAt ||
    input.validFrom ||
    input.sourceCapturedAt ||
    input.updatedAt ||
    null;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > now.getTime()) return now;
  return date;
}

export function freshnessAgeDays(input: FreshnessInput, now = new Date()): number | null {
  const anchor = freshnessAnchorAt(input, now);
  if (!anchor) return null;
  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));
}

function eventDateUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso.includes("T") ? iso : `${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function labelForAge(
  ageDays: number | null,
  agingDays: number,
  staleDays: number
): FreshnessLabel {
  if (ageDays == null) return "fresh";
  if (ageDays > staleDays) return "stale";
  if (ageDays > agingDays) return "aging";
  return "fresh";
}

export function assessFreshness(
  input: FreshnessInput,
  now = new Date()
): FreshnessAssessment {
  const freshnessClass = freshnessClassForPredicate(input.predicateKey);
  const historical = input.status === "superseded" || input.status === "forgotten";
  const ageDays = freshnessAgeDays(input, now);

  let label: FreshnessLabel = "fresh";
  if (freshnessClass === "stable") {
    label = "fresh";
  } else if (freshnessClass === "volatile") {
    label = labelForAge(
      ageDays,
      FRESHNESS_THRESHOLDS.volatile.agingDays,
      FRESHNESS_THRESHOLDS.volatile.staleDays
    );
  } else if (freshnessClass === "semi_stable") {
    label = labelForAge(
      ageDays,
      FRESHNESS_THRESHOLDS.semi_stable.agingDays,
      FRESHNESS_THRESHOLDS.semi_stable.staleDays
    );
  } else {
    const eventAt = eventDateUtc(input.eventDate);
    if (eventAt) {
      const daysAfterEvent = Math.floor((now.getTime() - eventAt.getTime()) / 86_400_000);
      if (daysAfterEvent > FRESHNESS_THRESHOLDS.event.staleAfterEventDays) label = "stale";
      else if (daysAfterEvent > 0) label = "aging";
      else label = "fresh";
    } else {
      label = labelForAge(
        ageDays,
        FRESHNESS_THRESHOLDS.event.undatedAgingDays,
        FRESHNESS_THRESHOLDS.event.undatedStaleDays
      );
    }
  }

  const isStale = !historical && label === "stale";
  const usageMode: FreshnessUsageMode = historical
    ? "historical"
    : isStale
      ? "previously_reported"
      : "current";

  return {
    freshnessClass,
    label,
    ageDays,
    isStale,
    confidenceLabel: label,
    usageMode,
  };
}

export function assessFactFreshness(fact: UserFact, now = new Date()): FreshnessAssessment {
  return assessFreshness(
    {
      predicateKey: fact.predicateKey,
      status: fact.status,
      eventDate: fact.eventDate,
      lastConfirmedAt: fact.lastConfirmedAt,
      validFrom: fact.validFrom,
      sourceCapturedAt: fact.sourceCapturedAt,
      updatedAt: fact.updatedAt,
    },
    now
  );
}

export function isMemoryIntelligenceEnabled(): boolean {
  const raw = process.env.MEMORY_INTELLIGENCE_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
