import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  getMemoryPreferences,
  updateMemoryPreferences,
  type MemoryPreferencesPatch,
} from "@/lib/memory/preferences";

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
  return NextResponse.json({ preferences: prefs });
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

  const preferences = await updateMemoryPreferences(profileUserId, patch);
  return NextResponse.json({ ok: true, preferences });
}
