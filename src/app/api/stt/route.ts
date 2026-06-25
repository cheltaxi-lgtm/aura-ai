import { NextRequest, NextResponse } from "next/server";

import { requireUserAuth } from "@/lib/require-auth";
import { enforceSttRateLimit } from "@/lib/api-guards";
import { isSttConfigured, normalizeSttAudioFormat, transcribeSpeech } from "@/lib/stt";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ configured: isSttConfigured() });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceSttRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  if (!isSttConfigured()) {
    return NextResponse.json(
      { error: "STT not configured", code: "not_configured" },
      { status: 503 }
    );
  }

  let audio = "";
  let format = "webm";
  let language = "ru";

  try {
    const body = await request.json();
    audio = String(body.audio ?? "").trim();
    format = String(body.format ?? "webm").trim() || "webm";
    if (typeof body.language === "string" && body.language.trim()) {
      language = body.language.trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!audio) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const normalizedFormat = normalizeSttAudioFormat(format);
  const allowed = new Set(["webm", "wav", "mp3", "flac", "ogg", "m4a", "aac", "mp4"]);
  if (!allowed.has(normalizedFormat)) {
    return NextResponse.json({ error: "unsupported_format" }, { status: 400 });
  }

  const byteLength = Math.floor((audio.length * 3) / 4);
  if (byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  const result = await transcribeSpeech({
    audioBase64: audio,
    format: normalizedFormat,
    language,
  });

  if (!result?.text) {
    return NextResponse.json(
      { error: "transcription_failed", message: "Не удалось распознать речь." },
      { status: 502 }
    );
  }

  return NextResponse.json({ text: result.text });
}
