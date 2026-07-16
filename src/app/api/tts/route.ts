import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceTtsRateLimit } from "@/lib/api-guards";
import { isTtsConfigured, isTtsEnabled, synthesizeSpeech } from "@/lib/tts";
import { getSetting } from "@/lib/settings";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";
import { isCharacterTtsEnabled } from "@/lib/voice-config";

export const maxDuration = 300;

const MAX_REQUEST_CHARS = 50000;

export async function GET() {
  const tts = await getSetting("tts");
  return NextResponse.json({
    enabled: tts.enabled === true,
    configured: isTtsConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceTtsRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  if (!(await isTtsEnabled())) {
    return NextResponse.json(
      { error: "Озвучка отключена администратором", code: "disabled" },
      { status: 503 }
    );
  }

  if (!isTtsConfigured()) {
    return NextResponse.json(
      { error: "Озвучка временно недоступна", code: "browser_fallback" },
      { status: 503 }
    );
  }

  let text = "";
  let characterId = "veronika";

  try {
    const body = await request.json();
    text = String(body.text ?? "").trim();
    characterId = await resolveApiCharacterId(body.characterId ?? characterId);
  } catch {
    return NextResponse.json({ error: "Не удалось обработать запрос" }, { status: 400 });
  }

  if (!isCharacterTtsEnabled(characterId)) {
    return NextResponse.json(
      { error: "Озвучка для этого наставника недоступна", code: "browser_fallback" },
      { status: 403 }
    );
  }

  if (!text) {
    return NextResponse.json({ error: "Нет текста для озвучки" }, { status: 400 });
  }

  if (text.length > MAX_REQUEST_CHARS) {
    return NextResponse.json({ error: "Текст слишком длинный для озвучки" }, { status: 400 });
  }

  try {
    const result = await synthesizeSpeech(text, characterId);
    if (!result) {
      return NextResponse.json(
        { error: "Не удалось озвучить ответ", code: "browser_fallback" },
        { status: 502 }
      );
    }

    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=86400",
      "X-TTS-Provider": result.provider,
      ...(result.model ? { "X-TTS-Model": result.model } : {}),
      ...(result.chunks && result.chunks > 1 ? { "X-TTS-Chunks": String(result.chunks) } : {}),
    };

    if (result.parts && result.parts.length > 1) {
      return NextResponse.json(
        {
          parts: result.parts.map((part) => Buffer.from(part).toString("base64")),
          contentType: result.contentType,
          provider: result.provider,
          model: result.model,
          chunks: result.parts.length,
        },
        { status: 200, headers }
      );
    }

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": result.contentType,
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Озвучка временно недоступна", code: "browser_fallback" },
      { status: 500 }
    );
  }
}
