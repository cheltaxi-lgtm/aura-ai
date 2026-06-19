import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAllSettings, setSetting } from "@/lib/settings";
import { logAdminAction } from "@/lib/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getAllSettings());
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { section, values } = await request.json();
  if (!section || !values || !["ai", "pricing", "features", "prompts", "tts", "visual", "runes"].includes(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const updated = await setSetting(section, values, auth.sub);
  await logAdminAction(auth.sub, "update_settings", section, section, values);
  return NextResponse.json({ ok: true, [section]: updated });
}
