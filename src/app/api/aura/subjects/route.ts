import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isAuraOtherSubjectsEnabled, isAuraReadingEnabled } from "@/lib/settings";
import { listAuraSubjects } from "@/lib/services/aura-subject-service";

export const runtime = "nodejs";

/** Slot list for the «чья аура» picker. Auth required — not a public guest API. */
export async function GET() {
  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  if (!(await isAuraOtherSubjectsEnabled())) {
    return NextResponse.json({ subjects: [], enabled: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "aura_readings");
  if (rateLimited) return rateLimited;
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const subjects = await listAuraSubjects(profileUserId);
  return NextResponse.json(
    { enabled: true, subjects },
    { headers: { "Cache-Control": "no-store" } }
  );
}
