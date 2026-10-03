import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarInstant, calendarParts, productCalendarDate } from "@/lib/product-calendar";
import { pythagorasSquare, PYTHAGORAS_METHOD_VERSION } from "@/lib/numerology/pythagoras-square";
import { enrichNumerologMessagesOnRestore, resolvePythagorasSquareForMessage } from "@/lib/numerology/resolve-message-ui";
import type { Message } from "@/types";
import { fullProfile } from "@/lib/numerology/profile";
import { personalYearForecast } from "@/lib/numerology/forecast";
import { personalDay, personalMonth, personalWeek } from "@/lib/numerology/calculator";
import { compatibility } from "@/lib/numerology/compatibility";
import { favorableDates } from "@/lib/numerology/favorable-dates";
import { getMoonPhase } from "@/lib/moon";
import { computeRitualSchedule, formatRitualTimeLabel } from "@/lib/ritual-timing";
import { getAge, getChineseZodiac, buildAstroMeta, getLifePathNumber } from "@/lib/astro-profile";
import { parseCardOrientation } from "@/lib/card-orientation";
import { parsePickedIndices, resolvePickedSpread } from "@/lib/spread-draw";
import { dailyCardsKey, normalizeDailyTripletCards } from "@/lib/daily-triplet-cards";
import { validateDailyTripletInput } from "@/lib/daily-triplet-validate";
import { computeSynastry, sanitizeSynastryForClient, computeSynastryDimensions, computeCrossAspects } from "@/lib/natal/synastry";
import { computeWesternChart } from "@/lib/natal/western";
import { resolveBirthUtcOffsetHours } from "@/lib/natal/time";
import { toCelestineBirthDataAtLocalTime } from "@/lib/natal/celestine/adapter";
import { computeNatalChartRecord } from "@/lib/natal/compute";
import { computeDeepTransits } from "@/lib/natal/transits";
import type { NatalChartRecord } from "@/lib/natal/types";

