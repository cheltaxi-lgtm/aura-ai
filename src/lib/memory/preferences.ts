/**
 * Per-user memory governance preferences (opt-in, sensitive capture, reminders).
 * Fail-closed: missing row ⇒ memory/auto-capture disabled.
 */
import { query } from "@/lib/db";
import { createHash } from "node:crypto";
import { getSetting } from "@/lib/settings";

export const MEMORY_CONSENT_VERSION = "memory-v2-2026-07-23";
export const MEMORY_INITIAL_PROMPT_VERSION = "personal-memory-v1-2026-07-23";

export type MemoryPreferences = {
  userId: string;
  memoryEnabled: boolean;
  autoCaptureEnabled: boolean;
  sensitiveCaptureEnabled: boolean;
  eventRemindersEnabled: boolean;
  initialChoice: "enabled" | "disabled" | null;
  initialChoiceAt: string | null;
  initialPromptVersion: string | null;
  consentVersion: string | null;
  consentGrantedAt: string | null;
  consentRevokedAt: string | null;
  updatedAt: string | null;
};

const DEFAULT_PREFS = (userId: string): MemoryPreferences => ({
  userId,
  memoryEnabled: false,
  autoCaptureEnabled: false,
  sensitiveCaptureEnabled: false,
  eventRemindersEnabled: false,
  initialChoice: null,
  initialChoiceAt: null,
  initialPromptVersion: null,
  consentVersion: null,
  consentGrantedAt: null,
  consentRevokedAt: null,
  updatedAt: null,
});

