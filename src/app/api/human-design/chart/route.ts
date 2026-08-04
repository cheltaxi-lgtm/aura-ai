import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { isHumanDesignEnabled } from "@/lib/settings";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  getHdChartByFingerprint,
  getOrComputeHdChart,
  HdInputError,
} from "@/lib/services/human-design-service";
import type { HdChartIdentity } from "@/lib/human-design";
import { rememberHdChartFact } from "@/lib/human-design/memory";

function hdErrorResponse(error: unknown) {
  if (error instanceof HdInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.warn("[human-design] chart failed");
  return NextResponse.json(
    { error: "Не удалось рассчитать карту Дизайна Человека." },
    { status: 500 }
  );
}

/** Public get-or-compute. Guests receive the chart + fingerprint capability. */
export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { allowed } = await checkRateLimit(
    rateLimitKey("hd_chart_public", clientIp(request)),
    20,
    60_000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const identity: HdChartIdentity = {
    birthDate: typeof body.birthDate === "string" ? body.birthDate : "",
    birthTime:
      typeof body.birthTime === "string" && body.birthTime ? body.birthTime : null,
    timezone: typeof body.timezone === "string" ? body.timezone : "",
    placeName: typeof body.placeName === "string" ? body.placeName : "",
    lat: Number(body.lat),
    lon: Number(body.lon),
  };

  const auth = await requireUserAuth();
  const userId = auth ? await getProfileUserIdForAccount(auth.sub) : null;

  const subject =
    body.subjectKind === "other"
      ? {
          kind: "other" as const,
          name: typeof body.subjectName === "string" ? body.subjectName : null,
        }
      : { kind: "self" as const, name: null };

  try {
    const chart = await getOrComputeHdChart(identity, userId, subject);
    // Memory facts describe the client — only self charts belong there.
    if (userId && chart.subjectKind === "self") {
      rememberHdChartFact(userId, chart.chart, chart.id);
    }
    return NextResponse.json({ chart, owned: Boolean(userId) });
  } catch (error) {
    return hdErrorResponse(error);
  }
}

/** Fetch a previously computed chart by its fingerprint capability. */
export async function GET(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { allowed } = await checkRateLimit(
    rateLimitKey("hd_chart_public", clientIp(request)),
    20,
    60_000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const fingerprint = request.nextUrl.searchParams.get("fingerprint") ?? "";
  const chart = await getHdChartByFingerprint(fingerprint);
  if (!chart) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }
  return NextResponse.json({ chart });
}