vi.mock("@/lib/memory/user-facts", () => ({ listFacts: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/natal/geocode", () => ({ resolveBirthPlace: vi.fn() }));

const originalTz = process.env.TZ;
afterEach(() => { vi.useRealTimers(); process.env.TZ = originalTz; });

describe("calendar boundaries use the declared calendar, not host TZ", () => {
  it.each([
    ["2026-11-01", "America/Havana", "2026-11-01T04:00:00.000Z"],
    ["2026-03-08", "America/Havana", "2026-03-08T05:00:00.000Z"],
    ["2026-09-06", "America/Santiago", "2026-09-06T04:00:00.000Z"],
  ])("resolves a calendar boundary %s in %s", (date, zone, expected) => {
    expect(calendarInstant(date, 0, zone)?.toISOString()).toBe(expected);
    const data = toCelestineBirthDataAtLocalTime(date, { label: "test", latitude: 0, longitude: 0, timezone: zone }, 0);
    const instant = new Date(Date.UTC(data.year, data.month - 1, data.day, data.hour, data.minute, data.second));
    expect(instant.toISOString()).toBe(expected);
  });
  it("skips a whole missing civil day, while retaining strict birth semantics", () => {
    expect(calendarInstant("2011-12-30", 0, "Pacific/Apia")).toBeNull();
    expect(() => resolveBirthUtcOffsetHours("2026-11-01", "00:00", "America/Havana")).toThrow("AMBIGUOUS_BIRTH_TIME");
    expect(() => resolveBirthUtcOffsetHours("2026-03-08", "00:00", "America/Havana")).toThrow("NONEXISTENT_BIRTH_TIME");
  });
  it("keeps numerology year/month/day stable across host zones", () => {
    const instant = new Date("2026-12-31T22:30:00Z");
    const outputs = ["UTC", "America/Los_Angeles", "Asia/Tokyo"].map(zone => {
      process.env.TZ = zone;
      const profile = fullProfile("1990-05-15", "Анна", "pythagorean", instant);
      return [personalMonth("1990-05-15", instant).number, personalDay("1990-05-15", instant).number,
        personalWeek("1990-05-15", instant).number, profile.forecast9Years[0]?.year];
    });
    expect(outputs).toEqual([[5, 6, 6, 2027], [5, 6, 6, 2027], [5, 6, 6, 2027]]);
    expect(productCalendarDate(instant)).toBe("2027-01-01");
  });
  it("favorable dates cover exactly the requested civil month in all host zones", () => {
    const outcomes = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"].map(zone => {
      process.env.TZ = zone;
      return favorableDates("1990-05-15", 2, 2028);
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
    expect(Object.values(outcomes[0]!).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });
});

describe("four working numbers and truthful input validity", () => {
  // Published Aleksandrov example 15.04.1972: 29, 11, 27, 9 (not recursive reductions).
  it.each([
    ["1972-04-15", [29, 11, 27, 9], { 1: 4, 2: 3, 3: 0, 4: 1, 5: 1, 6: 0, 7: 2, 8: 0, 9: 3 }],
    ["2000-01-01", [4, 4, 2, 2], { 1: 2, 2: 3, 3: 0, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }],
    ["1990-01-10", [21, 3, 19, 10], { 1: 6, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 3 }],
    ["2000-01-09", [12, 3, -6, 6], { 1: 2, 2: 2, 3: 1, 4: 0, 5: 0, 6: 2, 7: 0, 8: 0, 9: 1 }],
  ])("keeps all digits and repeated work numbers for %s", (date, working, cells) => {
    const square = pythagorasSquare(date as string)!;
    expect(square.workingNumbers).toEqual(working);
    expect(square.cells).toEqual(cells);
    expect(square.methodVersion).toBe(PYTHAGORAS_METHOD_VERSION);
  });
  it("maps cell meanings to 3 interest, 4 health, 5 logic, 6 labor, 7 luck, 8 duty", () => {
    const square = pythagorasSquare("1972-04-15")!;
    for (const [key, number] of Object.entries({ character: 1, energy: 2, interest: 3, health: 4, logic: 5, labor: 6, luck: 7, duty: 8, memory: 9 })) {
      expect(square.interpretation[key as keyof typeof square.interpretation].count).toBe(square.cells[number as keyof typeof square.cells]);
    }
    expect(square.lines.cols[2].label).toContain("7-8-9");
  });
  it("does not invent a forecast from an invalid birth date/name", () => {
    const result = fullProfile("not-a-date", "!!!");
    expect(result.hasValidBirthDate).toBe(false);
    expect(result.hasValidName).toBe(false);
    expect(result.forecast9Years).toEqual([]);
    expect(personalYearForecast("2001-02-30")).toEqual([]);
    expect(buildAstroMeta("2001-02-30")).toBeNull();
    expect(getLifePathNumber("2001-02-30")).toBe(0);
  });
  it("preserves attached historical grids and labels a reconstruction from the current profile", () => {
    const historical = { ...pythagorasSquare("1972-04-15")!, methodVersion: undefined };
    const message: Message = { id: "old", role: "assistant", content: "Сохранённый квадрат Пифагора. ".repeat(8), timestamp: new Date(0), numerologyUi: { pythagorasSquare: historical } };
    expect(resolvePythagorasSquareForMessage([message], 0, "2000-01-01", "pythagoras")).toBe(historical);
    expect(enrichNumerologMessagesOnRestore([message], { birthDate: "2000-01-01", numerologToolId: "pythagoras" })[0]).toBe(message);
    const missing = { ...message, numerologyUi: undefined };
    const restored = enrichNumerologMessagesOnRestore([missing], { birthDate: "2000-01-01", numerologToolId: "pythagoras" })[0];
    expect(restored.content).toBe(message.content);
    expect(restored.numerologyUi?.pythagorasSquare?.reconstructedFromCurrentProfile).toBe(true);
    expect(restored.numerologyUi?.pythagorasSquare?.birthDate).toBe("2000-01-01");
  });
  it("compatibility score and risk/strength lists do not depend on partner order", () => {
    const dates = ["1990-01-09", "2000-09-09", "2000-01-01", "1990-05-15", "1987-04-03", "1999-09-09"];
    for (const dateA of dates) for (const dateB of dates) {
      const a = compatibility(dateA, "Алексей", dateB, "Анна");
      const b = compatibility(dateB, "Анна", dateA, "Алексей");
      expect([a.score, a.strengths, a.risks]).toEqual([b.score, b.strengths, b.risks]);
    }
  });
});

describe("astronomical Moon and future ritual appointments", () => {
  // Independent ephemeris audit anchors: apparent lunar longitudes 92.428° and 155°.
  it.each([["2026-10-03T00:00:00Z", "Раке"], ["2026-10-07T12:00:00Z", "Деве"]])("uses real lunar longitude at %s", (date, sign) => {
    expect(getMoonPhase(new Date(date)).sign).toBe(sign);
  });
  it("supports dates preceding the former arbitrary 2000 epoch", () => {
    expect(getMoonPhase(new Date("1990-01-01T12:00:00Z")).phaseKey).toBe("waxing");
  });
  it("never chooses an earlier hour today and computes phase at the chosen hour", () => {
    const from = new Date("2026-10-03T22:00:00Z");
    const results = ["UTC", "America/Los_Angeles", "Asia/Tokyo"].map(zone => {
      process.env.TZ = zone;
      const result = computeRitualSchedule("protection", from);
      expect(result.at.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(calendarParts(result.at).hour).toBe(18);
      expect(result.moonPhase).toBe(getMoonPhase(result.at).phase);
      expect(result.label).toBe(formatRitualTimeLabel(result.at));
      return result;
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
});

describe("Chinese lunar year anchors", () => {
  // Hong Kong Observatory civil lunar calendar: 1987-01-29, 2000-02-05.
  it.each([["1987-01-01", "Тигр"], ["1987-01-28", "Тигр"], ["1987-01-29", "Кролик"], ["2000-02-04", "Кролик"], ["2000-02-05", "Дракон"]])("maps %s to %s", (date, expected) => {
    expect(getChineseZodiac(date)).toBe(expected);
  });
  it("uses the product civil birthday for age", () => {
    expect(getAge("2000-01-01", new Date("2026-12-31T22:30:00Z"))).toBe(27);
  });
});

describe("card input and identity", () => {
  const cards = [{ id: 0, name: "Шут", position: 0, reversed: false }, { id: 1, name: "Маг", position: 1, reversed: true }, { id: 2, name: "Жрица", position: 2, reversed: false }];
  it.each(["false", "true", {}, 1, 0, null, undefined])("rejects non-boolean orientation %s at the write boundary", value => {
    expect(validateDailyTripletInput({ cards: [{ ...cards[0], reversed: value }, ...cards.slice(1)] }).ok).toBe(false);
  });
  it("keeps an explicit legacy read path without coercing string false", () => {
    expect(normalizeDailyTripletCards(cards.map(({ reversed: _r, ...card }) => card), { allowLegacyMissingOrientation: true })?.[0].reversed).toBe(false);
    expect(normalizeDailyTripletCards([{ ...cards[0], reversed: "false" }, ...cards.slice(1)], { allowLegacyMissingOrientation: true })).toBeNull();
  });
  it("keys deck, exact card identity, order and orientation independently", () => {
    const base = dailyCardsKey(cards);
    expect(base).toMatch(/^cards:v2:/);
    expect(dailyCardsKey(cards, "tarot-marina")).not.toBe(base);
    expect(dailyCardsKey([{ ...cards[0], reversed: true }, ...cards.slice(1)])).not.toBe(base);
    expect(dailyCardsKey([...cards].reverse())).not.toBe(base);
  });
  it("does not truncate fractional ids or positions into valid cards", () => {
    expect(validateDailyTripletInput({ cards: [{ ...cards[0], id: 0.7 }, ...cards.slice(1)] }).ok).toBe(false);
    expect(validateDailyTripletInput({ cards: [{ ...cards[0], position: 0.7 }, ...cards.slice(1)] }).ok).toBe(false);
  });
  it.each(["(перевёрнутая)", "(перевернутая)", "перевёрнутая", "(перев.)", "(reversed)", "upside-down"]) ("parses complete orientation marker %s", marker => {
    expect(parseCardOrientation(`Сила ${marker}`)).toEqual({ name: "Сила", reversed: true });
  });
  it("does not strip prefixes from unrelated words", () => {
    expect(parseCardOrientation("Переводчик")).toEqual({ name: "Переводчик", reversed: false });
  });
  it.each(["1abc", "1.7", "1e2", "0x1", "", "-1", "+1", "01"]) ("rejects an inexact picked index %s", token => {
    expect(() => parsePickedIndices(`${token},2,3`, 78, 3)).toThrow();
  });
  it("validates both text picks and already-decoded integer picks", () => {
    expect(parsePickedIndices("0, 77, 4", 78, 3)).toEqual([0, 77, 4]);
    expect(() => parsePickedIndices("0,0,1", 78, 3)).toThrow("duplicate");
    expect(() => resolvePickedSpread([], [0])).toThrow("invalid");
  });
});

describe("natal calendar compute and synastry replay", () => {
  it("allows a real birth earlier today instead of comparing to artificial noon", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T05:00:00Z"));
    const result = await computeNatalChartRecord("calc-test", { birthDate: "2026-10-03", birthTime: "01:00", timeKnown: true,
      place: { label: "UTC", latitude: 0, longitude: 0, timezone: "UTC" } });
    expect(result.western).toBeTruthy();
    await expect(computeNatalChartRecord("calc-test", { birthDate: "2026-10-03", birthTime: "06:00", timeKnown: true,
      place: { label: "UTC", latitude: 0, longitude: 0, timezone: "UTC" } })).rejects.toThrow("INVALID_BIRTH_DATE");
  });
  it("transit horizons survive midnight folds/gaps and skipped calendar days", async () => {
    const western = await computeWesternChart({ birthDate: "1990-05-15", localHourDecimal: 14, utcOffsetHours: 0, latitude: 55, longitude: 37, timeKnown: true });
    for (const [timezone, reference] of [["America/Havana", "2026-10-31T12:00:00Z"], ["America/Havana", "2026-03-07T12:00:00Z"], ["America/Santiago", "2026-09-05T12:00:00Z"], ["Pacific/Apia", "2011-12-29T12:00:00Z"]]) {
      const natal = { western, timeKnown: true, place: { label: "test", latitude: 0, longitude: 0, timezone } } as NatalChartRecord;
      await expect(computeDeepTransits(natal, { horizonDays: 2, referenceDate: new Date(reference), correlateMemory: false })).resolves.toBeInstanceOf(Array);
    }
  });
  it("stored/sanitized evidence and partner reversal preserve the same scores", async () => {
    const options = { localHourDecimal: 14, utcOffsetHours: 0, latitude: 55, longitude: 37, timeKnown: true };
    const a = { western: await computeWesternChart({ ...options, birthDate: "1987-04-03" }), timeKnown: true } as NatalChartRecord;
    const b = { western: await computeWesternChart({ ...options, birthDate: "1990-05-15" }), timeKnown: true } as NatalChartRecord;
    const ab = computeSynastry(a, b)!; const ba = computeSynastry(b, a)!;
    expect(computeCrossAspects(a.western!, b.western!).length).toBeGreaterThan(16);
    expect(ab.dimensions).toEqual(computeSynastryDimensions(ab.crossAspects));
    const restored = sanitizeSynastryForClient(JSON.parse(JSON.stringify(ab)))!;
    expect(restored.overallScore).toBe(ab.overallScore);
    expect(restored.dimensions).toEqual(ab.dimensions);
    expect(ba.overallScore).toBe(ab.overallScore);
    expect(ba.dimensions.map(d => d.index)).toEqual(ab.dimensions.map(d => d.index));
  });
  it("synastry tie-breaking is symmetric across a range of dense aspect sets", () => {
    const chart = (seed: number): NatalChartRecord => {
      const longitude = (i: number) => ((seed * 137 + i * 59) % 360) + (i % 3) * 0.004;
      return { timeKnown: true, western: { sun: { longitude: longitude(0) }, moon: { longitude: longitude(1) },
        rising: { longitude: longitude(2) }, planets: Object.fromEntries(["mercury", "venus", "mars", "jupiter", "saturn"].map((key, i) => [key, { longitude: longitude(i + 3) }])) } } as NatalChartRecord;
    };
    for (let seed = 0; seed < 40; seed++) {
      const ab = computeSynastry(chart(seed), chart(seed + 7))!;
      const ba = computeSynastry(chart(seed + 7), chart(seed))!;
      expect([ab.overallScore, ab.dimensions.map(d => d.index)]).toEqual([ba.overallScore, ba.dimensions.map(d => d.index)]);
      expect(sanitizeSynastryForClient(ab)?.dimensions).toEqual(ab.dimensions);
    }
  });
});
