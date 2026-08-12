import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { getHomeRecapHiddenKey, setHomeRecapHiddenKey } from "@/lib/home-recap";

export const runtime = "nodejs";

/** Persist which home recap the user dismissed (display preference only). */
export async function PATCH(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "needs_profile" }, { status: 400 });
  }

  let body: { hiddenKey?: unknown };
  try {
    body = (await request.json()) as { hiddenKey?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const hiddenKey = typeof body.hiddenKey === "string" ? body.hiddenKey.trim() : "";
  if (!hiddenKey || hiddenKey.length > 200) {
    return NextResponse.json({ error: "hiddenKey_required" }, { status: 400 });
  }

  try {
    const saved = await setHomeRecapHiddenKey(profileUserId, hiddenKey);
    return NextResponse.json({ ok: true, homeRecapHiddenKey: saved });
  } catch (err) {
    console.error("home-recap hide failed:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ homeRecapHiddenKey: null });
  }
  const homeRecapHiddenKey = await getHomeRecapHiddenKey(profileUserId);
  return NextResponse.json({ homeRecapHiddenKey });
}
