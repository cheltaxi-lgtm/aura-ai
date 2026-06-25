import { NextRequest, NextResponse } from "next/server";

import { DAILY_CARDS } from "@/lib/characters";
import { completeChat } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceDailyCardRateLimit } from "@/lib/api-guards";
import { stripControlChars, resolveApiCharacterId } from "@/lib/chat-sanitize";
import { stripStageDirections } from "@/lib/chat-reply-sanitize";
import { buildSystemPrompt, isCharacterKey } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforceDailyCardRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const rawName = typeof body.cardName === "string" ? stripControlChars(body.cardName).trim() : "";
  const card = DAILY_CARDS.find((c) => c.name === rawName) ?? DAILY_CARDS[0];

  const rawMaster = typeof body.characterId === "string" ? body.characterId : "veronika";
  const resolved = await resolveApiCharacterId(rawMaster);
  const characterKey = isCharacterKey(resolved) ? resolved : "veronika";

  const userName =
    typeof body.userName === "string" && body.userName.trim()
      ? stripControlChars(body.userName).trim().slice(0, 80)
      : "странник";

  try {
    const personaPrompt = buildSystemPrompt(
      characterKey,
      {
        name: userName,
        zodiac: typeof body.zodiac === "string" ? body.zodiac.slice(0, 40) : "не указан",
        birthDate: typeof body.birthDate === "string" ? body.birthDate.slice(0, 20) : "не указана",
        cards: [card.name],
        isPaid: true,
      },
      { mode: "chat", lastUserMessage: "карта дня" }
    );

    const systemPrompt = await wrapSystemPrompt(
      `${personaPrompt}

РЕЖИМ КАРТЫ ДНЯ:
Дай короткое предсказание на сегодня (2–4 предложения) по одной выпавшей карте.
Сохраняй стиль мастера. Прямо и честно — если карта предупреждает, скажи это.
Только текст предсказания — без ремарок в скобках и без описания голоса.`
    );

    const prediction = await completeChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Карта дня: «${card.name}». Базовое значение: ${card.meaning}. Дай предсказание на сегодня.`,
        },
      ],
      maxTokens: 220,
      temperature: 0.88,
      isPaid: false,
    });

    return NextResponse.json({
      prediction: stripStageDirections(prediction ?? "") || card.meaning,
      characterId: characterKey,
      cardName: card.name,
    });
  } catch {
    return NextResponse.json({ prediction: card.meaning, characterId: characterKey, cardName: card.name });
  }
}
