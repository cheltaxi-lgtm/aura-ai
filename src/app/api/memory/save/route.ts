import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { resolveApiCharacterId, sanitizeChatHistory } from "@/lib/chat-sanitize";
import {
  generateSessionSummary,
  saveSessionMemory,
} from "@/lib/session-memory";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    if (!profileUserId) {
      return NextResponse.json({ error: "profile_required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const characterKey = await resolveApiCharacterId(body.characterKey ?? body.characterId);
    const messages = sanitizeChatHistory(
      (body.messages ?? []) as { role: string; content: string }[]
    );
    const cardNames = (body.cardNames ?? body.keyCards ?? []) as string[];
    const outcomeRating =
      typeof body.outcomeRating === "number" ? body.outcomeRating : undefined;

    if (body.topicSummary && body.prediction) {
      await saveSessionMemory({
        userId: profileUserId,
        characterKey,
        topicSummary: String(body.topicSummary).slice(0, 500),
        keyCards: Array.isArray(cardNames) ? cardNames.slice(0, 5) : [],
        prediction: String(body.prediction).slice(0, 1000),
        mood: body.mood ? String(body.mood).slice(0, 100) : undefined,
        outcomeRating,
      });
      return NextResponse.json({ ok: true, saved: true });
    }

    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns < 3) {
      return NextResponse.json(
        { error: "min_messages", message: "Нужно минимум 3 сообщения клиента" },
        { status: 400 }
      );
    }

    const transcript = messages
      .slice(-16)
      .map((m) => `${m.role === "user" ? "Клиент" : "Мастер"}: ${m.content}`)
      .join("\n");

    const summary = await generateSessionSummary(transcript, cardNames);
    if (!summary) {
      return NextResponse.json({ error: "summary_failed" }, { status: 502 });
    }

    await saveSessionMemory({
      userId: profileUserId,
      characterKey,
      topicSummary: summary.topicSummary,
      keyCards: summary.keyCards,
      prediction: summary.prediction,
      mood: summary.mood,
      outcomeRating,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Memory save error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
