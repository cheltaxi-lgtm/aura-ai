/**
 * P1 retention messaging: exclusive 7d/14d windows, episode + frequency cap.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { updateNotificationPrefs } from "@/lib/daily-reminder-service";
import { query } from "@/lib/db";
import { inactiveUserEmailHtml, inactiveUserEmailText } from "@/lib/email/templates";
import {
  resolveInactiveWinbackStage,
  runReengagementEmailBatch,
  sendInactiveUserEmails,
} from "@/lib/reengagement-email-service";
import { createUserProfileForAccount } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => true),
  };
});

import { sendEmail } from "@/lib/email/send";

const ROOT = path.resolve(__dirname, "../..");
const sendEmailMock = vi.mocked(sendEmail);

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function seedWinbackUser(opts: {
  inactiveDays: number;
  marketingConsent?: boolean;
  marketingEmail?: boolean;
  email?: string | null;
}) {
  const email =
    opts.email === null
      ? `wb-${Date.now()}-${Math.random().toString(16).slice(2)}@oauth.zovus.local`
      : (opts.email ?? `wb-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`);
  const account = await createUser(email, "hash", "Winback");
  const profile = await createUserProfileForAccount(account.id, {
    name: "Winback",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
  });
  if (opts.marketingConsent !== false) {
    await recordAccountLegalConsent(account.id, { marketingConsent: true });
  }
  await updateNotificationPrefs(profile.id, {
    marketingEmail: opts.marketingEmail !== false,
  });
  await query(`UPDATE user_accounts SET last_login_at = $2 WHERE id = $1`, [
    account.id,
    daysAgo(opts.inactiveDays),
  ]);
  return { account, profile, email };
}

describe("reengagement-winback (unit)", () => {
  it("classifies exclusive inactivity stages", () => {
    const now = new Date("2030-06-15T12:00:00.000Z");
    expect(resolveInactiveWinbackStage(new Date("2030-06-14T12:00:00.000Z"), now)).toBeNull();
    expect(resolveInactiveWinbackStage(new Date("2030-06-08T12:00:00.000Z"), now)).toBe(
      "inactive_7d"
    );
    expect(resolveInactiveWinbackStage(new Date("2030-06-02T11:59:00.000Z"), now)).toBe(
      "inactive_7d"
    );
    expect(resolveInactiveWinbackStage(new Date("2030-06-01T12:00:00.000Z"), now)).toBe(
      "inactive_14d"
    );
    expect(resolveInactiveWinbackStage(new Date("2030-05-01T12:00:00.000Z"), now)).toBe(
      "inactive_14d"
    );
  });

  it("7d and 14d copy are distinct and privacy-safe", () => {
    const seven = inactiveUserEmailHtml("Анна", 7, "https://zovus.ru");
    const fourteen = inactiveUserEmailHtml("Анна", 14, "https://zovus.ru");
    expect(seven).toMatch(/Давно не виделись/);
    expect(fourteen).toMatch(/Ваш Zovus остаётся с Вами/);
    expect(seven).not.toEqual(fourteen);
    expect(seven).not.toMatch(/операц|диагноз|долг/i);
    expect(fourteen).not.toMatch(/операц|диагноз|долг/i);
    expect(seven).not.toMatch(/\?daily=1/);
    expect(fourteen).not.toMatch(/\?daily=1/);
    expect(seven).toMatch(/https:\/\/zovus\.ru\/"/);
    expect(fourteen).toMatch(/https:\/\/zovus\.ru\/"/);
    expect(inactiveUserEmailText("Анна", 7, "https://zovus.ru")).not.toMatch(/\?daily=1/);
    expect(inactiveUserEmailText("Анна", 14, "https://zovus.ru")).toMatch(/https:\/\/zovus\.ru\/$/);
  });

  it("Daily Cards CTA stays on dailyCards=1; scheduler still hourly", () => {
    const daily = read("src/lib/email/templates.ts");
    const start = daily.indexOf("export function dailyReminderEmailHtml");
    const fn = daily.slice(start, start + 700);
    expect(fn).toMatch(/\?dailyCards=1/);
    expect(fn).not.toMatch(/\?daily=1/);
    const cron = read("proxmox-setup/install-crons.sh");
    expect(cron).toMatch(/cron-reengagement-emails\.sh/);
    expect(cron).toMatch(/5 \* \* \* \*/);
    const route = read("src/app/api/cron/reengagement-emails/route.ts");
    expect(route).toMatch(/hourMsk === 10/);
    expect(route).toMatch(/hourMsk === 19/);
  });
});

