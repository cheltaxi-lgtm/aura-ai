import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import {
  clientIp,
  enforceGuestTripletCompleteRateLimit,
} from "@/lib/api-guards";
import { setGuestResumeCookie } from "@/lib/guest-resume-cookie";
import {
  createGuestResumeToken,
  hashGuestResumeToken,
  validateGuestCompleteInput,
  type GuestCompleteInput,
} from "@/lib/guest-triplet-receipt";
import { createIssuedGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { setSessionClaimCookie } from "@/lib/session-claim";
import { assertTeaserRequestAllowed } from "@/lib/guest-triplet-teaser-service";

export const runtime = "nodejs";

/**
 * Pre-auth: seal a completed guest triplet as an anonymous server receipt.
 * Issues HttpOnly receipt cookie + session-claim binding. No LLM / no free reading.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isAgeGateCookieConfirmed(request))) {
    return NextResponse.json(
      { error: AGE_REQUIRED_ERROR, message: "Подтвердите возраст 18+" },
      { status: 403 }
    );
  }

  const antibot = assertTeaserRequestAllowed(request, {
    allowCapacitorWithoutSession: true,
  });
  if (!antibot.ok) {
    return NextResponse.json({ error: "forbidden", reason: antibot.reason }, { status: 403 });
  }

  const limited = await enforceGuestTripletCompleteRateLimit(clientIp(request));
  if (limited) return limited;

  let body: GuestCompleteInput;
  try {
    body = (await request.json()) as GuestCompleteInput;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const validated = validateGuestCompleteInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const token = createGuestResumeToken();
  const tokenHash = hashGuestResumeToken(token);

  try {
    const session = await createIssuedGuestResumeSession({
      masterId: validated.masterId,
      system: validated.system,
      spreadId: validated.spreadId,
      question: validated.question,
      symbols: validated.symbols,
      fingerprint: validated.fingerprint,
      tokenHash,
    });

    await setGuestResumeCookie(token, request);
    await setSessionClaimCookie(session.id, request);

    // Never return the opaque token — cookie is the only transport.
    return NextResponse.json({
      ok: true,
      expiresAt: session.guest_resume_expires_at,
    });
  } catch (err) {
    console.error("[guest-triplet/complete] failed", err instanceof Error ? err.message : "error");
    const { reportError } = await import("@/lib/error-report");
    reportError(err, { route: "guest-triplet/complete" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
