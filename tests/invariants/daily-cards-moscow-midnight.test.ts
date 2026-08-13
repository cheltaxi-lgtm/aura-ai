import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isSameProductCalendarDay,
  nextProductMidnight,
  PRODUCT_CALENDAR_TIMEZONE,
  productCalendarDate,
  zonedStartOfDay,
} from "@/lib/product-calendar";
import { tripletCooldownFromLastDraw } from "@/lib/triplet-limit";

describe("daily 3-cards reset at 00:00 Europe/Moscow", () => {
  it("product timezone is IANA Moscow", () => {
    expect(PRODUCT_CALENDAR_TIMEZONE).toBe("Europe/Moscow");
  });

  it("00:00 Moscow is UTC 21:00 previous calendar day (permanent UTC+3)", () => {
    expect(zonedStartOfDay("2026-08-14").toISOString()).toBe("2026-08-13T21:00:00.000Z");
    expect(zonedStartOfDay("2026-01-01").toISOString()).toBe("2025-12-31T21:00:00.000Z");
  });

  it("next midnight after 23:30 Moscow is tonight's 00:00", () => {
    const at2330 = new Date("2026-08-13T20:30:00.000Z");
    expect(productCalendarDate(at2330)).toBe("2026-08-13");
    expect(nextProductMidnight(at2330).toISOString()).toBe("2026-08-13T21:00:00.000Z");
  });

  it("draw at 23:30 Moscow stays blocked until 00:00 Moscow, even under 24h", () => {
    const last = new Date("2026-08-13T20:30:00.000Z");
    const stillSameDay = tripletCooldownFromLastDraw(last, new Date("2026-08-13T20:45:00.000Z"));
    expect(stillSameDay.allowed).toBe(false);
    expect(stillSameDay.nextAvailableAt).toBe("2026-08-13T21:00:00.000Z");

    const justAfterMidnight = tripletCooldownFromLastDraw(
      last,
      new Date("2026-08-13T21:00:01.000Z")
    );
    expect(justAfterMidnight.allowed).toBe(true);
    expect(justAfterMidnight.nextAvailableAt).toBeNull();
  });

  it("draw at 00:30 Moscow is still today's draw until the next midnight", () => {
    const last = new Date("2026-08-13T21:30:00.000Z");
    const evening = tripletCooldownFromLastDraw(last, new Date("2026-08-14T20:00:00.000Z"));
    expect(evening.allowed).toBe(false);
    expect(evening.nextAvailableAt).toBe("2026-08-14T21:00:00.000Z");
  });

  it("addCalendarDays crosses months", () => {
    expect(addCalendarDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("today's artifact is same Moscow civil date, not ±24h", () => {
    const yesterdayEvening = new Date("2026-08-13T20:30:00.000Z");
    const afterMidnight = new Date("2026-08-13T21:05:00.000Z");
    expect(isSameProductCalendarDay(yesterdayEvening, afterMidnight)).toBe(false);
    expect(isSameProductCalendarDay(afterMidnight, afterMidnight)).toBe(true);
  });
});
