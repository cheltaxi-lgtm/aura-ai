import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  computeAndStoreNatalChart,
  getOrComputeNatalChart,
} from "@/lib/services/natal-chart-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

function natalCalculationError(error: unknown) {
  if (error instanceof Error && error.message === "INVALID_BIRTH_DATE") {
    return NextResponse.json(
      { error: "Проверьте дату рождения в профиле." },
      { status: 400 }
    );
  }
  console.warn("[natal-chart] calculation failed");
  return NextResponse.json(
    { error: "Не удалось рассчитать натальную карту." },
    { status: 500 }
  );
}

export async function GET() {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ enabled: false, chart: null });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(ctx.profileUserId, "natal_chart_read");
  if (rateLimited) return rateLimited;

  try {
    const chart = await getOrComputeNatalChart(ctx.profileUserId);
    // Claims are server-side nonces used to serialize paid generation. They
    // are not chart data and must not be exposed in a browser payload.
    if (!chart) return NextResponse.json({ enabled: true, chart: null });
    const { interpretationClaims: _claims, ...clientChart } = chart;
    return NextResponse.json({ enabled: true, chart: clientChart });
  } catch (error) {
    return natalCalculationError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(ctx.profileUserId, "natal_chart_recompute");
  if (rateLimited) return rateLimited;

  try {
    const chart = await computeAndStoreNatalChart(ctx.profileUserId);
    return NextResponse.json({ ok: true, enabled: true, chart });
  } catch (error) {
    return natalCalculationError(error);
  }
}
