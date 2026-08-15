import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEventReminderPayload } from "@/lib/event-reminder-copy";
import { query } from "@/lib/db";
import { recordInitialMemoryChoice, updateMemoryPreferences } from "@/lib/memory/preferences";
import { getGlobalUpcomingEvents, upsertFact } from "@/lib/memory/user-facts";
import {
  countUnreadNotifications,
  createNotification,
  getUnreadNotifications,
  markNotificationsRead,
} from "@/lib/ritual-service";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const FACT_TEXT = "Клиент идёт на операцию на сердце 2030-01-20";
const NORMAL_FACT = "Выпускной сына Артёма 2030-06-15";

function upcomingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

describe("notifications-hardening (source)", () => {
  it("API is session-scoped and returns authoritative unreadCount", () => {
    const route = read("src/app/api/notifications/route.ts");
    expect(route).toMatch(/requireProfileUserId/);
    expect(route).toMatch(/countUnreadNotifications/);
    expect(route).toMatch(/unreadCount/);
    expect(route).toMatch(/items/);
    expect(route).not.toMatch(/request\.json\(\)/);
  });

  it("Bell badge uses unreadCount, not items.length", () => {
    const bell = read("src/components/NotificationBell.tsx");
    const header = read("src/components/AppTopHeader.tsx");
    expect(bell).toMatch(/unreadCount/);
    expect(bell).toMatch(/const count = unreadCount/);
    expect(bell).not.toMatch(/const count = items\.length/);
    expect(bell).toMatch(/NOTIFICATION_COUNT_EVENT[\s\S]{0,80}nextUnread/);
    expect(bell).not.toMatch(/NOTIFICATION_COUNT_EVENT[\s\S]{0,80}next\.length/);
    expect(header).toMatch(/NOTIFICATION_COUNT_EVENT/);
    expect(header).toMatch(/setNotificationCount\(next\)/);
    expect(header).not.toMatch(/items\.length/);
  });

  it("createNotification is idempotent on (user_id, idempotency_key)", () => {
    const src = read("src/lib/ritual-service.ts");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/ON CONFLICT \(user_id, idempotency_key\)/);
    expect(src).toMatch(/DO NOTHING/);
  });

  it("sensitive event reminders never copy fact text; CTA is /cabinet", () => {
    const cron = read("src/app/api/cron/event-reminders/route.ts");
    const copy = read("src/lib/event-reminder-copy.ts");
    expect(cron).toMatch(/buildEventReminderPayload/);
    expect(copy).toMatch(/isSensitiveFact/);
    expect(copy).toMatch(/У Вас скоро важное событие/);
    expect(copy).toMatch(/"\/cabinet"/);
    expect(copy).toMatch(/event_reminder:\$\{ev\.factId\}:\$\{ev\.eventDate\}/);
  });

  it("Daily Cards slot and opt-in remain authoritative", () => {
    const src = read("src/lib/daily-reminder-service.ts");
    expect(src).toMatch(/ua\.daily_cards_reminder = TRUE/);
    expect(src).toMatch(/claimReminderSlot/);
    expect(src).toMatch(/ON CONFLICT \(user_id, sent_date, channel\) DO NOTHING/);
    expect(src).not.toMatch(/idempotencyKey:\s*`daily_cards:/);
    expect(src).not.toMatch(/toLocaleDateString/);
    expect(src).toMatch(/checkTripletCooldown/);
  });

  it("report-ready ledger UNIQUE(job_id, channel) is unchanged", () => {
    const src = read("src/lib/async-report-notify.ts");
    expect(src).toMatch(/ON CONFLICT \(job_id, channel\) DO NOTHING/);
    expect(src).toMatch(/data->>'reportJobId'/);
    expect(src).toMatch(/idempotencyKey: `report_ready:\$\{row\.job_id\}`/);
    const mig = read("scripts/migrations/118_migrate_report_ready_deliveries.sql");
    expect(mig).toMatch(/UNIQUE\s*\(\s*job_id,\s*channel\s*\)/);
  });

  it("producer keys identify a concrete event or artifact", () => {
    expect(read("src/lib/event-reminder-copy.ts")).toMatch(
      /idempotencyKey: `event_reminder:\$\{ev\.factId\}:\$\{ev\.eventDate\}`/
    );
    expect(read("src/lib/async-report-notify.ts")).toMatch(
      /idempotencyKey: `report_ready:\$\{row\.job_id\}`/
    );
    expect(read("src/app/api/ritual/remind/route.ts")).toMatch(
      /idempotencyKey: `ritual_reminder:\$\{item\.id\}`/
    );
    const joint = read("src/lib/joint-reading-service.ts");
    expect(joint).toMatch(/idempotencyKey: `\$\{params\.type\}:\$\{params\.token\}`/);
    expect(joint).toMatch(/idempotencyKey: `joint_reading_expiring:\$\{row\.token\}`/);
    expect(read("src/app/api/cron/natal-transits/route.ts")).toMatch(
      /idempotencyKey: `natal_transit:\$\{row\.user_id\}:\$\{deliveryKey\}`/
    );
    expect(read("src/lib/support-service.ts")).toMatch(
      /idempotencyKey: `support_reply:\$\{ticket\.id\}:\$\{message\.id\}`/
    );
    expect(read("src/lib/daily-reminder-service.ts")).not.toMatch(/idempotencyKey/);
  });

  it("API consumers keep backward-compatible notifications + items + unreadCount", () => {
    const route = read("src/app/api/notifications/route.ts");
    const bell = read("src/components/NotificationBell.tsx");
    expect(route).toMatch(/notifications:\s*items/);
    expect(route).toMatch(/items,/);
    expect(route).toMatch(/unreadCount/);
    expect(bell).toMatch(/json\.items/);
    expect(bell).toMatch(/json\.notifications/);
    expect(bell).toMatch(/json\.unreadCount/);
  });

  it("memory consent gates for event reminders are unchanged", () => {
    const facts = read("src/lib/memory/user-facts.ts");
    expect(facts).toMatch(/p\.memory_enabled = TRUE/);
    expect(facts).toMatch(/p\.event_reminders_enabled = TRUE/);
  });
});

describe("event-reminder privacy copy", () => {
  it("sensitive fact text is absent from title/body/data/cta", () => {
    const date = "2030-01-20";
    const payload = buildEventReminderPayload({
      factId: "00000000-0000-0000-0000-0000000000aa",
      userId: "00000000-0000-0000-0000-0000000000bb",
      fact: FACT_TEXT,
      eventDate: date,
      sourceCharacter: "tarolog",
      category: "health",
      predicateKey: "health.procedure",
      sensitivity: "sensitive",
    });
    const blob = JSON.stringify(payload);
    expect(payload.title).toBe("У Вас скоро важное событие");
    expect(payload.ctaPath).toBe("/cabinet");
    expect(blob).not.toContain(FACT_TEXT);
    expect(blob).not.toContain("операц");
    expect(blob).not.toContain("сердц");
    expect(payload.data).not.toHaveProperty("sourceCharacter");
    expect(payload.body).not.toMatch(/упоминали/);
  });

  it("normal event keeps personalized topic and ask CTA", () => {
    const date = "2030-06-15";
    const payload = buildEventReminderPayload({
      factId: "00000000-0000-0000-0000-0000000000cc",
      userId: "00000000-0000-0000-0000-0000000000dd",
      fact: NORMAL_FACT,
      eventDate: date,
      sourceCharacter: "tarolog",
      category: "event",
      predicateKey: "event.upcoming",
      sensitivity: "normal",
    });
    expect(payload.title).toMatch(/Важный день/);
    expect(payload.body).toMatch(/Артём|выпускн/i);
    expect(payload.ctaPath).toMatch(/\?ask=/);
    expect(payload.ctaLabel).toBe("Получить расклад");
    expect(payload.data.sourceCharacter).toBe("tarolog");
  });
});

describe.skipIf(!hasTestDb)("notifications-hardening (db)", () => {
  installDbLifecycle();

  it("user A cannot read or mark-as-read user B notifications", async () => {
    const a = await createTestUser({ name: "Notif A" });
    const b = await createTestUser({ name: "Notif B" });
    await createNotification({
      userId: b.id,
      type: "support_reply",
      title: "secret-b",
      body: "only for B",
    });
    const aItems = await getUnreadNotifications(a.id);
    expect(aItems.some((n) => n.title === "secret-b")).toBe(false);
    expect(await countUnreadNotifications(a.id)).toBe(0);
    await markNotificationsRead(a.id);
    expect(await countUnreadNotifications(b.id)).toBe(1);
  });

  it("unreadCount counts all unread even when the list is capped at 20", async () => {
    const user = await createTestUser({ name: "Notif Unread" });
    for (let i = 0; i < 25; i += 1) {
      await createNotification({
        userId: user.id,
        type: "support_reply",
        title: `n-${i}`,
        body: "body",
      });
    }
    const items = await getUnreadNotifications(user.id);
    expect(items).toHaveLength(20);
    expect(await countUnreadNotifications(user.id)).toBe(25);

    const visibleId = items[0]?.id;
    expect(visibleId).toBeTruthy();
    await query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = $2`,
      [user.id, visibleId]
    );
    const afterOne = await getUnreadNotifications(user.id);
    expect(await countUnreadNotifications(user.id)).toBe(24);
    expect(afterOne).toHaveLength(20);
    expect(afterOne.some((n) => n.id === visibleId)).toBe(false);

    await markNotificationsRead(user.id);
    expect(await countUnreadNotifications(user.id)).toBe(0);
    expect(await getUnreadNotifications(user.id)).toHaveLength(0);
  });

  it("partial unique ON CONFLICT: same user/same key inserts once without error", async () => {
    const user = await createTestUser({ name: "Notif Idem" });
    const insertSql = `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
     DO NOTHING`;
    const key = "event_reminder:fact-1:2030-01-01";
    const first = await query(insertSql, [
      user.id,
      "event_reminder",
      "one",
      "body",
      "{}",
      key,
    ]);
    const second = await query(insertSql, [
      user.id,
      "event_reminder",
      "two",
      "other",
      "{}",
      key,
    ]);
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0);
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id=$1`,
      [user.id]
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  it("partial unique: same user + different keys creates two rows", async () => {
    const user = await createTestUser({ name: "Notif Keys" });
    expect(
      (
        await createNotification({
          userId: user.id,
          type: "event_reminder",
          title: "a",
          body: "a",
          idempotencyKey: "event_reminder:fact-a:2030-01-01",
        })
      ).created
    ).toBe(true);
    expect(
      (
        await createNotification({
          userId: user.id,
          type: "event_reminder",
          title: "b",
          body: "b",
          idempotencyKey: "event_reminder:fact-b:2030-01-01",
        })
      ).created
    ).toBe(true);
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id=$1`,
      [user.id]
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(2);
  });

  it("different users may share the same logical idempotency key", async () => {
    const a = await createTestUser({ name: "Notif Key A" });
    const b = await createTestUser({ name: "Notif Key B" });
    const key = "report_ready:shared-job";
    expect(
      (await createNotification({
        userId: a.id,
        type: "report_ready",
        title: "a",
        body: "a",
        idempotencyKey: key,
      })).created
    ).toBe(true);
    expect(
      (await createNotification({
        userId: b.id,
        type: "report_ready",
        title: "b",
        body: "b",
        idempotencyKey: key,
      })).created
    ).toBe(true);
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications WHERE idempotency_key=$1`,
      [key]
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(2);
  });

  it("event reminder consent gate is not bypassed", async () => {
    const user = await createTestUser({ name: "Notif Consent" });
    await recordInitialMemoryChoice(user.id, "enabled");
    await updateMemoryPreferences(user.id, { eventRemindersEnabled: false });
    const date = upcomingDate(2);
    await upsertFact(user.id, {
      fact: `Выпускной ${date}`,
      category: "event",
      eventDate: date,
      predicateKey: "event.upcoming",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 3,
    });
    const events = await getGlobalUpcomingEvents(5);
    expect(events.some((e) => e.userId === user.id)).toBe(false);
  });
});
