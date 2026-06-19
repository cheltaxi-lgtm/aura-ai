import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { registerInfluencer } from "@/lib/influencers";
import { clientIp, enforceInfluencerRegisterRateLimit } from "@/lib/api-guards";
import { sanitizeTextField } from "@/lib/chat-sanitize";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceInfluencerRegisterRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const name = sanitizeTextField(body.name, 80);
    const telegramLink = sanitizeTextField(body.telegramLink, 200);
    const customPrompt = sanitizeTextField(body.customPrompt, 2000);

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Укажите имя блогера" }, { status: 400 });
    }

    const influencer = await registerInfluencer({
      name,
      telegramLink,
      customPrompt,
    });

    return NextResponse.json({
      ok: true,
      influencer: {
        id: influencer.id,
        name: influencer.name,
        token: influencer.token,
        refUrl: influencer.refUrl,
        balance: influencer.balance,
      },
      split: { blogger: 80, platform: 20 },
    });
  } catch (error) {
    console.error("Influencer register error:", error);
    return NextResponse.json({ error: "Ошибка регистрации блогера" }, { status: 500 });
  }
}
