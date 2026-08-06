import { NextRequest, NextResponse } from "next/server";
import { isHumanDesignEnabled } from "@/lib/settings";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { computeTransits, computeTransitWeek } from "@/lib/human-design";

/** Current HD transits (+ optional week ahead). Public, cached 5 minutes. */
export async function GET(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  // Own bucket: transits polling must not eat the chart-compute allowance.
  const { allowed } = await checkRateLimit(
    rateLimitKey("hd_transits", clientIp(request)),
    30,
    60_000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const at = Date.now();
    const activations = computeTransits(at);
    const daysRaw = Number(request.nextUrl.searchParams.get("days") || "0");
    const days = Number.isFinite(daysRaw) ? Math.min(14, Math.max(0, Math.floor(daysRaw))) : 0;
    const week = days > 0 ? computeTransitWeek(at, days) : undefined;
    return NextResponse.json(
      { at: new Date(at).toISOString(), activations, ...(week ? { week } : {}) },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Не удалось рассчитать текущие транзиты." },
      { status: 500 }
    );
  }
}
