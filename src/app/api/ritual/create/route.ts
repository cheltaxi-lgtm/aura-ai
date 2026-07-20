import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getMoonPhase } from "@/lib/moon";
import {
  RITUAL_TYPES,
  isRitualMaster,
  isRitualType,
  isRitualAllowedForMaster,
  type RitualMasterKey,
} from "@/lib/ritual-config";
import {
  getRitualSettings,
  isRitualCatalogEnabled,
  isRitualTypeEnabled,
  ritualCostFromSettings,
} from "@/lib/ritual-settings";
import { createRitual, ritualToClient } from "@/lib/ritual-service";
import { getUserById } from "@/lib/users";

export async function POST(request: NextRequest) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileRow = await getUserById(authed.profileUserId);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "ritual_create");
  if (rateLimited) return rateLimited;

  let body: { characterKey?: string; ritualType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const characterKey = body.characterKey?.trim() ?? "";
  const ritualType = body.ritualType?.trim() ?? "";

  if (!isRitualMaster(characterKey)) {
    return NextResponse.json({ error: "Invalid master" }, { status: 400 });
  }
  if (!isRitualType(ritualType)) {
    return NextResponse.json({ error: "Invalid ritual type" }, { status: 400 });
  }
  if (!isRitualAllowedForMaster(characterKey as RitualMasterKey, ritualType)) {
    return NextResponse.json({ error: "Ritual type not available for master" }, { status: 400 });
  }

  const ritualSettings = await getRitualSettings();
  if (!isRitualCatalogEnabled(ritualSettings)) {
    return NextResponse.json({ error: "Rituals disabled" }, { status: 400 });
  }
  if (!isRitualTypeEnabled(ritualSettings, ritualType)) {
    return NextResponse.json({ error: "Ritual type disabled" }, { status: 400 });
  }

  const moon = getMoonPhase();
  const config = RITUAL_TYPES[ritualType];
  const cost = ritualCostFromSettings(ritualSettings, ritualType);

  const ritual = await createRitual({
    userId: authed.profileUserId,
    characterKey,
    ritualType,
    moonPhase: moon.phase,
    moonSign: moon.sign,
    runeCost: cost,
  });

  return NextResponse.json({
    ritualId: ritual.id,
    questions: config.questions,
    moonPhase: moon.phase,
    moonSign: moon.sign,
    cost,
    favorableForType: moon.favorable.includes(ritualType),
    ritual: ritualToClient(ritual),
  });
}
