import { NextRequest, NextResponse } from "next/server";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getNatalEventPreferences,
  updateNatalEventPreferences,
} from "@/lib/services/natal-timing-service";

async function authenticate() {
  const auth = await requireProfileUserId();
  if (!auth) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_event_preferences");
  return limited ? { response: limited } : { userId: auth.profileUserId };
}

export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ preferences: await getNatalEventPreferences(auth.userId) });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить настройки событий." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const preferences = await updateNatalEventPreferences(auth.userId, body);
    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INVALID_")) {
      return NextResponse.json({ error: error.message.toLowerCase() }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось сохранить настройки событий." }, { status: 500 });
  }
}
