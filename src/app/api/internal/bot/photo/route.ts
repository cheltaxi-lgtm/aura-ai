import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botPhotoAction } from "@/lib/telegram/bot-photo-service";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";
import { isPhotoReadingEnabled } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 180;

const ACTIONS = new Set([
  "pricing",
  "list",
  "get",
  "delete",
  "recognize",
  "interpret",
] as const);

type PhotoAction = "pricing" | "list" | "get" | "delete" | "recognize" | "interpret";

export async function POST(request: NextRequest) {
  if (!(await isPhotoReadingEnabled())) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 404 });
  }

  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const rawAction = typeof body.action === "string" ? body.action : "list";
  const action = (ACTIONS.has(rawAction as PhotoAction) ? rawAction : "list") as PhotoAction;

  const result = await botPhotoAction({
    telegramUserId,
    action,
    historyId: typeof body.history_id === "string" ? body.history_id : undefined,
    imageBase64: typeof body.image_base64 === "string" ? body.image_base64 : undefined,
    mimeType: typeof body.mime_type === "string" ? body.mime_type : undefined,
    characterId: typeof body.character_id === "string" ? body.character_id : undefined,
    question: typeof body.question === "string" ? body.question : undefined,
    confirmedSpread:
      body.confirmed_spread && typeof body.confirmed_spread === "object"
        ? (body.confirmed_spread as RedrawSpread)
        : undefined,
    idempotencyKey:
      typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
  });

  if (!result.ok) {
    const status =
      result.error === "needs_link" || result.error === "needs_onboarding"
        ? 403
        : result.error === "insufficient_runes"
          ? 402
          : result.error === "not_found"
            ? 404
            : result.error === "vision_unavailable" || result.error === "generation_failed"
              ? 502
              : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
