import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { parseTimingHorizon } from "@/lib/natal/timing";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_timing");
  if (limited) return limited;
  const horizon = parseTimingHorizon(request.nextUrl.searchParams.get("horizon") ?? "30");
  if (!horizon) {
    return NextResponse.json({ error: "horizon must be one of 7, 30, 90, 365" }, { status: 400 });
  }
  try {
    const result = await getOrComputePersonalTiming(auth.profileUserId, horizon);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TIMING_GENERATION_BUSY") {
      return NextResponse.json(
        { error: "Расчёт уже выполняется. Повторите запрос через несколько секунд." },
        { status: 409, headers: { "Retry-After": "5" } }
      );
    }
    if (error instanceof Error && (
      error.message === "TIMING_CHART_INCOMPLETE" || error.message === "TIMING_BIRTH_DATE_MISSING"
    )) {
      return NextResponse.json({ error: "Для расчёта заполните дату и место рождения." }, { status: 422 });
    }
    console.warn("[natal-timing] calculation failed");
    return NextResponse.json({ error: "Не удалось рассчитать персональные периоды." }, { status: 500 });
  }
}
