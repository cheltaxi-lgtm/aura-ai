import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { registerInfluencer } from "@/lib/influencers";
import { clientIp, enforceInfluencerRegisterRateLimit } from "@/lib/api-guards";
import { sanitizeTextField } from "@/lib/chat-sanitize";
import { isExpertRegistrationEnabled } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceInfluencerRegisterRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    if (!(await isExpertRegistrationEnabled())) {
      return NextResponse.json(
        { error: "Регистрация мастеров временно закрыта" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const registerSecret = process.env.INFLUENCER_REGISTER_SECRET;

    // Open registration without secret is allowed only outside production (local/dev).
    if (process.env.NODE_ENV === "production") {
      if (!registerSecret) {
        return NextResponse.json(
          { error: "Influencer registration is not configured" },
          { status: 503 }
        );
      }
      if (body.secret !== registerSecret) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (registerSecret && body.secret !== registerSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
