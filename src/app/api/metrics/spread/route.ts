import { NextRequest, NextResponse } from "next/server";

import type { SpreadMetricEvent, SpreadMetricPayload } from "@/lib/spreads/metrics";

export async function POST(request: NextRequest) {
  try {
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

    const payload: SpreadMetricPayload = {
      spreadId: body.spreadId.trim(),
      intention: body.intention ?? null,
      characterId: body.characterId,
      cardCount: body.cardCount,
      cost: body.cost,
      source: body.source,
    };

    console.info(`[metrics] ${body.event} ${JSON.stringify(payload)}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