type PrefRow = {
  user_id: string;
  memory_enabled: boolean;
  auto_capture_enabled: boolean;
  sensitive_capture_enabled: boolean;
  event_reminders_enabled: boolean;
  memory_initial_choice: "enabled" | "disabled" | null;
  memory_initial_choice_at: Date | string | null;
  memory_initial_prompt_version: string | null;
  consent_version: string | null;
  consent_granted_at: Date | string | null;
  consent_revoked_at: Date | string | null;
  updated_at: Date | string | null;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapRow(row: PrefRow): MemoryPreferences {
  return {
    userId: row.user_id,
    memoryEnabled: Boolean(row.memory_enabled),
    autoCaptureEnabled: Boolean(row.auto_capture_enabled),
    sensitiveCaptureEnabled: Boolean(row.sensitive_capture_enabled),
    eventRemindersEnabled: Boolean(row.event_reminders_enabled),
    initialChoice: row.memory_initial_choice,
    initialChoiceAt: iso(row.memory_initial_choice_at),
    initialPromptVersion: row.memory_initial_prompt_version,
    consentVersion: row.consent_version,
    consentGrantedAt: iso(row.consent_granted_at),
    consentRevokedAt: iso(row.consent_revoked_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function getMemoryPreferences(userId: string): Promise<MemoryPreferences> {
  if (!userId) return DEFAULT_PREFS("");
  const { rows } = await query<PrefRow>(
    `SELECT user_id, memory_enabled, auto_capture_enabled, sensitive_capture_enabled,
            event_reminders_enabled, memory_initial_choice, memory_initial_choice_at,
            memory_initial_prompt_version, consent_version, consent_granted_at,
            consent_revoked_at, updated_at
       FROM user_memory_preferences
      WHERE user_id = $1
      LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapRow(rows[0]) : DEFAULT_PREFS(userId);
}

export type MemoryPreferencesPatch = {
  memoryEnabled?: boolean;
  autoCaptureEnabled?: boolean;
  sensitiveCaptureEnabled?: boolean;
  eventRemindersEnabled?: boolean;
};

/**
 * Upsert preferences. Enabling memory/auto/sensitive stamps consent_version
 * and consent_granted_at; disabling all capture stamps consent_revoked_at.
 */
export async function updateMemoryPreferences(
  userId: string,
  patch: MemoryPreferencesPatch
): Promise<MemoryPreferences> {
  if (!userId) throw new Error("userId required");
  const current = await getMemoryPreferences(userId);

  const next: MemoryPreferences = {
    ...current,
    userId,
    memoryEnabled: patch.memoryEnabled ?? current.memoryEnabled,
    autoCaptureEnabled: patch.autoCaptureEnabled ?? current.autoCaptureEnabled,
    sensitiveCaptureEnabled:
      patch.sensitiveCaptureEnabled ?? current.sensitiveCaptureEnabled,
    eventRemindersEnabled:
      patch.eventRemindersEnabled ?? current.eventRemindersEnabled,
  };

  // Auto/sensitive require memory_enabled.
  if (!next.memoryEnabled) {
    next.autoCaptureEnabled = false;
    next.sensitiveCaptureEnabled = false;
    next.eventRemindersEnabled = false;
  }
  if (!next.autoCaptureEnabled) {
    next.sensitiveCaptureEnabled = false;
  }

  const enabling =
    next.memoryEnabled &&
    (!current.memoryEnabled || !current.consentGrantedAt || current.consentRevokedAt);
  const revoking = current.memoryEnabled && !next.memoryEnabled;

  const { rows } = await query<PrefRow>(
    `INSERT INTO user_memory_preferences (
       user_id, memory_enabled, auto_capture_enabled, sensitive_capture_enabled,
       event_reminders_enabled, memory_initial_choice, memory_initial_choice_at,
       memory_initial_prompt_version, consent_version, consent_granted_at,
       consent_revoked_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       CASE WHEN $6 THEN 'enabled' ELSE NULL END,
       CASE WHEN $6 THEN NOW() ELSE NULL END,
       CASE WHEN $6 THEN $7 ELSE NULL END,
       CASE WHEN $6 THEN $8 ELSE NULL END,
       CASE WHEN $6 THEN NOW() ELSE NULL END,
       CASE WHEN $9 THEN NOW() ELSE NULL END,
       NOW()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       memory_enabled = EXCLUDED.memory_enabled,
       auto_capture_enabled = EXCLUDED.auto_capture_enabled,
       sensitive_capture_enabled = EXCLUDED.sensitive_capture_enabled,
       event_reminders_enabled = EXCLUDED.event_reminders_enabled,
       memory_initial_choice = CASE
         WHEN $6 THEN 'enabled'
         ELSE user_memory_preferences.memory_initial_choice
       END,
       memory_initial_choice_at = CASE
         WHEN $6 THEN COALESCE(user_memory_preferences.memory_initial_choice_at, NOW())
         ELSE user_memory_preferences.memory_initial_choice_at
       END,
       memory_initial_prompt_version = CASE
         WHEN $6 THEN $7
         ELSE user_memory_preferences.memory_initial_prompt_version
       END,
       consent_version = CASE
         WHEN $6 THEN $8
         WHEN $9 THEN user_memory_preferences.consent_version
         ELSE COALESCE(user_memory_preferences.consent_version, EXCLUDED.consent_version)
       END,
       consent_granted_at = CASE
         WHEN $6 THEN NOW()
         ELSE user_memory_preferences.consent_granted_at
       END,
       consent_revoked_at = CASE
         WHEN $9 THEN NOW()
         WHEN $6 THEN NULL
         ELSE user_memory_preferences.consent_revoked_at
       END,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      next.memoryEnabled,
      next.autoCaptureEnabled,
      next.sensitiveCaptureEnabled,
      next.eventRemindersEnabled,
      enabling,
      MEMORY_INITIAL_PROMPT_VERSION,
      MEMORY_CONSENT_VERSION,
      revoking,
    ]
  );

  return rows[0] ? mapRow(rows[0]) : next;
}

export async function needsMemoryInitialChoice(userId: string): Promise<boolean> {
  const prefs = await getMemoryPreferences(userId);
  return (
    !prefs.initialChoiceAt ||
    prefs.initialPromptVersion !== MEMORY_INITIAL_PROMPT_VERSION
  );
}

export async function isMemoryChoiceRolloutEligible(userId: string): Promise<boolean> {
  const features = await getSetting("features");
  if (features.personalMemoryChoiceEnabled === false) return false;
  const percent = Math.min(
    100,
    Math.max(0, Number(features.personalMemoryRolloutPercent ?? 100))
  );
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  const bucket =
    Number.parseInt(createHash("sha256").update(userId).digest("hex").slice(0, 8), 16) %
    100;
  return bucket < percent;
}

/** Record the mandatory first choice. Sensitive capture and reminders stay off. */
export async function recordInitialMemoryChoice(
  userId: string,
  choice: "enabled" | "disabled"
): Promise<MemoryPreferences> {
  if (!userId) throw new Error("userId required");
  const enabled = choice === "enabled";
  const { rows } = await query<PrefRow>(
    `INSERT INTO user_memory_preferences (
       user_id, memory_enabled, auto_capture_enabled, sensitive_capture_enabled,
       event_reminders_enabled, memory_initial_choice, memory_initial_choice_at,
       memory_initial_prompt_version, consent_version, consent_granted_at,
       consent_revoked_at, updated_at
     ) VALUES (
       $1, $2, $2, FALSE, FALSE, $3, NOW(), $4,
       CASE WHEN $2 THEN $5 ELSE NULL END,
       CASE WHEN $2 THEN NOW() ELSE NULL END,
       CASE WHEN $2 THEN NULL ELSE NOW() END,
       NOW()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       memory_enabled = $2,
       auto_capture_enabled = $2,
       sensitive_capture_enabled = FALSE,
       event_reminders_enabled = FALSE,
       memory_initial_choice = $3,
       memory_initial_choice_at = NOW(),
       memory_initial_prompt_version = $4,
       consent_version = CASE WHEN $2 THEN $5 ELSE user_memory_preferences.consent_version END,
       consent_granted_at = CASE WHEN $2 THEN NOW() ELSE user_memory_preferences.consent_granted_at END,
       consent_revoked_at = CASE WHEN $2 THEN NULL ELSE NOW() END,
       updated_at = NOW()
     RETURNING *`,
    [userId, enabled, choice, MEMORY_INITIAL_PROMPT_VERSION, MEMORY_CONSENT_VERSION]
  );
  return mapRow(rows[0]);
}

/** Soft-disable after purge (keeps row for audit). */
export async function revokeMemoryConsent(userId: string): Promise<void> {
  if (!userId) return;
  await query(
    `INSERT INTO user_memory_preferences (
       user_id, memory_enabled, auto_capture_enabled, sensitive_capture_enabled,
       event_reminders_enabled, consent_revoked_at, updated_at
     ) VALUES ($1, FALSE, FALSE, FALSE, FALSE, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       memory_enabled = FALSE,
       auto_capture_enabled = FALSE,
       sensitive_capture_enabled = FALSE,
       event_reminders_enabled = FALSE,
       consent_revoked_at = NOW(),
       updated_at = NOW()`,
    [userId]
  );
}

export async function canReadMemory(userId: string): Promise<boolean> {
  const prefs = await getMemoryPreferences(userId);
  return prefs.memoryEnabled;
}

export async function canAutoCapture(userId: string): Promise<boolean> {
  const prefs = await getMemoryPreferences(userId);
  return prefs.memoryEnabled && prefs.autoCaptureEnabled;
}

export async function canCaptureSensitive(userId: string): Promise<boolean> {
  const prefs = await getMemoryPreferences(userId);
  return (
    prefs.memoryEnabled &&
    prefs.autoCaptureEnabled &&
    prefs.sensitiveCaptureEnabled
  );
}

export async function canSendEventReminders(userId: string): Promise<boolean> {
  const prefs = await getMemoryPreferences(userId);
  return prefs.memoryEnabled && prefs.eventRemindersEnabled;
}
