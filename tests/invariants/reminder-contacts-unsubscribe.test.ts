/**
 * Default-on reminders: collect a real mailbox (account / Yandex / VK / OAuth)
 * and allow signed one-click unsubscribe without touching another account.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUser,
  getAccountConsentSnapshot,
  getAccountDailyCardsReminder,
  setAccountMarketingConsent,
} from "@/lib/accounts";
import {
  getDailyReminderCandidates,
  sendDailyRemindersForHour,
  updateNotificationPrefs,
} from "@/lib/daily-reminder-service";
import { query } from "@/lib/db";
import { pickDeliverableEmail } from "@/lib/email/mail-config";
import { runReengagementEmailBatch } from "@/lib/reengagement-email-service";
import {
  applyReminderUnsubscribe,
  signReminderUnsubscribeToken,
  verifyReminderUnsubscribeToken,
} from "@/lib/reminder-unsubscribe";
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

async function seedProfile(email: string) {
  const account = await createUser(email, "hash", "Контакт");
  const profile = await createUserProfileForAccount(account.id, {
    name: "Контакт",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
  });
  await updateNotificationPrefs(profile.id, {
    dailyEmail: true,
    dailyInApp: true,
    reminderHourMsk: 9,
    marketingEmail: true,
  });
  return { account, profile };
}

async function insertOAuthEmail(
  accountId: string,
  provider: "vk" | "yandex" | "mailru",
  providerEmail: string
) {
  await query(
    `INSERT INTO user_oauth_identities
       (user_account_id, provider, provider_user_id, provider_email, provider_email_verified)
     VALUES ($1, $2, $3, $4, FALSE)`,
    [accountId, provider, `${provider}-${accountId.slice(0, 8)}`, providerEmail]
  );
}

describe("reminder-contacts-unsubscribe (unit)", () => {
  it("skips synthetic mailboxes and keeps the first real one", () => {
    expect(pickDeliverableEmail("vk_1@oauth.zovus.local", "anna@yandex.ru")).toBe(
      "anna@yandex.ru"
    );
    expect(pickDeliverableEmail("tg_1@telegram.zovus.local")).toBeNull();
    expect(pickDeliverableEmail("  User@Mail.Ru  ")).toBe("user@mail.ru");
    expect(pickDeliverableEmail(null, undefined, "")).toBeNull();
  });

  it("SQL prefers account email, then Yandex, then VK", () => {
    const src = read("src/lib/reminder-contacts.ts");
    expect(src).toMatch(/NOT ILIKE '%@oauth\.zovus\.local'/);
    expect(src).toMatch(/NOT ILIKE '%@telegram\.zovus\.local'/);
    expect(src).toMatch(/WHEN 'yandex' THEN 0 WHEN 'vk' THEN 1/);
    expect(src).toMatch(/user_oauth_identities/);
  });

  it("unsubscribe token is account+topic scoped", () => {
    const src = read("src/lib/reminder-unsubscribe.ts");
    expect(src).toMatch(/purpose: "reminder_unsub"/);
    expect(src).toMatch(/setAccountDailyCardsReminder\(accountId, false\)/);
    expect(src).toMatch(/setAccountMarketingConsent\(accountId, false\)/);
    const route = read("src/app/api/notifications/unsubscribe/route.ts");
    expect(route).toMatch(/verifyReminderUnsubscribeToken/);
    expect(route).toMatch(/applyReminderUnsubscribe\(parsed\.accountId, parsed\.topic\)/);
    expect(route).not.toMatch(/localStorage/);
  });

  it("OAuth still asks VK and Yandex for email", () => {
    expect(read("src/lib/oauth/providers/vk.ts")).toMatch(/scope:\s*["']email["']/);
    expect(read("src/lib/oauth/providers/yandex.ts")).toMatch(/login:email/);
  });
});

describe.skipIf(!hasTestDb)("reminder-contacts-unsubscribe (db)", () => {
  installDbLifecycle();

  beforeEach(() => {
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue(true);
  });

  it("createUser defaults daily reminder and marketing consent ON", async () => {
    const { account } = await seedProfile(
      `def-on-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
    );
    expect(await getAccountDailyCardsReminder(account.id)).toBe(true);
    expect((await getAccountConsentSnapshot(account.id))?.marketingConsent).toBe(true);
  });

  it("synthetic account email is not mailed; VK provider_email is", async () => {
    const { account, profile } = await seedProfile(
      `vk_${Date.now()}@oauth.zovus.local`
    );
    const vkEmail = `vk-real-${Date.now()}@mail.ru`;
    await insertOAuthEmail(account.id, "vk", vkEmail);

    const candidates = await getDailyReminderCandidates(9);
    const mine = candidates.find((c) => c.userId === profile.id);
    expect(mine?.email).toBe(vkEmail.toLowerCase());

    const result = await sendDailyRemindersForHour(9);
    expect(result.email).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.to).toBe(vkEmail.toLowerCase());
  });

  it("Yandex provider_email wins over VK when account email is synthetic", async () => {
    const { account, profile } = await seedProfile(
      `ya_${Date.now()}@oauth.zovus.local`
    );
    await insertOAuthEmail(account.id, "vk", `vk-second-${Date.now()}@mail.ru`);
    const yandexEmail = `ya-real-${Date.now()}@yandex.ru`;
    await insertOAuthEmail(account.id, "yandex", yandexEmail);

    const candidates = await getDailyReminderCandidates(9);
    const mine = candidates.find((c) => c.userId === profile.id);
    expect(mine?.email).toBe(yandexEmail.toLowerCase());
  });

  it("synthetic mailbox without provider_email is not emailed", async () => {
    const { profile } = await seedProfile(`tg_${Date.now()}@telegram.zovus.local`);
    const candidates = await getDailyReminderCandidates(9);
    const mine = candidates.find((c) => c.userId === profile.id);
    expect(mine?.email).toBeNull();
    const result = await sendDailyRemindersForHour(9);
    expect(result.email).toBe(0);
    expect(result.inApp).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("unsubscribe token cannot disable another account", async () => {
    const a = await seedProfile(`unsub-a-${Date.now()}@example.com`);
    const b = await seedProfile(`unsub-b-${Date.now()}@example.com`);
    const token = await signReminderUnsubscribeToken(a.account.id, "daily_cards");
    const parsed = await verifyReminderUnsubscribeToken(token);
    expect(parsed).toEqual({ accountId: a.account.id, topic: "daily_cards" });
    await applyReminderUnsubscribe(parsed!.accountId, parsed!.topic);
    expect(await getAccountDailyCardsReminder(a.account.id)).toBe(false);
    expect(await getAccountDailyCardsReminder(b.account.id)).toBe(true);
  });

  it("marketing unsubscribe stops win-back email", async () => {
    const { account } = await seedProfile(`wb-unsub-${Date.now()}@example.com`);
    await query(`UPDATE user_accounts SET last_login_at = $2 WHERE id = $1`, [
      account.id,
      daysAgo(8),
    ]);
    await applyReminderUnsubscribe(account.id, "marketing");
    expect((await getAccountConsentSnapshot(account.id))?.marketingConsent).toBe(false);
    const result = await runReengagementEmailBatch({ dailyBonus: false, inactive: true });
    expect(result.inactive7d).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("turning marketing consent off does not flip another user", async () => {
    const a = await seedProfile(`iso-a-${Date.now()}@example.com`);
    const b = await seedProfile(`iso-b-${Date.now()}@example.com`);
    await setAccountMarketingConsent(a.account.id, false);
    expect((await getAccountConsentSnapshot(b.account.id))?.marketingConsent).toBe(true);
    expect(await getAccountDailyCardsReminder(b.account.id)).toBe(true);
  });
});
