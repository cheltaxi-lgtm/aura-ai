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
  getDailyReminderCandidates,
  resolveDailyCardsReminderDelivery,
  sendDailyRemindersForHour,
  updateNotificationPrefs,
} from "@/lib/daily-reminder-service";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { query } from "@/lib/db";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
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

const ROOT = path.resolve(__dirname, "../..");
const sendEmailMock = vi.mocked(sendEmail);

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("daily-cards-reminder-delivery (unit)", () => {
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
  it("candidates require opt-in and reuse P0 cooldown, not daily_readings", () => {
    const src = read("src/lib/daily-reminder-service.ts");
    expect(src).toMatch(/ua\.daily_cards_reminder = TRUE/);
    expect(src).toMatch(/checkTripletCooldown/);
    expect(src).not.toMatch(/daily_readings/);
    expect(src).toMatch(/DAILY_CARDS_REMINDER_CTA/);
    expect(src).toMatch(/claimReminderSlot/);
    expect(src).toMatch(/ACCOUNT_DELIVERABLE_EMAIL_SQL/);
    expect(src).toMatch(/reminderUnsubscribeUrl/);
    expect(src).toMatch(/ON CONFLICT \(user_id, sent_date, channel\) DO NOTHING/);
    expect(src).not.toMatch(/idempotencyKey/);
    expect(src).not.toMatch(/toLocaleDateString/);
    expect(DAILY_CARDS_REMINDER_CTA).toBe("/?dailyCards=1");
  });

  it("cron auth is unchanged", () => {
    const cron = read("src/app/api/cron/daily-reading-remind/route.ts");
    expect(cron).toMatch(/isCronSecretValid/);
    expect(cron).toMatch(/requireAdmin/);
    expect(cron).toMatch(/sendDailyRemindersForHour/);
  });

  it("reminder CTA opens daily 3-cards flow without guest redraw", () => {
    const home = read("src/components/HomePage.tsx");
    expect(home).toMatch(/dailyCardsParam === "1"/);
    expect(home).toMatch(/setPendingDailyCardsOpen\(true\)/);
    expect(home).toMatch(/void handleNewReading\(\)/);
    const consume = home.slice(
      home.indexOf("Reminder CTA /?dailyCards=1"),
      home.indexOf("Reminder CTA /?dailyCards=1") + 900
    );
    expect(consume).toMatch(/handleNewReading/);
    expect(consume).not.toMatch(/drawSpread/);
    expect(home).toMatch(/dailyParam === "1"/);
  });

  it("email template points at dailyCards CTA", () => {
    const tpl = read("src/lib/email/templates.ts");
    const start = tpl.indexOf("export function dailyReminderEmailHtml");
    const fn = tpl.slice(start, start + 700);
    expect(fn).toMatch(/\?dailyCards=1/);
    expect(fn).not.toMatch(/\?daily=1/);
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

  it("daily cooldown → no reminder", async () => {
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
    expect(result).toEqual({ inApp: 0, email: 0, telegram: 0 });
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
});
