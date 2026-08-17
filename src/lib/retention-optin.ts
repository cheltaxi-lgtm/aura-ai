import {
  getAccountConsentSnapshot,
  getAccountDailyCardsReminder,
  recordAccountLegalConsent,
} from "@/lib/accounts";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/daily-reminder-service";
import { query } from "@/lib/db";
import {
  isRetentionOptInQuiet,
  RETENTION_OPTIN_DECLINE_COOLDOWN_MS,
  RETENTION_OPTIN_SHOWN_COOLDOWN_MS,
  type RetentionOptInAction,
} from "@/lib/retention-optin-shared";

export {
  isRetentionOptInAction,
  isRetentionOptInQuiet,
  isRetentionOptInSurface,
  RETENTION_OPTIN_ACTIONS,
  RETENTION_OPTIN_COPY,
  RETENTION_OPTIN_DECLINE_COOLDOWN_MS,
  RETENTION_OPTIN_SHOWN_COOLDOWN_MS,
  RETENTION_OPTIN_SURFACES,
  RETENTION_OPTIN_TOPICS,
} from "@/lib/retention-optin-shared";
export type {
  RetentionOptInAction,
  RetentionOptInSurface,
  RetentionOptInTopic,
} from "@/lib/retention-optin-shared";

/** First useful result: Tarot history or an owned natal / matrix / HD chart. */
export async function userHasRetentionValue(profileUserId: string): Promise<boolean> {
  const { rows } = await query<{ has_value: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM history WHERE user_id = $1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM natal_charts WHERE user_id = $1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM hd_charts WHERE user_id = $1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM matrix_subjects WHERE user_id = $1 LIMIT 1)
     ) AS has_value`,
    [profileUserId]
  );
  return Boolean(rows[0]?.has_value);
}

export type RetentionOptInSnapshot = {
  marketingConsent: boolean;
  dailyCardsReminder: boolean;
  weeklyDigestEmail: boolean;
  marketingEmail: boolean;
  hasFirstValue: boolean;
  quietUntil: string | null;
  /** Prompt surfaces only: value received, consent off, not in cooldown. */
  eligible: boolean;
};

export async function getRetentionOptInSnapshot(
  accountId: string,
  profileUserId: string,
  now = new Date()
): Promise<RetentionOptInSnapshot> {
  const [consent, dailyCardsReminder, prefs, hasFirstValue] = await Promise.all([
    getAccountConsentSnapshot(accountId),
    getAccountDailyCardsReminder(accountId),
    getNotificationPrefs(profileUserId),
    userHasRetentionValue(profileUserId),
  ]);

  const marketingConsent = Boolean(consent?.marketingConsent);
  const quietUntil = prefs.retentionOptInQuietUntil;
  const eligible =
    !marketingConsent && hasFirstValue && !isRetentionOptInQuiet(quietUntil, now);

  return {
    marketingConsent,
    dailyCardsReminder,
    weeklyDigestEmail: prefs.weeklyDigestEmail === true,
    marketingEmail: prefs.marketingEmail !== false,
    hasFirstValue,
    quietUntil,
    eligible,
  };
}

function laterIso(from: Date, ms: number): string {
  return new Date(from.getTime() + ms).toISOString();
}

export async function applyRetentionOptInAction(input: {
  accountId: string;
  profileUserId: string;
  action: RetentionOptInAction;
  now?: Date;
}): Promise<RetentionOptInSnapshot> {
  const now = input.now ?? new Date();
  const current = await getRetentionOptInSnapshot(
    input.accountId,
    input.profileUserId,
    now
  );

  if (input.action === "accept") {
    await recordAccountLegalConsent(input.accountId, { marketingConsent: true });
    await updateNotificationPrefs(input.profileUserId, {
      marketingEmail: true,
      retentionOptInQuietUntil: null,
    });
    return getRetentionOptInSnapshot(input.accountId, input.profileUserId, now);
  }

  if (input.action === "decline") {
    await updateNotificationPrefs(input.profileUserId, {
      retentionOptInQuietUntil: laterIso(now, RETENTION_OPTIN_DECLINE_COOLDOWN_MS),
    });
    return getRetentionOptInSnapshot(input.accountId, input.profileUserId, now);
  }

  // shown: do not shorten an existing longer quiet window; do not grant consent.
  if (current.eligible) {
    const nextQuiet = laterIso(now, RETENTION_OPTIN_SHOWN_COOLDOWN_MS);
    const existingMs = current.quietUntil ? Date.parse(current.quietUntil) : 0;
    if (!Number.isFinite(existingMs) || existingMs < Date.parse(nextQuiet)) {
      await updateNotificationPrefs(input.profileUserId, {
        retentionOptInQuietUntil: nextQuiet,
      });
    }
  }

  return getRetentionOptInSnapshot(input.accountId, input.profileUserId, now);
}
