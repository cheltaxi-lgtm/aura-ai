import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import {
  assembleClientMemoryPackSync,
  resolveUpcomingFetchWindow,
} from "@/lib/memory/client-memory-pack";
import { buildNatalForecastMemoryQuery } from "@/lib/natal/personalization-lens";
import type { UserFact } from "@/lib/memory/user-facts";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function fact(over: Partial<UserFact> & Pick<UserFact, "id" | "fact">): UserFact {
  return {
    category: "event",
    eventDate: null,
    sourceCharacter: null,
    salience: 3,
    status: "active",
    predicateKey: "event.upcoming",
    entityKey: null,
    subjectKey: "client",
    sensitivity: "normal",
    confidence: 0.9,
    sourceType: "chat",
    captureTier: "durable",
    archiveTier: "hot",
    ...over,
  };
}

describe("natal forecast memory lens", () => {
  it("forecast query includes horizon, window, and life-focus theme", () => {
    const query = buildNatalForecastMemoryQuery({
      horizonDays: 30,
      windowStart: "2026-08-24",
      windowEnd: "2026-09-23",
      lifeFocus: "career",
      mainQuestion: "стоит ли менять работу",
    });
    expect(query).toContain("прогноз на 30 дней");
    expect(query).toContain("2026-08-24");
    expect(query).toContain("2026-09-23");
    expect(query).toContain("Карьера");
    expect(query).toContain("работа");
    expect(query).toContain("стоит ли менять работу");
    expect(expandMemoryQuery(query).topic).toBe("work");
  });

  it("forecast route and rewrite pass the timing window into the lens", () => {
    const route = readSrc("src/app/api/natal-chart/forecast/route.ts");
    const rewrite = readSrc("scripts/rewrite-natal-reports.ts");
    const lens = readSrc("src/lib/natal/personalization-lens.ts");
    expect(route).toContain("horizonDays: horizon");
    expect(route).toContain("windowStart: timing.windowStart");
    expect(rewrite).toContain("horizonDays: horizon");
    expect(lens).toContain('includePastSessions: !isForecast');
    expect(lens).toContain('depth: isForecast ? "standard" : "deep"');
    expect(lens).toContain("upcomingWithinDays: params.forecast?.horizonDays");
    expect(lens).toContain("upcomingWindow: params.forecast");
    expect(lens).toMatch(/не источник фактов карты/i);
    expect(lens).toContain("Даты из памяти не подменяют timing evidence");
  });

  it("interpretation still uses the generic natal query", () => {
    const lens = readSrc("src/lib/natal/personalization-lens.ts");
    expect(lens).toContain('params.user?.main_question || "натальная трактовка"');
    const interpretation = readSrc("src/app/api/natal-chart/interpretation/route.ts");
    expect(interpretation).toContain("appendNatalPersonalizationLens");
    expect(interpretation).not.toContain("forecast:");
  });

  it("does not turn stored natal transits into memory evidence", () => {
    const service = readSrc("src/lib/services/natal-chart-service.ts");
    const compute = readSrc("src/lib/natal/compute.ts");
    expect(service).toContain("correlateMemory: false");
    expect(compute).toContain("correlateMemory: false");
  });
});

