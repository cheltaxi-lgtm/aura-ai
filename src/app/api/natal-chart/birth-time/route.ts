import { NextRequest, NextResponse } from "next/server";
import { profileAuthFailureResponse, resolveBirthProfileUserContext } from "@/lib/require-auth";
import { queryClient, withTransaction } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { buildBirthFingerprint, birthTimeOccurrenceFromProfile } from "@/lib/natal/types";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isNatalChartEnabled } from "@/lib/settings";

export async function GET() {
  if (!(await isNatalChartEnabled())) return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  const auth = await resolveBirthProfileUserContext();
  if (!auth.ok) return profileAuthFailureResponse(auth.reason);
  const user = await getUserById(auth.profileUserId);
  return NextResponse.json({ occurrence: user ? birthTimeOccurrenceFromProfile(user) ?? null : null });
}

export async function PATCH(request: NextRequest) {
  if (!(await isNatalChartEnabled())) return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  const auth = await resolveBirthProfileUserContext();
  if (!auth.ok) return profileAuthFailureResponse(auth.reason);
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_chart_recompute");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const occurrence = body?.occurrence;
  if (occurrence !== "earlier" && occurrence !== "later" && occurrence !== null) return NextResponse.json({ error: "Выберите первое или второе наступление времени." }, { status: 400 });
  const saved = await withTransaction(async client => {
    const user = (await queryClient<{ birth_date: string; birth_time: string | null; birth_city: string | null }>(client,
      "SELECT birth_date::text, birth_time::text, birth_city FROM users WHERE id=$1 FOR UPDATE", [auth.profileUserId])).rows[0];
    if (!user?.birth_date) return false;
    const choice = occurrence ? { occurrence, profileFingerprint: buildBirthFingerprint({ birthDate: user.birth_date, birthTime: user.birth_time, birthCity: user.birth_city }) } : null;
    await queryClient(client, "UPDATE users SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) || jsonb_build_object('natalBirthTime', $2::jsonb) WHERE id=$1", [auth.profileUserId, JSON.stringify(choice)]);
    return true;
  });
  if (!saved) return NextResponse.json({ error: "Заполните дату рождения в профиле." }, { status: 400 });
  return NextResponse.json({ occurrence });
}
