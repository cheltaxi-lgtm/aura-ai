import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseNotificationPrefs } from "@/lib/daily-reminder-service";
import { buildPersonalContinueItems } from "@/lib/personal-zovus-home";
import {
  PROACTIVE_CONTACT_MAX_24H,
  PROACTIVE_CONTACT_MAX_7D,
  PROACTIVE_RESERVATION_TIMEOUT_MINUTES,
} from "@/lib/proactive-contact-policy";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("retention integrity", () => {
  it("requires explicit opt-in for promotional channels but keeps paid-result delivery", () => {
    const prefs = parseNotificationPrefs({});
    expect(prefs.dailyEmail).toBe(false);
    expect(prefs.dailyInApp).toBe(false);
    expect(prefs.dailyTelegram).toBe(false);
    expect(prefs.bonusEmail).toBe(false);
    expect(prefs.marketingEmail).toBe(false);
    expect(prefs.reportReadyEmail).toBe(true);
    expect(prefs.reportReadyTelegram).toBe(true);
  });

  it("caps logical proactive contacts across campaigns", () => {
    expect(PROACTIVE_CONTACT_MAX_24H).toBe(1);
    expect(PROACTIVE_CONTACT_MAX_7D).toBe(2);
    expect(PROACTIVE_RESERVATION_TIMEOUT_MINUTES).toBe(30);
    const policy = read("src/lib/proactive-contact-policy.ts");
    expect(policy).toMatch(/pg_advisory_xact_lock/);
    expect(policy).toMatch(/status IN \('reserved',\s*'delivered'\)/);
    expect(policy).toMatch(/proactive_contact_log\.status='failed'/);
    expect(policy).toMatch(/status='reserved'[\s\S]*created_at < NOW\(\)/);
    for (const file of [
      "src/lib/daily-reminder-service.ts",
      "src/lib/reengagement-email-service.ts",
      "src/lib/reading-followup-service.ts",
      "src/app/api/cron/event-reminders/route.ts",
    ]) {
      const source = read(file);
      expect(source).toMatch(/reserveProactiveContact/);
      expect(source).toMatch(/finishProactiveContact/);
    }
  });

  it("keeps promotional email preferences channel-specific and atomic", () => {
    const reminders = read("src/lib/daily-reminder-service.ts");
    const reengagement = read("src/lib/reengagement-email-service.ts");
    expect(reminders).toMatch(/notification_prefs = COALESCE\(notification_prefs, '\{\}'::jsonb\) \|\| \$2::jsonb/);
    expect(reengagement).not.toMatch(/dispatchNotification|notifyBot/);
    expect(reengagement).toMatch(/bonusEmail/);
    expect(reengagement).toMatch(/marketingEmail/);
  });

  it("aligns repeatable product activity with rolling retention days", () => {
    const activity = read("src/lib/product-activity.ts");
    const stats = read("src/lib/admin-product-stats.ts");
    expect(activity).toMatch(/REPEATABLE_ACTIVITY_EVENTS/);
    expect(activity).toMatch(/MIN\(created_at\) AS registered_at/);
    expect(activity).toMatch(/NOW\(\) - registration\.registered_at/);
    expect(activity).toMatch(/86400/);
    expect(activity).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    expect(stats).toMatch(/FROM chat_messages/);
    expect(stats).toMatch(/FROM history/);
    expect(stats).toMatch(/FROM async_jobs/);
    expect(stats).toMatch(/FROM rune_transactions/);
    expect(stats).toMatch(/FROM diary_entries/);
  });

  it("keeps admin account changes and their audit records in one transaction", () => {
    const route = read("src/app/api/admin/users/route.ts");
    const stepup = read("src/lib/admin-stepup.ts");
    expect(route).toMatch(/withTransaction/);
    expect(route).toMatch(/UPDATE user_accounts[\s\S]*INSERT INTO admin_audit_log/);
    expect(stepup).toMatch(/steppedSub[\s\S]*findAdminById\(auth\.sub\)[\s\S]*is_active/);
  });

  it("resets transient feedback state for a new target and reports failures", () => {
    const feedback = read("src/components/SessionFeedback.tsx");
    const memory = read("src/components/PersonalMemoryChoice.tsx");
    expect(feedback).toMatch(/\[sessionId, targetType\]/);
    expect(feedback).toMatch(/Не удалось отправить ответ/);
    expect(feedback).toMatch(/min-h-11/);
    expect(memory).toMatch(/overflow-y-auto/);
    expect(memory).not.toMatch(/>Позже</);
  });

  it("keeps a completed photo result visible until an explicit chat action", () => {
    const flow = read("src/components/PhotoReadingFlow.tsx");
    expect(flow).toMatch(/Keep the completed result visible/);
    expect(flow).toMatch(/handleContinueChat/);
    expect(flow).toMatch(/\/cabinet\/readings\/\$\{encodeURIComponent\(result\.historyId\)\}\/print/);
    expect(flow).not.toMatch(/if \(onContinueChat && analysis && !data\.cached\)/);
    expect(flow).not.toMatch(/onConfirmSpread/);
    expect(read("src/components/HomePage.tsx")).not.toMatch(/onConfirmSpread=/);
  });

  it("offers the exact saved photo result on the personal home", () => {
    const items = buildPersonalContinueItems({
      photoReading: { id: "11111111-1111-4111-8111-111111111111", masterName: "Вероника" },
    });
    expect(items[0]).toEqual({
      kind: "photo",
      title: "ФотоТаро",
      subtitle: "Вернуться к разбору с Вероника",
      href: "/cabinet/readings/11111111-1111-4111-8111-111111111111/print",
    });
  });

  it("tracks continuation only when it enters the viewport", () => {
    const journey = read("src/components/ReadingJourney.tsx");
    expect(journey).toMatch(/IntersectionObserver/);
    expect(journey).toMatch(/intersectionRatio>=0\.5/);
  });

  it("separates usefulness feedback from prediction outcome ratings", () => {
    const route = read("src/app/api/feedback/reading/route.ts");
    expect(route).toMatch(/reading_feedback/);
    expect(route).not.toMatch(/session_memories|outcome_rating/);
  });

  it("excludes explicitly marked internal accounts from retention", () => {
    const migration = read("scripts/migrations/159_retention_integrity.sql");
    const stats = read("src/lib/admin-product-stats.ts");
    expect(migration).toMatch(/is_internal BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(stats).toMatch(/ua\.is_internal=FALSE/);
    expect(stats).toMatch(/source='product_activity'/);
  });
});
