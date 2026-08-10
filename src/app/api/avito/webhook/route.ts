import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureDb } from "@/lib/db";
import { getAvitoWebhookSecret, isAvitoEnabled } from "@/lib/avito/config";
import {
  ingestAvitoWebhookMessage,
  type AvitoWebhookMessageValue,
} from "@/modules/pro/avito/service";

function isValidToken(provided: string | null): boolean {
  const expected = getAvitoWebhookSecret();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAvitoEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isValidToken(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await ensureDb();
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    payload?: { type?: string; value?: AvitoWebhookMessageValue };
  } | null;

  if (body?.type !== "message" || !body.payload?.value) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await ingestAvitoWebhookMessage(body.payload.value);
  } catch (err) {
    // Still 200: Avito redelivers on non-200, and the event is idempotent —
    // a poisoned payload must not block the queue behind it.
    console.error("[avito] webhook ingest failed", err);
  }
  return NextResponse.json({ ok: true });
}
