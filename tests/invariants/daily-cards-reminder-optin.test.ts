/**
 * P2.4A: explicit authenticated opt-in for future daily-cards reminders.
 * Storage is server-authoritative; no email/push delivery in this change.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createUser,
  getAccountDailyCardsReminder,
  setAccountDailyCardsReminder,
} from "@/lib/accounts";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("daily-cards-reminder-optin (source)", () => {
  it("anonymous cannot read/write — route requires user auth", () => {
    const route = read("src/app/api/auth/daily-cards-reminder/route.ts");
    expect(route).toMatch(/requireUserAuth/);
    expect(route).toMatch(/status: 401/);
    expect(route).toMatch(/export async function GET/);
    expect(route).toMatch(/export async function PATCH/);
    expect(route).toMatch(/export async function POST/);
    expect(route).toMatch(/setAccountDailyCardsReminder\(auth\.sub/);
    expect(route).toMatch(/getAccountDailyCardsReminder\(auth\.sub/);
  });

  it("Personal Zovus toggle is server-backed, no localStorage/permission", () => {
    const home = read("src/components/editorial/PersonalZovusHome.tsx");
    expect(home).toMatch(/Напоминать о 3 картах дня/);
    expect(home).toMatch(/\/api\/auth\/daily-cards-reminder/);
    expect(home).toMatch(/trackReminderOpt/);
    expect(home).not.toMatch(/localStorage/);
    expect(home).not.toMatch(/Notification\.requestPermission|requestPermission/);
    expect(home).not.toMatch(/serviceWorker|PushManager|Capacitor/);
  });

  it("guest homepage does not show the reminder toggle", () => {
    const landing = read("src/components/AuraSellingLanding.tsx");
    expect(landing).not.toMatch(/Напоминать о 3 картах дня/);
    expect(landing).not.toMatch(/daily-cards-reminder/);
  });

  it("analytics payload is product/source/state only, no PII", () => {
    const src = read("src/lib/seo/product-funnel.ts");
    expect(src).toMatch(/reachGoal\(\s*enabled \? ["']reminder_opt_in["'] : ["']reminder_opt_out["']/);
    const fnStart = src.indexOf("function trackReminderOpt");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf("\nexport function inferProductFunnelFromPath", fnStart);
    const fn = src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 280);
    expect(fn).toMatch(/product:\s*["']tarot["']/);
    expect(fn).toMatch(/source:\s*["']personal_zovus["']/);
    expect(fn).toMatch(/state:\s*["']daily_cards["']/);
    expect(fn).not.toMatch(/userId|email|createdAt|birthDate|sessionId|artifact/i);
  });

  it("registration and daily draw do not auto-enable the preference", () => {
    const register = read("src/app/api/auth/user/register/route.ts");
    expect(register).not.toMatch(/daily_cards_reminder\s*=\s*TRUE/i);
    expect(register).not.toMatch(/setAccountDailyCardsReminder\([^)]*true/i);
    const daily = read("src/lib/daily-triplet-save.ts");
    expect(daily).not.toMatch(/daily_cards_reminder/);
    expect(daily).not.toMatch(/setAccountDailyCardsReminder/);
    const oauth = read("src/lib/oauth/finish.ts");
    expect(oauth).not.toMatch(/daily_cards_reminder/);
  });

  it("does not wire email/push delivery to the new opt-in", () => {
    const reminder = read("src/lib/daily-reminder-service.ts");
    expect(reminder).not.toMatch(/daily_cards_reminder/);
    expect(reminder).not.toMatch(/dailyCardsReminder/);
  });

  it("schema default is OFF", () => {
    const schema = read("src/lib/schema.sql");
    expect(schema).toMatch(
      /daily_cards_reminder BOOLEAN NOT NULL DEFAULT FALSE/
    );
    const mig = read("scripts/migrations/129_migrate_daily_cards_reminder.sql");
    expect(mig).toMatch(/DEFAULT FALSE/);
  });
});

describe.skipIf(!hasTestDb)("daily-cards-reminder-optin (db)", () => {
  installDbLifecycle();

  it("default OFF; owner can enable/disable; refresh preserves server-side", async () => {
    const account = await createUser(
      `reminder-optin-${Date.now()}@example.com`,
      "hash",
      "Тест"
    );
    expect(await getAccountDailyCardsReminder(account.id)).toBe(false);

    expect(await setAccountDailyCardsReminder(account.id, true)).toBe(true);
    expect(await getAccountDailyCardsReminder(account.id)).toBe(true);

    expect(await setAccountDailyCardsReminder(account.id, false)).toBe(false);
    expect(await getAccountDailyCardsReminder(account.id)).toBe(false);
  });
});