describe("natal forecast upcoming window", () => {
  it("maps forecast horizons onto upcoming fetch windows", () => {
    expect(resolveUpcomingFetchWindow(undefined)).toEqual({ days: 45, limit: 5 });
    expect(resolveUpcomingFetchWindow(7)).toEqual({ days: 7, limit: 5 });
    expect(resolveUpcomingFetchWindow(90)).toEqual({ days: 90, limit: 6 });
    expect(resolveUpcomingFetchWindow(365)).toEqual({ days: 365, limit: 8 });
  });

  it("keeps dated events for a forecast window even if the query is generic", () => {
    const wedding = fact({
      id: "evt-wedding",
      fact: "Свадьба в сентябре",
      eventDate: "2026-09-12",
      category: "event",
      predicateKey: "event.upcoming",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "натальная трактовка",
      candidates: [wedding],
      expansion: expandMemoryQuery("натальная трактовка"),
      depth: "standard",
      relevanceFlags: [false],
      upcomingWithinDays: 30,
      upcomingWindow: { start: "2026-08-24", end: "2026-09-23" },
    });
    expect(pack.upcomingEvents.map((item) => item.id)).toContain("evt-wedding");
  });

  it("uses the natal calendar window, not a rolling UTC horizon from now", () => {
    const inWindow = fact({
      id: "evt-in",
      fact: "Событие в окне карты",
      eventDate: "2026-08-24",
      category: "event",
      predicateKey: "event.upcoming",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "натальная трактовка",
      candidates: [inWindow],
      expansion: expandMemoryQuery("натальная трактовка"),
      depth: "standard",
      relevanceFlags: [false],
      upcomingWithinDays: 7,
      upcomingWindow: { start: "2026-08-24", end: "2026-08-31" },
    });
    expect(pack.upcomingEvents.map((item) => item.id)).toContain("evt-in");
  });

  it("does not keep dated events outside the requested forecast window", () => {
    const later = fact({
      id: "evt-later",
      fact: "Событие через сорок дней",
      eventDate: "2026-10-03",
      category: "event",
      predicateKey: "event.upcoming",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "натальная трактовка",
      candidates: [later],
      expansion: expandMemoryQuery("натальная трактовка"),
      depth: "standard",
      relevanceFlags: [false],
      upcomingWithinDays: 7,
      upcomingWindow: { start: "2026-08-24", end: "2026-08-31" },
    });
    expect(pack.upcomingEvents.map((item) => item.id)).not.toContain("evt-later");
  });

  it("drops query-matching dated events that fall outside the forecast window", () => {
    const later = fact({
      id: "evt-later-relevant",
      fact: "Свадьба через сорок дней",
      eventDate: "2026-10-03",
      category: "event",
      predicateKey: "event.upcoming",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "свадьба отношения партнёр",
      candidates: [later],
      expansion: expandMemoryQuery("свадьба отношения партнёр"),
      depth: "standard",
      relevanceFlags: [true],
      upcomingWithinDays: 7,
      upcomingWindow: { start: "2026-08-24", end: "2026-08-31" },
    });
    expect(pack.upcomingEvents.map((item) => item.id)).not.toContain("evt-later-relevant");
  });

  it("keeps people facts even if they carry an out-of-window date", () => {
    const partner = fact({
      id: "person-partner",
      fact: "Партнёр Анна",
      eventDate: "2026-12-01",
      category: "relationship",
      predicateKey: "relationship.partner",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "отношения партнёр",
      candidates: [partner],
      expansion: expandMemoryQuery("отношения партнёр"),
      depth: "standard",
      relevanceFlags: [true],
      upcomingWithinDays: 7,
      upcomingWindow: { start: "2026-08-24", end: "2026-08-31" },
    });
    expect(pack.coreFacts.map((item) => item.id)).toContain("person-partner");
    expect(pack.upcomingEvents.map((item) => item.id)).not.toContain("person-partner");
  });

  it("drops dated events when no forecast window is requested and query does not match", () => {
    const eventDate = new Date();
    eventDate.setUTCDate(eventDate.getUTCDate() + 10);
    const wedding = fact({
      id: "evt-wedding",
      fact: "Свадьба через десять дней",
      eventDate: eventDate.toISOString().slice(0, 10),
      category: "event",
      predicateKey: "event.upcoming",
    });
    const pack = assembleClientMemoryPackSync({
      queryText: "натальная трактовка",
      candidates: [wedding],
      expansion: expandMemoryQuery("натальная трактовка"),
      depth: "standard",
      relevanceFlags: [false],
    });
    expect(pack.upcomingEvents.map((item) => item.id)).not.toContain("evt-wedding");
  });
});
