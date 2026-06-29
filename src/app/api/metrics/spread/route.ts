import { NextRequest, NextResponse } from "next/server";

import { getProfileUserIdForAccount } from "@/lib/accounts";
import { clientIp, enforceSpreadMetricsRateLimit } from "@/lib/api-guards";
import { requireUserAuth } from "@/lib/require-auth";
import { recordSpreadMetric } from "@/lib/spread-metrics-store";
import { normalizeSpreadId } from "@/lib/spreads";
import type { SpreadMetricEvent, SpreadMetricPayload } from "@/lib/spreads/metrics";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }

    const ip = clientIp(request);
    const limited = await enforceSpreadMetricsRateLimit(ip);
    if (limited) return limited;

    const body = (await request.json().catch(() => ({}))) as {
      event?: SpreadMetricEvent;
      spreadId?: string;
      intention?: string | null;
      characterId?: string;
      cardCount?: number;
      cost?: number;
      source?: string;
    };

    if (body.event !== "spread_selected" && body.event !== "spread_completed") {
      return NextResponse.json({ error: "invalid event" }, { status: 400 });
    }
    if (!body.spreadId?.trim()) {
      return NextResponse.json({ error: "spreadId required" }, { status: 400 });
    }

    const spreadId = normalizeSpreadId(body.spreadId.trim());
    const payload: SpreadMetricPayload = {
      spreadId,
      intention: body.intention ?? null,
      characterId: body.characterId,
      cardCount: body.cardCount,
      cost: body.cost,
      source: body.source,
    };

    const userId = await getProfileUserIdForAccount(auth.sub);

    await recordSpreadMetric(body.event, payload, userId);
    console.info(`[metrics] ${body.event} ${JSON.stringify(payload)}`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
