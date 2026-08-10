import { describe, expect, it } from "vitest";
import { formatProDateOnly } from "@/modules/pro/adapters/date-only";
import { casePayloadFromClientBirth } from "@/modules/pro/adapters/client-birth";

describe("pro date-only", () => {
  it("formats pg Date and ISO without String.slice bug", () => {
    expect(formatProDateOnly(new Date(Date.UTC(1988, 6, 7)))).toBe("1988-07-07");
    expect(formatProDateOnly("1988-07-07T00:00:00.000Z")).toBe("1988-07-07");
    expect(formatProDateOnly("1988-07-07")).toBe("1988-07-07");
    expect(formatProDateOnly("Thu Jul 07")).toBeNull();
  });

  it("seeds case payload with valid birthDate", () => {
    const seed = casePayloadFromClientBirth({
      birth_date: new Date(Date.UTC(1990, 0, 15)),
      birth_place: "Potsdam, Brandenburg, Germany",
      birth_lat: 52.39,
      birth_lon: 13.06,
      birth_tz: "Europe/Berlin",
    });
    expect(seed?.birthDate).toBe("1990-01-15");
  });
});
