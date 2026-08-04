import { NextRequest, NextResponse } from "next/server";
import { isHumanDesignEnabled } from "@/lib/settings";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { computeTransits } from "@/lib/human-design";

/** Current HD transits (activations for "now"). Public, cached 5 minutes. */
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
    return NextResponse.json(
      { at: new Date(at).toISOString(), activations },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Не удалось рассчитать текущие транзиты." },
      { status: 500 }
    );
  }
}
