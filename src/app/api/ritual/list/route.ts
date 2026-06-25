import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { isRitualType } from "@/lib/ritual-config";
import {
  listUserRituals,
  ritualToClient,
  type RitualStatus,
} from "@/lib/ritual-service";

const VALID_STATUSES: RitualStatus[] = [
  "questions",
  "spread",
  "payment",
  "generating",
  "completed",
  "reviewed",
];

export async function GET(request: NextRequest) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characterKey = request.nextUrl.searchParams.get("characterKey")?.trim();
  const statusParam = request.nextUrl.searchParams.get("status")?.trim();
  const ritualType = request.nextUrl.searchParams.get("ritualType")?.trim();

  let status: RitualStatus | undefined;
  if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
    status = statusParam as RitualStatus;
  }

  let rituals = await listUserRituals(authed.profileUserId, {
    characterKey: characterKey || undefined,
    status,
  });

  if (ritualType && isRitualType(ritualType)) {
    rituals = rituals.filter((r) => r.ritual_type === ritualType);
  }

  return NextResponse.json({
    rituals: rituals.map(ritualToClient),
  });
}
