import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db";
import { logAdminAction } from "@/lib/admin";
import { getRitualSettings, setRitualSettings } from "@/lib/ritual-settings";
import { RITUAL_TYPES, RITUAL_TYPE_KEYS } from "@/lib/ritual-config";
import {
  getRitualAdminStats,
  listRecentRitualsForAdmin,
} from "@/lib/ritual-service";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const [settings, catalog, stats, recent] = await Promise.all([
    getRitualSettings(),
    Promise.resolve(
      RITUAL_TYPE_KEYS.map((key) => ({
        key,
        label: RITUAL_TYPES[key].label,
        emoji: RITUAL_TYPES[key].emoji,
        desc: RITUAL_TYPES[key].desc,
        defaultCost: RITUAL_TYPES[key].cost,
      }))
    ),
    getRitualAdminStats(),
    listRecentRitualsForAdmin(30),
  ]);

  return NextResponse.json({ settings, catalog, stats, recent });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const body = await request.json();
  const { settings } = body as {
    settings?: Parameters<typeof setRitualSettings>[0];
  };

  if (!settings) {
    return NextResponse.json({ error: "Missing settings" }, { status: 400 });
  }

  const updated = await setRitualSettings(settings, auth.sub);
  await logAdminAction(auth.sub, "update_settings", "rituals", "rituals", settings);

  return NextResponse.json({ ok: true, settings: updated });
}