describe.skipIf(!hasTestDb)("reengagement-winback (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS reengagement_email_log (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template   TEXT NOT NULL,
        sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, template, sent_date)
      )
    `);
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue(true);
  });

  it("last_login 8d → inactive_7d only", async () => {
    await seedWinbackUser({ inactiveDays: 8 });
    const result = await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    expect(result.inactive7d).toBe(1);
    expect(result.inactive14d).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.template).toBe("inactive_7d");
  });

  it("last_login 15d → inactive_14d only", async () => {
    await seedWinbackUser({ inactiveDays: 15 });
    const result = await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    expect(result.inactive7d).toBe(0);
    expect(result.inactive14d).toBe(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.template).toBe("inactive_14d");
  });

  it("15d user never receives 7d + 14d in the same run", async () => {
    const { profile } = await seedWinbackUser({ inactiveDays: 15 });
    await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    const logs = await query<{ template: string }>(
      `SELECT template FROM reengagement_email_log
        WHERE user_id = $1 AND template IN ('inactive_7d','inactive_14d')`,
      [profile.id]
    );
    expect(logs.rows.map((r) => r.template)).toEqual(["inactive_14d"]);
  });

  it("inactive_7d already sent this episode is not resent", async () => {
    const { profile } = await seedWinbackUser({ inactiveDays: 8 });
    expect(await sendInactiveUserEmails(7)).toBe(1);
    sendEmailMock.mockClear();
    expect(await sendInactiveUserEmails(7)).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM reengagement_email_log
        WHERE user_id=$1 AND template='inactive_7d'`,
      [profile.id]
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  it("inactive_14d already sent this episode is not resent", async () => {
    await seedWinbackUser({ inactiveDays: 15 });
    expect(await sendInactiveUserEmails(14)).toBe(1);
    sendEmailMock.mockClear();
    expect(await sendInactiveUserEmails(14)).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("return resets episode so a later 7d window can send again", async () => {
    const { account, profile } = await seedWinbackUser({ inactiveDays: 8 });
    expect(await sendInactiveUserEmails(7)).toBe(1);
    await query(`UPDATE user_accounts SET last_login_at = NOW() WHERE id = $1`, [account.id]);
    await query(
      `UPDATE reengagement_email_log
          SET created_at = NOW() - INTERVAL '8 days',
              sent_date = (CURRENT_DATE - 8)
        WHERE user_id = $1 AND template = 'inactive_7d'`,
      [profile.id]
    );
    await query(`UPDATE user_accounts SET last_login_at = NOW() - INTERVAL '8 days' WHERE id = $1`, [
      account.id,
    ]);
    sendEmailMock.mockClear();
    expect(await sendInactiveUserEmails(7)).toBe(1);
  });

  it("rolling 7d cap blocks a second inactive win-back", async () => {
    const { account } = await seedWinbackUser({ inactiveDays: 8 });
    expect(await sendInactiveUserEmails(7)).toBe(1);
    await query(`UPDATE user_accounts SET last_login_at = NOW() - INTERVAL '15 days' WHERE id = $1`, [
      account.id,
    ]);
    sendEmailMock.mockClear();
    expect(await sendInactiveUserEmails(14)).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("marketing_email=false blocks inactive email", async () => {
    await seedWinbackUser({ inactiveDays: 8, marketingEmail: false });
    const result = await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    expect(result.inactive7d).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("synthetic / undeliverable email is not sent", async () => {
    await seedWinbackUser({ inactiveDays: 8, email: null });
    const result = await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    expect(result.inactive7d).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
