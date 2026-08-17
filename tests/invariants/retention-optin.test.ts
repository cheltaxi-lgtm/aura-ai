/**
 * Retention P2A: value-based notification opt-in.
 * Permission acquisition only — no new email senders.
 */
import { readFileSync } from "node:fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  createUser,
  getAccountConsentSnapshot,
  getAccountDailyCardsReminder,
  recordAccountLegalConsent,
  setAccountDailyCardsReminder,
  setAccountMarketingConsent,
} from "@/lib/accounts";
import {
  getNotificationPrefs,
  parseNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/daily-reminder-service";
import {
  applyRetentionOptInAction,
  getRetentionOptInSnapshot,
  userHasRetentionValue,
} from "@/lib/retention-optin";
import { RETENTION_OPTIN_COPY } from "@/lib/retention-optin-shared";
import { createHistoryEntry, createUserProfileForAccount } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

async function seedAccount(suffix: string) {
  const account = await createUser(
    `ret-optin-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    "hash",
    "Retention"
  );
  const profile = await createUserProfileForAccount(account.id, {
    name: "Retention",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
  });
  return { account, profile };
}

describe("retention-optin (source)", () => {
  it("route is session-scoped and rejects cross-user target fields", () => {
    const route = read("src/app/api/profile/retention-optin/route.ts");
    expect(route).toMatch(/requireProfileUserId/);
    expect(route).toMatch(/status: 401/);
    expect(route).toMatch(/forbiddenTargetFields/);
    expect(route).toMatch(/userId/);
    expect(route).toMatch(/accountId/);
    expect(route).toMatch(/email/);
    expect(route).toMatch(/authed\.auth\.sub/);
    expect(route).toMatch(/authed\.profileUserId/);
    expect(route).not.toMatch(/localStorage/);
  });

  it("cabinet PATCH cannot set marketing_consent or quietUntil", () => {
    const route = read("src/app/api/profile/notifications/route.ts");
    expect(route).toMatch(/requireProfileUserId/);
    expect(route).toMatch(/weeklyDigestEmail/);
    expect(route).toMatch(/marketing_consent and retentionOptInQuietUntil are not writable/);
    expect(route).not.toMatch(/recordAccountLegalConsent/);
    expect(route).not.toMatch(/patch\.retentionOptInQuietUntil/);
    expect(route).not.toMatch(/marketingConsent\s*=/);
  });

  it("no pre-checked opt-in on the prompt card", () => {
    const card = read("src/components/retention/RetentionOptInCard.tsx");
    expect(card).toMatch(/Да, напоминать|RETENTION_OPTIN_COPY\.accept/);
    expect(card).toMatch(/Не сейчас|RETENTION_OPTIN_COPY\.decline/);
    expect(card).not.toMatch(/defaultChecked/);
    expect(card).not.toMatch(/type=["']checkbox["']/);
    expect(card).not.toMatch(/localStorage/);
  });

  it("copy is calm and uses the required lines", () => {
    expect(RETENTION_OPTIN_COPY.title).toBe(
      "Хотите, чтобы Zovus напоминал Вам, когда появится повод вернуться?"
    );
    expect(RETENTION_OPTIN_COPY.accept).toBe("Да, напоминать");
    expect(RETENTION_OPTIN_COPY.decline).toBe("Не сейчас");
    expect(RETENTION_OPTIN_COPY.choice).toMatch(/Вы сами выбираете/);
    const joined = Object.values(RETENTION_OPTIN_COPY).join("\n");
    expect(joined).not.toMatch(/судьбоносн/i);
    expect(joined).not.toMatch(/прямо сейчас/i);
    expect(joined).not.toMatch(/Не пропустите/i);
  });

  it("surfaces exist: post_value, authenticated_home, cabinet", () => {
    const home = read("src/components/editorial/PersonalZovusHome.tsx");
    const chat = read("src/components/ChatWindow.tsx");
    const homepage = read("src/components/HomePage.tsx");
    const cabinet = read("src/components/cabinet/CabinetDailyNotifications.tsx");
    expect(home).toMatch(/surface=["']authenticated_home["']/);
    expect(chat).toMatch(/surface=["']post_value["']/);
    expect(homepage).toMatch(/retentionOptInSurface/);
    expect(homepage).toMatch(/spreadReadingDone \|\| guestResumeChatAssist\.showContinue/);
    expect(cabinet).toMatch(/surface=["']cabinet["']/);
    expect(cabinet).toMatch(/Персональные напоминания Zovus/);
    expect(cabinet).toMatch(/Еженедельный обзор/);
    expect(cabinet).toMatch(/Карты дня/);
    expect(cabinet).toMatch(/weeklyDigestEmail === true/);
    expect(cabinet).toMatch(/dailyInApp/);
    expect(cabinet).toMatch(/dailyEmail/);
    expect(cabinet).toMatch(/bonusEmail/);
    expect(cabinet).toMatch(/reportReadyEmail/);
  });

  it("analytics is surface + topic only, no PII", () => {
    const src = read("src/lib/seo/product-funnel.ts");
    expect(src).toMatch(/retention_optin_shown/);
    expect(src).toMatch(/retention_optin_accepted/);
    expect(src).toMatch(/retention_optin_declined/);
    expect(src).toMatch(/retention_optin_settings_opened/);
    const blockStart = src.indexOf("export const RETENTION_OPTIN_EVENTS");
    const fnStart = src.indexOf("export function trackRetentionOptIn");
    expect(blockStart).toBeGreaterThan(-1);
    expect(fnStart).toBeGreaterThan(-1);
    const block = src.slice(blockStart, fnStart + 450);
    expect(block).toMatch(/surface/);
    expect(block).toMatch(/topic/);
    expect(block).toMatch(/personal_reminders/);
    expect(block).toMatch(/post_value/);
    expect(block).toMatch(/authenticated_home/);
    expect(block).toMatch(/cabinet/);
    expect(block).not.toMatch(/birthDate|userId|sessionId|createdAt/);
    expect(block).not.toMatch(/params\.(email|name|question)/);
  });

  it("does not send email or weekly digest", () => {
    const lib = read("src/lib/retention-optin.ts");
    const route = read("src/app/api/profile/retention-optin/route.ts");
    const reminder = read("src/lib/daily-reminder-service.ts");
    const winback = read("src/lib/reengagement-email-service.ts");
    expect(lib).not.toMatch(/sendEmail/);
    expect(route).not.toMatch(/sendEmail/);
    expect(reminder).not.toMatch(/weeklyDigestEmail === true[\s\S]{0,80}sendEmail/);
    expect(winback).not.toMatch(/weeklyDigestEmail/);
  });

  it("Daily Cards explicit opt-in route is unchanged", () => {
    const route = read("src/app/api/auth/daily-cards-reminder/route.ts");
    expect(route).toMatch(/setAccountDailyCardsReminder\(auth\.sub/);
    expect(route).toMatch(/getAccountDailyCardsReminder\(auth\.sub/);
    expect(route).not.toMatch(/retention-optin/);
    expect(route).not.toMatch(/marketingConsent/);
  });

  it("guest→auth reading flow is not gated by retention opt-in", () => {
    const complete = read("src/app/api/guest-triplet/complete/route.ts");
    const homepage = read("src/components/HomePage.tsx");
    expect(complete).not.toMatch(/retention-optin|retentionOptIn|applyRetentionOptIn/);
    expect(homepage).toMatch(/guestResumeChatAssist/);
    expect(homepage).toMatch(/suggestedReplies=\{guestResumeChatAssist\.replies\}/);
    expect(homepage).toMatch(/showContinueInChat=\{guestResumeChatAssist\.showContinue\}/);
    expect(homepage).toMatch(/spreadType === ["']guest_resume["']/);
  });

  it("prefs defaults: marketingEmail missing=true, weeklyDigest missing=false", () => {
    const parsed = parseNotificationPrefs({});
    expect(parsed.marketingEmail).toBe(true);
    expect(parsed.weeklyDigestEmail).toBe(false);
    expect(parsed.retentionOptInQuietUntil).toBeNull();
    expect(parseNotificationPrefs({ weeklyDigestEmail: true }).weeklyDigestEmail).toBe(true);
    expect(parseNotificationPrefs({ marketingEmail: false }).marketingEmail).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("retention-optin (db)", () => {
  installDbLifecycle();

  it("1. shown/decline/prefs do not re-enable consent after unsubscribe", async () => {
    const { account, profile } = await seedAccount("no-implicit");
    expect((await getAccountConsentSnapshot(account.id))?.marketingConsent).toBe(true);
    await setAccountMarketingConsent(account.id, false);
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    await applyRetentionOptInAction({
      accountId: account.id,
      profileUserId: profile.id,
      action: "shown",
    });
    await applyRetentionOptInAction({
      accountId: account.id,
      profileUserId: profile.id,
      action: "decline",
    });
    await updateNotificationPrefs(profile.id, {
      marketingEmail: true,
      weeklyDigestEmail: true,
    });
    const snap = await getAccountConsentSnapshot(account.id);
    expect(snap?.marketingConsent).toBe(false);
  });

  it("3+4. accept persists server-side; decline does not enable consent or Daily Cards", async () => {
    const accepted = await seedAccount("accept");
    const declined = await seedAccount("decline");
    await setAccountMarketingConsent(accepted.account.id, false);
    await setAccountDailyCardsReminder(accepted.account.id, false);
    await setAccountMarketingConsent(declined.account.id, false);
    await setAccountDailyCardsReminder(declined.account.id, false);
    await createHistoryEntry({
      userId: accepted.profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    await createHistoryEntry({
      userId: declined.profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });

    const afterAccept = await applyRetentionOptInAction({
      accountId: accepted.account.id,
      profileUserId: accepted.profile.id,
      action: "accept",
    });
    expect(afterAccept.marketingConsent).toBe(true);
    expect(afterAccept.eligible).toBe(false);
    expect((await getAccountConsentSnapshot(accepted.account.id))?.marketingConsent).toBe(true);
    expect((await getNotificationPrefs(accepted.profile.id)).marketingEmail).toBe(true);
    expect(await getAccountDailyCardsReminder(accepted.account.id)).toBe(false);

    const afterDecline = await applyRetentionOptInAction({
      accountId: declined.account.id,
      profileUserId: declined.profile.id,
      action: "decline",
    });
    expect(afterDecline.marketingConsent).toBe(false);
    expect(afterDecline.eligible).toBe(false);
    expect(await getAccountDailyCardsReminder(declined.account.id)).toBe(false);
    expect((await getAccountConsentSnapshot(declined.account.id))?.marketingConsent).toBe(false);
  });

  it("5. declined prompt is not eligible immediately", async () => {
    const { account, profile } = await seedAccount("cooldown");
    await setAccountMarketingConsent(account.id, false);
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    expect((await getRetentionOptInSnapshot(account.id, profile.id)).eligible).toBe(true);
    await applyRetentionOptInAction({
      accountId: account.id,
      profileUserId: profile.id,
      action: "decline",
    });
    expect((await getRetentionOptInSnapshot(account.id, profile.id)).eligible).toBe(false);
  });

  it("shown also quiets the prompt so it is not every login", async () => {
    const { account, profile } = await seedAccount("shown");
    await setAccountMarketingConsent(account.id, false);
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    await applyRetentionOptInAction({
      accountId: account.id,
      profileUserId: profile.id,
      action: "shown",
    });
    const snap = await getRetentionOptInSnapshot(account.id, profile.id);
    expect(snap.marketingConsent).toBe(false);
    expect(snap.eligible).toBe(false);
    expect(snap.quietUntil).toBeTruthy();
  });

  it("6. accepting for user A does not change user B", async () => {
    const a = await seedAccount("owner-a");
    const b = await seedAccount("owner-b");
    await setAccountMarketingConsent(b.account.id, false);
    await setAccountDailyCardsReminder(b.account.id, false);
    await createHistoryEntry({
      userId: a.profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    await applyRetentionOptInAction({
      accountId: a.account.id,
      profileUserId: a.profile.id,
      action: "accept",
    });
    expect((await getAccountConsentSnapshot(b.account.id))?.marketingConsent).toBe(false);
    expect(await getAccountDailyCardsReminder(b.account.id)).toBe(false);
    const bPrefs = await getNotificationPrefs(b.profile.id);
    expect(bPrefs.weeklyDigestEmail).toBe(false);
  });

  it("7. Daily Cards reminder stays off unless its own API is used", async () => {
    const { account, profile } = await seedAccount("daily");
    await setAccountDailyCardsReminder(account.id, false);
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    await applyRetentionOptInAction({
      accountId: account.id,
      profileUserId: profile.id,
      action: "accept",
    });
    expect(await getAccountDailyCardsReminder(account.id)).toBe(false);
  });

  it("no first value → not eligible; value → eligible until consent", async () => {
    const { account, profile } = await seedAccount("value");
    await setAccountMarketingConsent(account.id, false);
    expect(await userHasRetentionValue(profile.id)).toBe(false);
    expect((await getRetentionOptInSnapshot(account.id, profile.id)).eligible).toBe(false);
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    expect(await userHasRetentionValue(profile.id)).toBe(true);
    expect((await getRetentionOptInSnapshot(account.id, profile.id)).eligible).toBe(true);
    await recordAccountLegalConsent(account.id, { marketingConsent: true });
    expect((await getRetentionOptInSnapshot(account.id, profile.id)).eligible).toBe(false);
  });

  it("default ON hides the P2A prompt without unsubscribe", async () => {
    const { account, profile } = await seedAccount("default-on");
    await createHistoryEntry({
      userId: profile.id,
      characterName: "veronika",
      contextData: { type: "spread" },
    });
    const snap = await getRetentionOptInSnapshot(account.id, profile.id);
    expect(snap.marketingConsent).toBe(true);
    expect(snap.dailyCardsReminder).toBe(true);
    expect(snap.eligible).toBe(false);
  });
});
