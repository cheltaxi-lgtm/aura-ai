import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { findUserById, getProfileUserIdForAccount } from "@/lib/accounts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  getMemoryPreferences,
  getMemoryExperimentAssignment,
  isMemoryChoiceRolloutEligible,
  MEMORY_INITIAL_PROMPT_VERSION,
  needsMemoryInitialChoice,
  recordInitialMemoryChoice,
  updateMemoryPreferences,
  type MemoryPreferencesPatch,
} from "@/lib/memory/preferences";
import { sendMemoryChoiceEmail } from "@/lib/email/send";
import { recordMemoryProductEvent } from "@/lib/memory/product-analytics";

export async function GET() {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }
  const prefs = await getMemoryPreferences(profileUserId);
  const experiment = getMemoryExperimentAssignment(profileUserId);
  return NextResponse.json({
    preferences: prefs,
    memoryExperiment: {
      promptVersion: MEMORY_INITIAL_PROMPT_VERSION,
      variant: experiment.variant,
      rolloutBucket: experiment.bucket,
    },
    needsInitialChoice:
      (await isMemoryChoiceRolloutEligible(profileUserId)) &&
      (await needsMemoryInitialChoice(profileUserId)),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_initial_choice", auth.sub),
    10,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit", retryAfterSec }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const choice = body.choice;
  if (choice !== "enabled" && choice !== "disabled") {
    return NextResponse.json({ error: "invalid_choice" }, { status: 422 });
  }
  if (choice === "enabled" && body.pdConsent !== true) {
    return NextResponse.json({ error: "consent_required" }, { status: 422 });
  }
  const preferences = await recordInitialMemoryChoice(profileUserId, choice);
  const experiment = getMemoryExperimentAssignment(profileUserId);
  await query(
    `UPDATE user_memory_preferences
        SET memory_rollout_bucket = COALESCE(memory_rollout_bucket, $2),
            memory_prompt_variant = COALESCE(memory_prompt_variant, $3)
      WHERE user_id = $1`,
    [profileUserId, experiment.bucket, experiment.variant]
  );
  void recordMemoryProductEvent({
    event: choice === "enabled" ? "consent_choice_enabled" : "consent_choice_disabled",
    userId: profileUserId,
    accountId: auth.sub,
    promptVersion: MEMORY_INITIAL_PROMPT_VERSION,
    consentVersion: preferences.consentVersion,
    rolloutBucket: experiment.bucket,
    variant: experiment.variant,
    memoryEnabled: preferences.memoryEnabled,
    autoCaptureEnabled: preferences.autoCaptureEnabled,
    momentsMode: preferences.momentsMode,
  });

  const emailVersion = `${MEMORY_INITIAL_PROMPT_VERSION}:${choice}`;
  const claimed = await query(
    `UPDATE user_memory_preferences
        SET memory_choice_email_version = 'sending:' || $2
      WHERE user_id = $1
        AND memory_choice_email_version IS DISTINCT FROM $2
        AND COALESCE(memory_choice_email_version, '') NOT LIKE 'sending:%'
      RETURNING user_id`,
    [profileUserId, emailVersion]
  );
  if (claimed.rowCount) {
    const account = await findUserById(auth.sub);
    const sent = account
      ? await sendMemoryChoiceEmail({
          to: account.email,
          name: account.name,
          choice,
        }).catch(() => false)
      : false;
    await query(
      `UPDATE user_memory_preferences
          SET memory_choice_email_version = $3
        WHERE user_id = $1 AND memory_choice_email_version = 'sending:' || $2`,
      [profileUserId, emailVersion, sent ? emailVersion : null]
    );
  }
  return NextResponse.json({ ok: true, preferences, needsInitialChoice: false });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_prefs_put", auth.sub),
    30,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec, message: "Слишком много изменений. Попробуйте позже." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const patch: MemoryPreferencesPatch = {};
  if (typeof body.memoryEnabled === "boolean") patch.memoryEnabled = body.memoryEnabled;
  if (typeof body.autoCaptureEnabled === "boolean") {
    patch.autoCaptureEnabled = body.autoCaptureEnabled;
  }
  if (typeof body.sensitiveCaptureEnabled === "boolean") {
    patch.sensitiveCaptureEnabled = body.sensitiveCaptureEnabled;
  }
  if (typeof body.eventRemindersEnabled === "boolean") {
    patch.eventRemindersEnabled = body.eventRemindersEnabled;
  }
  if (body.momentsMode === "active" || body.momentsMode === "quiet") {
    patch.momentsMode = body.momentsMode;
  }
  if (body.cabinetMode === "simple" || body.cabinetMode === "advanced") {
    patch.cabinetMode = body.cabinetMode;
  }

  if (
    (patch.memoryEnabled === true ||
      patch.autoCaptureEnabled === true ||
      patch.sensitiveCaptureEnabled === true) &&
    body.pdConsent !== true
  ) {
    return NextResponse.json(
      {
        error: "consent_required",
        message: "Требуется согласие на обработку персональных данных для включения памяти.",
      },
      { status: 422 }
    );
  }

  const before = await getMemoryPreferences(profileUserId);
  const preferences = await updateMemoryPreferences(profileUserId, patch);
  if (Object.keys(patch).length) {
    void recordMemoryProductEvent({
      event:
        patch.momentsMode && patch.momentsMode !== before.momentsMode
          ? "moments_mode_changed"
          : "memory_settings_changed",
      userId: profileUserId,
      accountId: auth.sub,
      sourceType: "cabinet",
      consentVersion: preferences.consentVersion,
      memoryEnabled: preferences.memoryEnabled,
      autoCaptureEnabled: preferences.autoCaptureEnabled,
      momentsMode: preferences.momentsMode,
    });
  }
  return NextResponse.json({ ok: true, preferences });
}
