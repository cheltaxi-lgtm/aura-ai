import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isAuraReadingEnabled } from "@/lib/settings";
import { deleteAuraArchiveEntry, getAuraArchiveEntry } from "@/lib/aura-reading-archive";

export const runtime = "nodejs";

async function resolveOwner(): Promise<
  | { ok: true; profileUserId: string }
  | { ok: false; response: NextResponse }
> {
  if (!(await isAuraReadingEnabled())) {
    return { ok: false, response: NextResponse.json({ error: "Feature disabled" }, { status: 404 }) };
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "aura_readings");
  if (rateLimited) return { ok: false, response: rateLimited };
  if (!(await ensureDb())) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 503 }
      ),
    };
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return { ok: false, response: NextResponse.json({ error: "Profile not found" }, { status: 404 }) };
  }
  return { ok: true, profileUserId };
}

/** Full archive entry: complete snapshot (layers + chakras) and the report when paid. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const owner = await resolveOwner();
  if (!owner.ok) return owner.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const entry = await getAuraArchiveEntry(owner.profileUserId, id.trim());
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    entry: {
      snapshotId: entry.snapshotId,
      historyId: entry.historyId,
      paid: entry.paid,
      createdAt: entry.createdAt,
      reportAt: entry.reportAt,
      snapshot: entry.snapshot,
      report: entry.report,
      subjectId: entry.subjectId,
      subjectKind: entry.subjectKind,
      subjectName: entry.subjectName,
    },
  });
}

/** Remove an aura from the archive (report and/or snapshot, ownership-scoped). */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const owner = await resolveOwner();
  if (!owner.ok) return owner.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await deleteAuraArchiveEntry(owner.profileUserId, id.trim());
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
