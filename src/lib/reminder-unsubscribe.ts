import { SignJWT, jwtVerify } from "jose";
import {
  getAccountDailyCardsReminder,
  getProfileUserIdForAccount,
  setAccountDailyCardsReminder,
  setAccountMarketingConsent,
} from "@/lib/accounts";
import { updateNotificationPrefs } from "@/lib/daily-reminder-service";
import { getSiteUrl } from "@/lib/email/mail-config";

export const REMINDER_UNSUBSCRIBE_TOPICS = [
  "daily_cards",
  "daily_bonus",
  "marketing",
] as const;

export type ReminderUnsubscribeTopic = (typeof REMINDER_UNSUBSCRIBE_TOPICS)[number];

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

export function isReminderUnsubscribeTopic(
  value: unknown
): value is ReminderUnsubscribeTopic {
  return (
    typeof value === "string" &&
    (REMINDER_UNSUBSCRIBE_TOPICS as readonly string[]).includes(value)
  );
}

export async function signReminderUnsubscribeToken(
  accountId: string,
  topic: ReminderUnsubscribeTopic
): Promise<string> {
  return new SignJWT({ accountId, topic, purpose: "reminder_unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("400d")
    .sign(secretKey());
}

export async function verifyReminderUnsubscribeToken(
  token: string
): Promise<{ accountId: string; topic: ReminderUnsubscribeTopic } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "reminder_unsub") return null;
    if (typeof payload.accountId !== "string" || !payload.accountId) return null;
    if (!isReminderUnsubscribeTopic(payload.topic)) return null;
    return { accountId: payload.accountId, topic: payload.topic };
  } catch {
    return null;
  }
}

export async function reminderUnsubscribeUrl(
  accountId: string,
  topic: ReminderUnsubscribeTopic
): Promise<string> {
  const token = await signReminderUnsubscribeToken(accountId, topic);
  return `${getSiteUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function applyReminderUnsubscribe(
  accountId: string,
  topic: ReminderUnsubscribeTopic
): Promise<{ ok: true; topic: ReminderUnsubscribeTopic }> {
  if (topic === "daily_cards") {
    await setAccountDailyCardsReminder(accountId, false);
    return { ok: true, topic };
  }
  if (topic === "marketing") {
    await setAccountMarketingConsent(accountId, false);
    const profileUserId = await getProfileUserIdForAccount(accountId);
    if (profileUserId) {
      await updateNotificationPrefs(profileUserId, { marketingEmail: false });
    }
    return { ok: true, topic };
  }
  const profileUserId = await getProfileUserIdForAccount(accountId);
  if (profileUserId) {
    await updateNotificationPrefs(profileUserId, { bonusEmail: false });
  }
  return { ok: true, topic };
}

export async function isTopicEnabled(
  accountId: string,
  topic: ReminderUnsubscribeTopic
): Promise<boolean> {
  if (topic === "daily_cards") {
    return getAccountDailyCardsReminder(accountId);
  }
  const { getAccountConsentSnapshot } = await import("@/lib/accounts");
  if (topic === "marketing") {
    const snap = await getAccountConsentSnapshot(accountId);
    return Boolean(snap?.marketingConsent);
  }
  const profileUserId = await getProfileUserIdForAccount(accountId);
  if (!profileUserId) return false;
  const { getNotificationPrefs } = await import("@/lib/daily-reminder-service");
  const prefs = await getNotificationPrefs(profileUserId);
  return prefs.bonusEmail !== false;
}
