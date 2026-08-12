/**
 * P2.3: auth retention D1/D7/later — privacy-safe Metrika event.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_RETENTION_TIMEZONE,
  calendarDaysBetween,
  resolveAuthRetentionState,
} from "@/lib/auth-retention";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** Noon UTC on a calendar day that is the same date in Europe/Moscow. */
function moscowNoonIso(ymd: string): string {
  return `${ymd}T09:00:00.000Z`; // 12:00 MSK (UTC+3, no DST)
}

describe("auth-retention-analytics", () => {
  it("calendarDaysBetween is whole local days", () => {
    expect(calendarDaysBetween("2026-08-01", "2026-08-01")).toBe(0);
    expect(calendarDaysBetween("2026-08-01", "2026-08-02")).toBe(1);
    expect(calendarDaysBetween("2026-08-01", "2026-08-08")).toBe(7);
    expect(calendarDaysBetween("bad", "2026-08-01")).toBeNull();
  });

  it("registration day → no retention_return state", () => {
    const createdAt = moscowNoonIso("2026-08-12");
    const now = new Date(moscowNoonIso("2026-08-12"));
    expect(
      resolveAuthRetentionState({
        createdAt,
        now,
        timezone: AUTH_RETENTION_TIMEZONE,
      })
    ).toBeNull();
  });

  it("next calendar day → d1", () => {
    expect(
      resolveAuthRetentionState({
        createdAt: moscowNoonIso("2026-08-11"),
        now: new Date(moscowNoonIso("2026-08-12")),
        timezone: AUTH_RETENTION_TIMEZONE,
      })
    ).toBe("d1");
  });

  it("day 7 → d7", () => {
    expect(
      resolveAuthRetentionState({
        createdAt: moscowNoonIso("2026-08-05"),
        now: new Date(moscowNoonIso("2026-08-12")),
        timezone: AUTH_RETENTION_TIMEZONE,
      })
    ).toBe("d7");
  });

  it("> day 7 → later", () => {
    expect(
      resolveAuthRetentionState({
        createdAt: moscowNoonIso("2026-08-01"),
        now: new Date(moscowNoonIso("2026-08-12")),
        timezone: AUTH_RETENTION_TIMEZONE,
      })
    ).toBe("later");
  });

  it("days 2–6 are not measured buckets", () => {
    for (const day of ["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"]) {
      expect(
        resolveAuthRetentionState({
          createdAt: moscowNoonIso("2026-08-05"),
          now: new Date(moscowNoonIso(day)),
          timezone: AUTH_RETENTION_TIMEZONE,
        })
      ).toBeNull();
    }
  });

  it("anonymous / missing createdAt → no state", () => {
    expect(resolveAuthRetentionState({ createdAt: null })).toBeNull();
    expect(resolveAuthRetentionState({ createdAt: undefined })).toBeNull();
    expect(resolveAuthRetentionState({ createdAt: "" })).toBeNull();
    expect(resolveAuthRetentionState({ createdAt: "not-a-date" })).toBeNull();
  });

  it("trackRetentionReturn payload is product/source/state only", () => {
    const src = read("src/lib/seo/product-funnel.ts");
    expect(src).toMatch(/reachGoal\(\s*["']retention_return["']/);
    expect(src).toMatch(/product:\s*["']home["']/);
    expect(src).toMatch(/source:\s*["']personal_zovus["']/);
    const fn = src.slice(src.indexOf("function trackRetentionReturn"));
    const body = fn.slice(0, fn.indexOf("\nexport ") > 0 ? fn.indexOf("\nexport ") : 400);
    expect(body).not.toMatch(/userId|email|createdAt|birth|name|session|artifact/i);
  });

  it("Personal Zovus home wires retention without PII and keeps daily analytics", () => {
    const home = read("src/components/editorial/PersonalZovusHome.tsx");
    expect(home).toMatch(/trackRetentionReturn/);
    expect(home).toMatch(/resolveAuthRetentionState/);
    expect(home).toMatch(/accountCreatedAt/);
    expect(home).toMatch(/trackDailyCardsOfferView/);
    expect(home).toMatch(/trackDailyCardsReturnView/);
    expect(home).toMatch(/trackPersonalZovusEvent\(\s*["']personal_home_view["']/);
    expect(home).not.toMatch(/localStorage/);
    expect(home).not.toMatch(
      /trackRetentionReturn\([\s\S]{0,120}(userId|email|birthDate|createdAt)/
    );
  });

  it("auth/me exposes createdAt from user_accounts (no schema change)", () => {
    const me = read("src/app/api/auth/me/route.ts");
    expect(me).toMatch(/getAccountCreatedAt/);
    expect(me).toMatch(/createdAt/);
    const accounts = read("src/lib/accounts.ts");
    expect(accounts).toMatch(/SELECT created_at FROM user_accounts/);
    expect(read("src/lib/useAuth.ts")).toMatch(/createdAt\?:/);
  });

  it("HomePage passes server createdAt into PersonalZovusHome only when auth", () => {
    const hp = read("src/components/HomePage.tsx");
    expect(hp).toMatch(/accountCreatedAt=\{authUser\?\.createdAt\}/);
  });
});
