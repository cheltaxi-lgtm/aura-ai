import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  requireUserAuth,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { isHumanDesignEnabled } from "@/lib/settings";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  deleteHdChartForUser,
  getHdChartByFingerprint,
  getOrComputeHdChart,
  HdInputError,
  HdRateLimitError,
  toPublicHdChartPayload,
} from "@/lib/services/human-design-service";
import type { HdChartIdentity } from "@/lib/human-design";
import { forgetHdChartFact, rememberHdChartFact } from "@/lib/human-design/memory";

function hdErrorResponse(error: unknown) {
  if (error instanceof HdInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof HdRateLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
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
  const birthTimeRaw = typeof body.birthTime === "string" ? body.birthTime.trim() : "";
  const identity: HdChartIdentity = {
    birthDate: typeof body.birthDate === "string" ? body.birthDate.trim() : "",
    birthTime: birthTimeRaw || null,
    timezone: typeof body.timezone === "string" ? body.timezone : "",
    placeName: typeof body.placeName === "string" ? body.placeName : "",
    lat: Number(body.lat),
    lon: Number(body.lon),
  };

  const auth = await requireUserAuth();
  const userId = auth ? await getProfileUserIdForAccount(auth.sub) : null;

  // Guests get a tighter write budget: every anonymous POST may insert a full
  // chart row (JSONB) into the shared pool. Reads (GET) stay at 20/min.
  if (!userId) {
    const { allowed: guestAllowed } = await checkRateLimit(
      rateLimitKey("hd_chart_guest_post", clientIp(request)),
      5,
      60_000
    );
    if (!guestAllowed) {
      return NextResponse.json({ error: "rate_limit" }, { status: 429 });
    }
  }

  const subject =
    body.subjectKind === "other"
      ? {
          kind: "other" as const,
          name: typeof body.subjectName === "string" ? body.subjectName : null,
        }
      : { kind: "self" as const, name: null };
  const claimToken =
    typeof body.claimToken === "string" ? body.claimToken : null;

  try {
    const { row, claimToken: grantedToken } = await getOrComputeHdChart(
      identity,
      userId,
      subject,
      claimToken
    );
    // Memory facts describe the client — only their own self charts belong there.
    if (userId && row.userId === userId && row.subjectKind === "self") {
      rememberHdChartFact(userId, row.chart, row.id);
    }
    return NextResponse.json({
      chart: toPublicHdChartPayload(row),
      owned: Boolean(userId && row.userId === userId),
      ...(grantedToken ? { claimToken: grantedToken } : {}),
    });
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
  // Public capability URL: strip owner id, coordinates and timezone (PII).
  const payload = toPublicHdChartPayload(chart);
  if (chart.userId) {
    // An owned row's subject label is private (e.g. a partner's name) — never
    // expose it on the unauthenticated capability URL. Guest-pool rows keep
    // the label so the creating browser can restore its own view.
    payload.subjectKind = "self";
    payload.subjectName = null;
  }
  return NextResponse.json({ chart: payload });
}

/**
 * Delete an owned chart. Accepts the chart id or a report id (cabinet
 * history rows reference reports). Cascades to report + chat messages.
 */
export async function DELETE(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_delete");
  if (rateLimited) return rateLimited;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Некорректный идентификатор карты." }, { status: 400 });
  }

  const deleted = await deleteHdChartForUser(id, resolved.profileUserId);
  if (!deleted) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }
  if (deleted.subjectKind === "self") {
    forgetHdChartFact(resolved.profileUserId, deleted.id);
  }
  return NextResponse.json({
    ok: true,
    chartId: deleted.id,
    fingerprint: deleted.fingerprint,
    // HD facts feed Evelina's chat context — the cabinet clears her cache.
    characterKey: "numerolog",
  });
}
