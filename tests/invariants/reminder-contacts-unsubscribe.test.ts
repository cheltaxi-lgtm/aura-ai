/**
 * Explicitly enabled reminders: collect a real mailbox (account / Yandex / VK / OAuth)
 * and allow signed one-click unsubscribe without touching another account.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUser,
  getAccountConsentSnapshot,
  getAccountDailyCardsReminder,
  setAccountDailyCardsReminder,
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
import {
  normalizeContactEmail,
  removeContactEmail,
  requestContactEmailVerification,
  verifyContactEmail,
} from "@/lib/contact-email";
import { getAccountDeliverableEmail } from "@/lib/reminder-contacts";
import { getRuneSettings } from "@/lib/rune-settings";
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
  await setAccountDailyCardsReminder(account.id, true);
  await setAccountMarketingConsent(account.id, true);
  return { account, profile };
}

async function insertOAuthEmail(
  accountId: string,
  provider: "vk" | "yandex" | "mailru",
  providerEmail: string,
  verified = false
) {
  await query(
    `INSERT INTO user_oauth_identities
       (user_account_id, provider, provider_user_id, provider_email, provider_email_verified)
     VALUES ($1, $2, $3, $4, $5)`,
    [accountId, provider, `${provider}-${accountId.slice(0, 8)}`, providerEmail, verified]
  );
}

describe("reminder-contacts-unsubscribe (unit)", () => {
  it("accepts only deliverable contact addresses", () => {
    expect(normalizeContactEmail("  Person@Example.com  ")).toBe("person@example.com");
    expect(normalizeContactEmail("tg_1@telegram.zovus.local")).toBeNull();
    expect(normalizeContactEmail("bad-address")).toBeNull();
  });

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
    expect(src).toMatch(/contact_email_verified_at IS NOT NULL/);
    expect(src).toMatch(/email_verified_at IS NOT NULL OR ua\.bonus_email_verification_required=FALSE/);
    expect(src).toMatch(/oi\.provider_email_verified = TRUE/);
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

  it("transactional senders route through deliverable email, not raw ua.email", () => {
    for (const rel of [
      "src/lib/async-report-notify.ts",
      "src/lib/joint-reading-service.ts",
      "src/lib/email/pro-notify.ts",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/ACCOUNT_DELIVERABLE_EMAIL_SQL/);
      expect(src).toMatch(/pickDeliverableEmail/);
      expect(src).not.toMatch(/SELECT u\.name, ua\.email/);
    }
  });

  it("joint-reading milestones are transactional (not gated by daily prefs)", () => {
    const src = read("src/lib/joint-reading-service.ts");
    expect(src).not.toMatch(/getNotificationPrefs/);
    expect(src).not.toMatch(/prefs\.dailyInApp|prefs\.dailyEmail/);
  });

  it("daily telegram channel has its own pref, cabinet toggle and PATCH field", () => {
    const svc = read("src/lib/daily-reminder-service.ts");
    expect(svc).toMatch(/dailyTelegram: o\.dailyTelegram === true/);
    expect(svc).toMatch(/input\.dailyTelegram === true && input\.hasTelegram/);
    const route = read("src/app/api/profile/notifications/route.ts");
    expect(route).toMatch(/patch\.dailyTelegram = body\.dailyTelegram/);
    const cabinet = read("src/components/cabinet/CabinetDailyNotifications.tsx");
    expect(cabinet).toMatch(/dailyTelegram/);
    const botReminder = read("telegram-bot/src/http/reminder.ts");
    expect(botReminder).toMatch(/unsubscribed_at/);
    const botRepos = read("telegram-bot/src/db/repos.ts");
    expect(botRepos).toMatch(/zovus_user_id IS NULL OR zovus_user_id = ''/);
  });
});

describe.skipIf(!hasTestDb)("reminder-contacts-unsubscribe (db)", () => {
  installDbLifecycle();

  beforeEach(() => {
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue(true);
  });

  it("createUser defaults daily reminder and marketing consent OFF", async () => {
    const account = await createUser(
      `def-off-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      "hash",
      "Контакт"
    );
    expect(await getAccountDailyCardsReminder(account.id)).toBe(false);
    expect((await getAccountConsentSnapshot(account.id))?.marketingConsent).toBe(false);
  });

  it("unverified VK provider mailbox is not used for private reminders", async () => {
    const { account, profile } = await seedProfile(
      `vk_${Date.now()}@oauth.zovus.local`
    );
    const vkEmail = `vk-real-${Date.now()}@mail.ru`;
    await insertOAuthEmail(account.id, "vk", vkEmail);

    const candidates = await getDailyReminderCandidates(9);
    const mine = candidates.find((c) => c.userId === profile.id);
    expect(mine?.email).toBeNull();

    const result = await sendDailyRemindersForHour(9);
    expect(result.email).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("Yandex provider_email wins over VK when account email is synthetic", async () => {
    const { account, profile } = await seedProfile(
      `ya_${Date.now()}@oauth.zovus.local`
    );
    await insertOAuthEmail(account.id, "vk", `vk-second-${Date.now()}@mail.ru`);
    const yandexEmail = `ya-real-${Date.now()}@yandex.ru`;
    await insertOAuthEmail(account.id, "yandex", yandexEmail, true);

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

  it("verifies a Telegram account contact and enables only its requested daily reminder", async () => {
    vi.stubEnv("AUTH_SECRET", "test-contact-email-secret-long-enough-for-hmac");
    try {
      const account = await createUser(`tg_${Date.now()}@telegram.zovus.local`, "hash", "Контакт");
      const profile = await createUserProfileForAccount(account.id, {
        name: "Контакт", gender: "female", birthDate: "1990-01-15", zodiac: "Козерог",
      });
      const email = `contact-${Date.now()}@example.com`;
      expect(await getAccountDeliverableEmail(account.id)).toBeNull();
      expect(await requestContactEmailVerification({ accountId: account.id, email, dailyReminder: true })).toBe("sent");
      expect(await getAccountDeliverableEmail(account.id)).toBeNull();
      const text = sendEmailMock.mock.calls[0]?.[0]?.text ?? "";
      const token = text.match(/#token=([^\s]+)/)?.[1];
      expect(token).toBeTruthy();
      const other = await createUser(`other-${Date.now()}@example.com`, "hash", "Другой");
      await expect(verifyContactEmail(other.id, decodeURIComponent(token!))).rejects.toThrow();
      expect(await verifyContactEmail(account.id, decodeURIComponent(token!))).toEqual({ dailyCardsReminder: true });
      expect(await getAccountDeliverableEmail(account.id)).toBe(email);
      expect(await getAccountDailyCardsReminder(account.id)).toBe(true);
      const candidates = await getDailyReminderCandidates(9);
      expect(candidates.find((candidate) => candidate.userId === profile.id)?.email).toBe(email);
      await expect(verifyContactEmail(account.id, decodeURIComponent(token!))).rejects.toThrow();
      await expect(createUser(email, "hash", "Чужой")).rejects.toThrow();

      const replacement = `replacement-${Date.now()}@example.com`;
      expect(await requestContactEmailVerification({
        accountId: account.id, email: replacement, dailyReminder: true,
      })).toBe("sent");
      const nextText = sendEmailMock.mock.calls[1]?.[0]?.text ?? "";
      const nextToken = nextText.match(/#token=([^\s]+)/)?.[1];
      expect(nextToken).toBeTruthy();
      expect(await verifyContactEmail(account.id, decodeURIComponent(nextToken!))).toEqual({ dailyCardsReminder: true });
      expect(await getAccountDeliverableEmail(account.id)).toBe(replacement);
      await removeContactEmail(account.id);
      expect(await getAccountDeliverableEmail(account.id)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the same verified signup mailbox also completes starter email verification", async () => {
    vi.stubEnv("AUTH_SECRET", "test-contact-email-secret-long-enough-for-hmac");
    try {
      const email = `new-signup-${Date.now()}@example.com`;
      const starterRunes = (await getRuneSettings()).starterRunes;
      const account = await createUser(email, "hash", "Клиент");
      await query(
        "UPDATE user_accounts SET bonus_email_verification_required=TRUE WHERE id=$1",
        [account.id]
      );
      const profile = await createUserProfileForAccount(account.id, {
        name: "Клиент", gender: "female", birthDate: "1990-01-15", zodiac: "Козерог",
      });
      const starterState = async () => query<{
        rune_balance: number;
        starter_runes_granted: boolean;
        starter_count: string;
      }>(`SELECT u.rune_balance, u.starter_runes_granted,
          (SELECT COUNT(*)::text FROM rune_transactions rt
           WHERE rt.user_id=u.id AND rt.description LIKE 'Стартовый пакет%') AS starter_count
         FROM users u WHERE u.id=$1`, [profile.id]);
      expect((await starterState()).rows[0]).toMatchObject({
        rune_balance: 0, starter_runes_granted: false, starter_count: "0",
      });
      expect(await getAccountDeliverableEmail(account.id)).toBeNull();
      expect(await requestContactEmailVerification({
        accountId: account.id, email, dailyReminder: false,
      })).toBe("sent");
      const token = (sendEmailMock.mock.calls[0]?.[0]?.text ?? "")
        .match(/#token=([^\s]+)/)?.[1];
      expect(token).toBeTruthy();
      await verifyContactEmail(account.id, decodeURIComponent(token!));
      const verified = await query<{
        bonus_email_verification_required: boolean;
        email_verified_at: Date | null;
      }>("SELECT bonus_email_verification_required,email_verified_at FROM user_accounts WHERE id=$1", [account.id]);
      expect(verified.rows[0]?.bonus_email_verification_required).toBe(false);
      expect(verified.rows[0]?.email_verified_at).not.toBeNull();
      expect(await getAccountDeliverableEmail(account.id)).toBe(email);
      expect((await starterState()).rows[0]).toMatchObject({
        rune_balance: starterRunes, starter_runes_granted: true, starter_count: "1",
      });
      await expect(verifyContactEmail(account.id, decodeURIComponent(token!))).rejects.toThrow();
      expect((await starterState()).rows[0]).toMatchObject({
        rune_balance: starterRunes, starter_runes_granted: true, starter_count: "1",
      });
    } finally {
      vi.unstubAllEnvs();
    }
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
