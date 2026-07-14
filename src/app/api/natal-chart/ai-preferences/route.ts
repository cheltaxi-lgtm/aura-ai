import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getNatalAiPreferences,
  updateNatalAiPreferences,
} from "@/lib/services/natal-ai-preferences-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isNatalChartEnabled } from "@/lib/settings";

async function authenticate() {
  if (!(await isNatalChartEnabled())) {
    return { response: NextResponse.json({ error: "Feature disabled" }, { status: 404 }) };
  }
  const auth = await requireProfileUserId();
  if (!auth) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_ai_preferences");
  return limited ? { response: limited } : { userId: auth.profileUserId };
}

export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({
      preferences: await getNatalAiPreferences(auth.userId),
    });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить настройку." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json({
      preferences: await updateNatalAiPreferences(auth.userId, body),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NATAL_AI_PREFERENCES") {
      return NextResponse.json({ error: "Некорректная настройка." }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось сохранить настройку." }, { status: 500 });
  }
}
