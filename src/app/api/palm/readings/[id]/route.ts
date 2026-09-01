import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isPalmReadingEnabled } from "@/lib/settings";
import { deletePalmArchiveEntry, getPalmArchiveEntry } from "@/lib/palm-reading-archive";
import { palmSnapshotForClient } from "@/lib/palm-constants";

export const runtime = "nodejs";

async function resolveOwner(): Promise<
  | { ok: true; profileUserId: string }
  | { ok: false; response: NextResponse }
> {
  if (!(await isPalmReadingEnabled())) {
    return { ok: false, response: NextResponse.json({ error: "Feature disabled" }, { status: 404 }) };
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "palm_readings");
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

  const entry = await getPalmArchiveEntry(owner.profileUserId, id.trim());
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
      snapshot: palmSnapshotForClient(entry.snapshot, entry.paid, entry.report),
      report: entry.report,
    },
  });
}

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

  const result = await deletePalmArchiveEntry(owner.profileUserId, id.trim());
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
