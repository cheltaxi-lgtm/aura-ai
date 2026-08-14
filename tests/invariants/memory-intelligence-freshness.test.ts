import { describe, expect, it } from "vitest";
import {
  assessFreshness,
  FRESHNESS_THRESHOLDS,
  freshnessClassForPredicate,
} from "@/lib/memory/freshness";

const NOW = new Date("2026-08-14T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe("Memory Intelligence P1 freshness", () => {
  it("classifies stable / semi_stable / volatile / event without rewriting predicates", () => {
    expect(freshnessClassForPredicate("family.child")).toBe("stable");
    expect(freshnessClassForPredicate("employment.current")).toBe("semi_stable");
    expect(freshnessClassForPredicate("employment.searching")).toBe("volatile");
    expect(freshnessClassForPredicate("event.upcoming")).toBe("event");
  });

  it("D: old family.child is not stale from age alone", () => {
    const result = assessFreshness(
      {
        predicateKey: "family.child",
        status: "active",
        lastConfirmedAt: daysAgo(400),
      },
      NOW
    );
    expect(result.freshnessClass).toBe("stable");
    expect(result.isStale).toBe(false);
    expect(result.label).toBe("fresh");
    expect(result.usageMode).toBe("current");
  });

  it("C: old employment.searching is stale and previously_reported", () => {
    const result = assessFreshness(
      {
        predicateKey: "employment.searching",
        status: "active",
        lastConfirmedAt: daysAgo(FRESHNESS_THRESHOLDS.volatile.staleDays + 5),
      },
      NOW
    );
    expect(result.isStale).toBe(true);
    expect(result.label).toBe("stale");
    expect(result.usageMode).toBe("previously_reported");
  });

  it("semi_stable ages then stales at conservative thresholds", () => {
    const aging = assessFreshness(
      {
        predicateKey: "employment.current",
        status: "active",
        lastConfirmedAt: daysAgo(FRESHNESS_THRESHOLDS.semi_stable.agingDays + 1),
      },
      NOW
    );
    expect(aging.label).toBe("aging");
    expect(aging.isStale).toBe(false);

    const stale = assessFreshness(
      {
        predicateKey: "residence.current",
        status: "active",
        lastConfirmedAt: daysAgo(FRESHNESS_THRESHOLDS.semi_stable.staleDays + 1),
      },
      NOW
    );
    expect(stale.label).toBe("stale");
    expect(stale.isStale).toBe(true);
  });

  it("event is stale after event_date + 14d, or 60d if undated", () => {
    const dated = assessFreshness(
      {
        predicateKey: "event.upcoming",
        status: "active",
        eventDate: "2026-07-20",
        lastConfirmedAt: daysAgo(10),
      },
      NOW
    );
    expect(dated.isStale).toBe(true);

    const undated = assessFreshness(
      {
        predicateKey: "event.upcoming",
        status: "active",
        lastConfirmedAt: daysAgo(FRESHNESS_THRESHOLDS.event.undatedStaleDays + 1),
      },
      NOW
    );
    expect(undated.isStale).toBe(true);
  });

  it("superseded is historical regardless of freshness age", () => {
    const result = assessFreshness(
      {
        predicateKey: "employment.searching",
        status: "superseded",
        lastConfirmedAt: daysAgo(200),
      },
      NOW
    );
    expect(result.usageMode).toBe("historical");
    expect(result.isStale).toBe(false);
  });
});
