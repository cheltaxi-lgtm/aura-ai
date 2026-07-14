import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { parseTimingHorizon } from "@/lib/natal/timing";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // #region agent log
  console.info("[agent-debug-82087b]", JSON.stringify({
    runId: "timing-rate-limit-pre-fix",
    hypothesisId: "H1,H2,H3,H4,H5",
    location: "natal-chart/timing/route.ts:GET",
    message: "Timing API request entered",
    data: { horizon: request.nextUrl.searchParams.get("horizon") ?? "30" },
    timestamp: Date.now(),
  }));
  // #endregion
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_timing");
  if (limited) {
    // #region agent log
    console.info("[agent-debug-82087b]", JSON.stringify({
      runId: "timing-rate-limit-pre-fix",
      hypothesisId: "H1,H2,H3,H4,H5",
      location: "natal-chart/timing/route.ts:rateLimit",
      message: "Timing API request rate limited",
      data: {
        status: limited.status,
        retryAfter: limited.headers.get("retry-after"),
        horizon: request.nextUrl.searchParams.get("horizon") ?? "30",
      },
      timestamp: Date.now(),
    }));
    // #endregion
    return limited;
  }
  const horizon = parseTimingHorizon(request.nextUrl.searchParams.get("horizon") ?? "30");
  if (!horizon) {
    return NextResponse.json({ error: "horizon must be one of 7, 30, 90, 365" }, { status: 400 });
  }
  try {
    const result = await getOrComputePersonalTiming(auth.profileUserId, horizon);
    // #region agent log
    console.info("[agent-debug-82087b]", JSON.stringify({
      runId: "timing-rate-limit-pre-fix",
      hypothesisId: "H1,H2,H3,H4,H5",
      location: "natal-chart/timing/route.ts:success",
      message: "Timing API request completed",
      data: {
        horizon,
        cached: result.cached,
        eventCount: Array.isArray(result.timing.events) ? result.timing.events.length : null,
      },
      timestamp: Date.now(),
    }));
    // #endregion
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    // #region agent log
    console.info("[agent-debug-82087b]", JSON.stringify({
      runId: "timing-rate-limit-pre-fix",
      hypothesisId: "H1,H2,H3,H4,H5",
      location: "natal-chart/timing/route.ts:error",
      message: "Timing API request failed",
      data: {
        horizon,
        errorCode: error instanceof Error ? error.message : "NON_ERROR",
      },
      timestamp: Date.now(),
    }));
    // #endregion
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
