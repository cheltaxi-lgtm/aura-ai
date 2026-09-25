/**
 * P2.4B: daily-cards reminder delivery gated by explicit opt-in + P0 cooldown.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUser,
  setAccountDailyCardsReminder,
} from "@/lib/accounts";
import {
  DAILY_CARDS_REMINDER_CTA,
  DEFAULT_REMINDER_HOUR_MSK,
  getDailyReminderCandidates,
  parseNotificationPrefs,
  resolveDailyCardsReminderDelivery,
  sendDailyRemindersForHour,
  updateNotificationPrefs,
} from "@/lib/daily-reminder-service";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { query } from "@/lib/db";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { recordDailyReadingAnchor } from "@/lib/rate-limit-anchors";
import { productCalendarDate } from "@/lib/product-calendar";
import { createHistoryEntry, createUserProfileForAccount, recordTripletDrawAnchor } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { SAMPLE_SYMBOLS } from "./db/fixtures";

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => true),
  };
});

import { sendEmail } from "@/lib/email/send";
import { dailyReminderEmailHtml } from "@/lib/email/templates";
import { runReengagementEmailBatch } from "@/lib/reengagement-email-service";

const ROOT = path.resolve(__dirname, "../..");
const sendEmailMock = vi.mocked(sendEmail);

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("daily-cards-reminder-delivery (unit)", () => {
  it("adds a separately removable bonus only when it is requested", () => {
    const daily = dailyReminderEmailHtml("Анна", "https://zovus.ru", "https://zovus.ru/daily-off");
    expect(daily).not.toContain("Включите их в кабинете");
    expect(daily).not.toContain("Отключить бонусные напоминания");
    const combined = dailyReminderEmailHtml("Анна", "https://zovus.ru",
      "https://zovus.ru/daily-off", { amount: 3, claimable: true,
        unsubscribeUrl: "https://zovus.ru/bonus-off" });
    expect(combined).toContain("/?daily=1");
    expect(combined).toContain("utm_medium=email&utm_campaign=daily_reading");
    expect(combined).toContain("/cabinet#daily-bonus");
    expect(combined).toContain("https://zovus.ru/daily-off");
    expect(combined).toContain("https://zovus.ru/bonus-off");
    const later = dailyReminderEmailHtml("Анна", "https://zovus.ru",
      "https://zovus.ru/daily-off", { amount: 3, claimable: false,
        unsubscribeUrl: "https://zovus.ru/bonus-off" });
    expect(later).toContain("доступен каждые 24 часа");
    expect(later).not.toContain("бонус готов");
  });

  it("opt-in false + channel prefs true → no delivery", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: false,
        cooldownAllowed: true,
        dailyInApp: true,
        dailyEmail: true,
        dailyTelegram: true,
        hasEmail: true,
        hasTelegram: false,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: false, email: false, telegram: false });
  });

  it("opt-in true + email/in-app true → both allowed", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: true,
        dailyInApp: true,
        dailyEmail: true,
        dailyTelegram: true,
        hasEmail: true,
        hasTelegram: false,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: true, email: true, telegram: false });
  });

  it("telegram linked but dailyTelegram pref off → no telegram channel", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: true,
        dailyInApp: true,
        dailyEmail: true,
        dailyTelegram: false,
        hasEmail: true,
        hasTelegram: true,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: true, email: true, telegram: false });
  });

  it("telegram linked + dailyTelegram on → telegram allowed", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: true,
        dailyInApp: false,
        dailyEmail: false,
        dailyTelegram: true,
        hasEmail: false,
        hasTelegram: true,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: false, email: false, telegram: true });
  });

  it("channel pref false is respected", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: true,
        dailyInApp: false,
        dailyEmail: false,
        dailyTelegram: false,
        hasEmail: true,
        hasTelegram: false,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: false, email: false, telegram: false });
  });

  it("daily cooldown → no reminder", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: false,
        dailyInApp: true,
        dailyEmail: true,
        dailyTelegram: true,
        hasEmail: true,
        hasTelegram: false,
        alreadySentInApp: false,
        alreadySentEmail: false,
        alreadySentTelegram: false,
      })
    ).toEqual({ inApp: false, email: false, telegram: false });
  });

  it("already sent this window → no duplicate", () => {
    expect(
      resolveDailyCardsReminderDelivery({
        dailyCardsReminder: true,
        cooldownAllowed: true,
        dailyInApp: true,
        dailyEmail: true,
        dailyTelegram: true,
        hasEmail: true,
        hasTelegram: false,
        alreadySentInApp: true,
        alreadySentEmail: true,
        alreadySentTelegram: true,
      })
    ).toEqual({ inApp: false, email: false, telegram: false });
  });
});

describe("daily-cards-reminder-delivery (source)", () => {
  it("candidates require opt-in and canonical daily-reading availability", () => {
    const src = read("src/lib/daily-reminder-service.ts");
    expect(src).toMatch(/ua\.daily_cards_reminder = TRUE/);
    expect(src).toMatch(/isDailyReadingUsedToday/);
    expect(src).not.toMatch(/checkTripletCooldown/);
    expect(src).toMatch(/DAILY_CARDS_REMINDER_CTA/);
    expect(src).toMatch(/claimReminderSlot/);
    expect(src).toMatch(/ACCOUNT_DELIVERABLE_EMAIL_SQL/);
    expect(src).toMatch(/reminderUnsubscribeUrl/);
    expect(src).toMatch(/ON CONFLICT \(user_id, sent_date, channel\) DO NOTHING/);
    expect(src).not.toMatch(/idempotencyKey/);
    expect(src).not.toMatch(/toLocaleDateString/);
    expect(src).toMatch(/pref\.hour_msk < \$1/);
    expect(src).toMatch(/NOT EXISTS/);
    expect(DAILY_CARDS_REMINDER_CTA).toBe("/?daily=1");
    expect(DEFAULT_REMINDER_HOUR_MSK).toBe(9);
  });

  it("missing hour prefs default to 9:00 MSK, not 6:00", () => {
    expect(parseNotificationPrefs({}).reminderHourMsk).toBe(9);
    expect(parseNotificationPrefs({ dailyEmail: true }).reminderHourMsk).toBe(9);
    expect(parseNotificationPrefs({ reminderHourUtc: 6 }).reminderHourMsk).toBe(9);
    expect(parseNotificationPrefs({ reminderHourUtc: "6" }).reminderHourMsk).toBe(9);
    expect(parseNotificationPrefs({ reminderHourUtc: 21 }).reminderHourMsk).toBe(0);
    expect(parseNotificationPrefs({ reminderHourUtc: 0 }).reminderHourMsk).toBe(3);
    expect(parseNotificationPrefs({ reminderHourMsk: 7 }).reminderHourMsk).toBe(7);
    expect(parseNotificationPrefs({ reminderHourMsk: "11" }).reminderHourMsk).toBe(11);
    const src = read("src/lib/daily-reminder-service.ts");
    expect(src).toMatch(/make_interval\(hours =>/);
    expect(src).toMatch(/AT TIME ZONE 'UTC' AT TIME ZONE 'Europe\/Moscow'/);
    expect(src).not.toMatch(/mskOffsetHoursUtc|EXTRACT\(EPOCH FROM/);
  });

  it("cron auth is unchanged", () => {
    const cron = read("src/app/api/cron/daily-reading-remind/route.ts");
    expect(cron).toMatch(/isCronSecretValid/);
    expect(cron).toMatch(/requireAdmin/);
    expect(cron).toMatch(/sendDailyRemindersForHour/);
  });

  it("reminder CTA opens the single daily reading and keeps old links working", () => {
    const home = read("src/components/HomePage.tsx");
    expect(home).toMatch(/dailyCardsParam === "1"/);
    expect(home).toMatch(/setPendingDailySpreadId\(DEFAULT_SPREAD_ID\)/);
    expect(home).toMatch(/if \(isLoggedIn\) \{\s*openDailyReading\(\);/);
    expect(home).toMatch(/setDailyEnergyAutoOpen\(true\)/);
    expect(home).toMatch(/dailyParam === "1"/);
  });

  it("email template points at the canonical daily CTA", () => {
    const tpl = read("src/lib/email/templates.ts");
    const start = tpl.indexOf("export function dailyReminderEmailHtml");
    const fn = tpl.slice(start, start + 700);
    expect(tpl).toMatch(/DAILY_REMINDER_EMAIL_PATH\s*=\s*[\s\S]*?\?daily=1/);
    expect(fn).toContain("DAILY_REMINDER_EMAIL_PATH");
    expect(fn).not.toMatch(/\?dailyCards=1/);
  });
});

async function seedReminderUser(opts: {
  optIn: boolean;
  dailyEmail: boolean;
  dailyInApp: boolean;
  hourMsk?: number;
  email?: string;
}) {
  const email = opts.email ?? `remind-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const account = await createUser(email, "hash", "Напоминание");
  const profile = await createUserProfileForAccount(account.id, {
    name: "Напоминание",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
  });
  await setAccountDailyCardsReminder(account.id, opts.optIn);
  await updateNotificationPrefs(profile.id, {
    dailyEmail: opts.dailyEmail,
    dailyInApp: opts.dailyInApp,
    reminderHourMsk: opts.hourMsk ?? 9,
  });
  return { account, profile, email };
}

describe.skipIf(!hasTestDb)("daily-cards-reminder-delivery (db)", () => {
  installDbLifecycle();

  beforeEach(() => {
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue(true);
  });

  it("opt-in false + dailyEmail/dailyInApp true → 0 candidates / 0 delivery", async () => {
    const { profile } = await seedReminderUser({
      optIn: false,
      dailyEmail: true,
      dailyInApp: true,
    });
    const candidates = await getDailyReminderCandidates(9);
    expect(candidates.some((c) => c.userId === profile.id)).toBe(false);
    const result = await sendDailyRemindersForHour(9);
    expect(result).toEqual({ inApp: 0, email: 0, telegram: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    const notes = await query(`SELECT 1 FROM notifications WHERE user_id = $1`, [profile.id]);
    expect(notes.rows.length).toBe(0);
  });

  it("opt-in true + channels true + daily available → in-app and email", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    const cooldown = await checkTripletCooldown(profile.id);
    expect(cooldown.allowed).toBe(true);
    const result = await sendDailyRemindersForHour(9);
    expect(result.inApp).toBe(1);
    expect(result.email).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const notes = await query<{ data: { ctaPath?: string } }>(
      `SELECT data FROM notifications WHERE user_id = $1 AND type = 'daily_reading_reminder'`,
      [profile.id]
    );
    expect(notes.rows.length).toBe(1);
    expect(notes.rows[0]?.data?.ctaPath).toBe(DAILY_CARDS_REMINDER_CTA);
  });

  it("one daily email includes the opted-in claimable bonus and does not send a second bonus email", async () => {
    const { profile } = await seedReminderUser({ optIn: true, dailyEmail: true, dailyInApp: true });
    await updateNotificationPrefs(profile.id, { bonusEmail: true });
    const result = await sendDailyRemindersForHour(9);
    expect(result.email).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0]?.[0];
    expect(mail?.template).toBe("daily_reminder");
    expect(mail?.html).toContain("/cabinet#daily-bonus");
    expect(mail?.html).toContain("Отключить бонусные напоминания");
    expect(mail?.text).toContain("Отключить бонусные напоминания");
    const bonus = await runReengagementEmailBatch({ dailyBonus: true, inactive: false });
    expect(bonus.dailyBonus).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("mentions a later bonus without falsely saying it is ready", async () => {
    const { profile } = await seedReminderUser({ optIn: true, dailyEmail: true, dailyInApp: false });
    await updateNotificationPrefs(profile.id, { bonusEmail: true });
    await query("UPDATE users SET last_daily_bonus=NOW() WHERE id=$1", [profile.id]);
    const result = await sendDailyRemindersForHour(9);
    expect(result.email).toBe(1);
    const mail = sendEmailMock.mock.calls[0]?.[0];
    expect(mail?.html).toContain("доступен каждые 24 часа");
    expect(mail?.html).not.toContain("бонус готов");
    expect(mail?.text).toContain("доступен каждые 24 часа");
  });

  it("bonus cron does not preempt a later daily reminder hour", async () => {
    const { profile } = await seedReminderUser({ optIn: true, dailyEmail: true,
      dailyInApp: false, hourMsk: 21 });
    await updateNotificationPrefs(profile.id, { bonusEmail: true });
    const bonus = await runReengagementEmailBatch({ dailyBonus: true, inactive: false });
    expect(bonus.dailyBonus).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const daily = await sendDailyRemindersForHour(21);
    expect(daily.email).toBe(1);
    expect(sendEmailMock.mock.calls[0]?.[0].template).toBe("daily_reminder");
  });

  it("bonus reminder can send alone after the daily reading was already used", async () => {
    const { profile } = await seedReminderUser({ optIn: true, dailyEmail: true, dailyInApp: false });
    await updateNotificationPrefs(profile.id, { bonusEmail: true });
    await recordDailyReadingAnchor(profile.id, productCalendarDate(), "classic");
    const bonus = await runReengagementEmailBatch({ dailyBonus: true, inactive: false });
    expect(bonus.dailyBonus).toBe(1);
    expect(sendEmailMock.mock.calls[0]?.[0].template).toBe("daily_bonus");
  });

  it("channel pref false respected at send time", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: false,
      dailyInApp: false,
    });
    const candidates = await getDailyReminderCandidates(9);
    expect(candidates.some((c) => c.userId === profile.id)).toBe(false);
    const result = await sendDailyRemindersForHour(9);
    expect(result).toEqual({ inApp: 0, email: 0, telegram: 0 });
  });

  it("canonical daily reading already used → no reminder", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    await recordDailyReadingAnchor(profile.id, productCalendarDate(), "classic");
    const result = await sendDailyRemindersForHour(9);
    expect(result).toEqual({ inApp: 0, email: 0, telegram: 0 });
  });

  it("eligibility and send ledger use the same Moscow calendar date", () => {
    const service = read("src/lib/daily-reminder-service.ts");
    expect(service).toMatch(/const dailyDate = productCalendarDate\(\)/);
    expect(service).toMatch(/getDailyReminderCandidates\(hourMsk, dailyDate\)/);
    expect(service).toMatch(/isDailyReadingUsedToday\(user\.userId, dailyDate\)/);
    expect(service).toMatch(/claimReminderSlot\(user\.userId, "email", dailyDate\)/);
    expect(service).toMatch(/`daily_cards:\$\{dailyDate\}`/);
    expect(service).not.toMatch(/sent_date = CURRENT_DATE/);
  });

  it("legacy three-card daily does not block the canonical daily reminder", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    const cards = SAMPLE_SYMBOLS.map((s, position) => ({
      id: s.id,
      name: s.name,
      position,
      reversed: Boolean(s.reversed),
    }));
    await saveAuthenticatedDailyTriplet({
      userId: profile.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    const cooldown = await checkTripletCooldown(profile.id);
    expect(cooldown.allowed).toBe(false);
    const result = await sendDailyRemindersForHour(9);
    expect(result.inApp).toBe(1);
    expect(result.email).toBe(1);
  });

  it("ordinary triplet does not block reminder eligibility", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    await createHistoryEntry({
      userId: profile.id,
      characterName: "triplet",
      contextData: {
        type: "triplet",
        tarotCards: SAMPLE_SYMBOLS,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    const cooldown = await checkTripletCooldown(profile.id);
    expect(cooldown.allowed).toBe(true);
    const result = await sendDailyRemindersForHour(9);
    expect(result.inApp).toBe(1);
    expect(result.email).toBe(1);
  });

  it("cron retry does not duplicate in-app or email", async () => {
    await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    const first = await sendDailyRemindersForHour(9);
    expect(first).toEqual({ inApp: 1, email: 1, telegram: 0 });
    const second = await sendDailyRemindersForHour(9);
    expect(second).toEqual({ inApp: 0, email: 0, telegram: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("never-drawing user is reminded again on the next day", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    const first = await sendDailyRemindersForHour(9);
    expect(first).toEqual({ inApp: 1, email: 1, telegram: 0 });

    await query(
      `UPDATE daily_reminder_log
          SET sent_date = CURRENT_DATE - 1,
              created_at = NOW() - interval '1 day'
        WHERE user_id = $1`,
      [profile.id]
    );
    await query(
      `UPDATE proactive_contact_log
          SET contact_key = 'daily_cards:prior-day',
              created_at = ((date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow')
                - INTERVAL '1 hour') AT TIME ZONE 'Europe/Moscow')
        WHERE user_id = $1 AND campaign = 'daily_cards'`,
      [profile.id]
    );

    const second = await sendDailyRemindersForHour(9);
    expect(second).toEqual({ inApp: 1, email: 1, telegram: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("reminder repeats while the user has not drawn since the previous send", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    await recordTripletDrawAnchor(
      profile.id,
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    );
    const first = await sendDailyRemindersForHour(9);
    expect(first.inApp).toBe(1);

    await query(
      `UPDATE daily_reminder_log
          SET sent_date = CURRENT_DATE - 1,
              created_at = NOW() - interval '1 day'
        WHERE user_id = $1`,
      [profile.id]
    );
    await query(
      `UPDATE proactive_contact_log
          SET contact_key = 'daily_cards:prior-day',
              created_at = NOW() - INTERVAL '25 hours'
        WHERE user_id = $1 AND campaign = 'daily_cards'`,
      [profile.id]
    );

    const second = await sendDailyRemindersForHour(9);
    expect(second.inApp).toBe(1);
  });

  it("two authoritative reminder slots are not collapsed by generic notification dedup", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: false,
      dailyInApp: true,
    });
    const first = await sendDailyRemindersForHour(9);
    expect(first.inApp).toBe(1);

    await query(
      `UPDATE daily_reminder_log
          SET sent_date = CURRENT_DATE - 3,
              created_at = NOW() - interval '3 days'
        WHERE user_id = $1 AND channel = 'in_app'`,
      [profile.id]
    );
    await query(
      `UPDATE proactive_contact_log
          SET contact_key = 'daily_cards:prior-slot',
              created_at = NOW() - INTERVAL '3 days'
        WHERE user_id = $1 AND campaign = 'daily_cards'`,
      [profile.id]
    );
    await recordTripletDrawAnchor(
      profile.id,
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    );

    const second = await sendDailyRemindersForHour(9);
    expect(second.inApp).toBe(1);

    const notes = await query(
      `SELECT id FROM notifications
        WHERE user_id = $1 AND type = 'daily_reading_reminder'`,
      [profile.id]
    );
    expect(notes.rows).toHaveLength(2);

    const slots = await query<{ sent_date: string }>(
      `SELECT sent_date::text AS sent_date
         FROM daily_reminder_log
        WHERE user_id = $1 AND channel = 'in_app'
        ORDER BY sent_date`,
      [profile.id]
    );
    expect(slots.rows).toHaveLength(2);
    expect(slots.rows[0]?.sent_date).not.toBe(slots.rows[1]?.sent_date);
  });

  it("prefs without hour keys are scheduled at 9 MSK, not 6", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
    });
    await query(
      `UPDATE users
          SET notification_prefs = '{"dailyEmail": true, "dailyInApp": true}'::jsonb
        WHERE id = $1`,
      [profile.id]
    );
    const atSix = await getDailyReminderCandidates(6);
    const atNine = await getDailyReminderCandidates(9);
    expect(atSix.some((c) => c.userId === profile.id)).toBe(false);
    expect(atNine.some((c) => c.userId === profile.id)).toBe(true);
  });

  it("same-day catch-up after preferred hour, not before, and not twice", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
      hourMsk: 9,
    });
    expect((await getDailyReminderCandidates(8)).some((c) => c.userId === profile.id)).toBe(
      false
    );
    expect((await getDailyReminderCandidates(11)).some((c) => c.userId === profile.id)).toBe(
      true
    );

    const late = await sendDailyRemindersForHour(11);
    expect(late.inApp).toBe(1);
    expect(late.email).toBe(1);

    expect((await getDailyReminderCandidates(12)).some((c) => c.userId === profile.id)).toBe(
      false
    );
    const again = await sendDailyRemindersForHour(12);
    expect(again).toEqual({ inApp: 0, email: 0, telegram: 0 });
  });

  it("does not send a later hour's reminder early", async () => {
    const { profile } = await seedReminderUser({
      optIn: true,
      dailyEmail: true,
      dailyInApp: true,
      hourMsk: 21,
    });
    expect((await getDailyReminderCandidates(9)).some((c) => c.userId === profile.id)).toBe(
      false
    );
    const result = await sendDailyRemindersForHour(9);
    expect(result).toEqual({ inApp: 0, email: 0, telegram: 0 });
  });
});
