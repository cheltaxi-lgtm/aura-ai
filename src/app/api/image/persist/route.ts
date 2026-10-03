import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";

/** Older clients patched many readings by card names. Generation now owns exact persistence. */
export async function POST() {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "Обновите страницу, чтобы открыть сохранённую иллюстрацию.", code: "scene_persist_retired" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
