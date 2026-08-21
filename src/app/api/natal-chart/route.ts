import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveBirthProfileUserContext,
} from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  computeAndStoreNatalChart,
  deleteStoredNatalChart,
  getNatalChartClientView,
} from "@/lib/services/natal-chart-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { stripUnreliableAngles } from "@/lib/natal/western";
import type { NatalChartRecord } from "@/lib/natal/types";

function toClientNatalChart(chart: NatalChartRecord) {
  const { interpretationClaims: _claims, ...rest } = chart;
  if (!rest.timeKnown && rest.western) {
    return { ...rest, western: stripUnreliableAngles(rest.western) };
  }
  return rest;
}

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

  const resolved = await resolveBirthProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "natal_chart_read");
  if (rateLimited) return rateLimited;

  try {
    const view = await getNatalChartClientView(resolved.profileUserId);
    // Claims are server-side nonces used to serialize paid generation. They
    // are not chart data and must not be exposed in a browser payload.
    return NextResponse.json({
      enabled: true,
      chart: view.chart ? toClientNatalChart(view.chart) : null,
      needsRebuild: view.needsRebuild,
      canCompute: view.canCompute,
    });
  } catch (error) {
    return natalCalculationError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveBirthProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "natal_chart_recompute");
  if (rateLimited) return rateLimited;

  try {
    const chart = await computeAndStoreNatalChart(resolved.profileUserId);
    if (!chart) {
      return NextResponse.json({ error: "natal_profile_incomplete" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      enabled: true,
      chart: toClientNatalChart(chart),
      needsRebuild: false,
      canCompute: true,
    });
  } catch (error) {
    return natalCalculationError(error);
  }
}

export async function DELETE() {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveBirthProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "natal_chart_delete");
  if (rateLimited) return rateLimited;

  try {
    const deleted = await deleteStoredNatalChart(resolved.profileUserId);
    return NextResponse.json({
      ok: true,
      deleted,
      enabled: true,
      chart: null,
      needsRebuild: false,
      canCompute: true,
    });
  } catch (error) {
    console.warn("[natal-chart] chart delete failed");
    return NextResponse.json(
      { error: "Не удалось удалить натальную карту." },
      { status: 500 }
    );
  }
}
