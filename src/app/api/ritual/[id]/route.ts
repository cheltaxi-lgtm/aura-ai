import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getRitualById,
  getRitualStats,
  deleteRitualById,
  ritualToClient,
} from "@/lib/ritual-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stats = await getRitualStats(ritual.ritual_type, ritual.character_key);

  return NextResponse.json({
    ritual: ritualToClient(ritual),
    stats: {
      total: stats.total,
      signs_reported: stats.signsReported,
    },
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteRitualById(id, authed.profileUserId);

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
