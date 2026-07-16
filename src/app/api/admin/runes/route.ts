import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { ensureDb } from "@/lib/db";
import { logAdminAction } from "@/lib/admin";
import { getRuneSettings, setRuneSettings } from "@/lib/rune-settings";
import { setSetting } from "@/lib/settings";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const settings = await getRuneSettings();
  const { rows: packages } = await query(
    "SELECT * FROM rune_packages ORDER BY sort_order ASC"
  );

  return NextResponse.json({ settings, packages });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const body = await request.json();
  const { settings, packages } = body as {
    settings?: Parameters<typeof setRuneSettings>[0];
    packages?: Array<{
      id: string;
      name: string;
      runes: number;
      price_rub: number;
      bonus_runes: number;
      is_popular: boolean;
      sort_order: number;
    }>;
  };

  let updatedSettings = await getRuneSettings();
  if (settings) {
    updatedSettings = await setRuneSettings(settings, auth.sub);
    await setSetting(
      "features",
      { freeQuestionLimit: updatedSettings.freeQuestions },
      auth.sub
    );
    await logAdminAction(auth.sub, "update_settings", "runes", "runes", settings);
  }

  if (packages?.length) {
    const ids = packages.map((p) => p.id);
    const names = packages.map((p) => p.name);
    const runes = packages.map((p) => Math.max(1, Math.round(p.runes)));
    const prices = packages.map((p) => Math.max(1, Math.round(p.price_rub)));
    const bonuses = packages.map((p) => Math.max(0, Math.round(p.bonus_runes)));
    const popular = packages.map((p) => Boolean(p.is_popular));
    const orders = packages.map((p) => Math.round(p.sort_order));

    await query(
      `INSERT INTO rune_packages (id, name, runes, price_rub, bonus_runes, is_popular, sort_order)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::bool[], $7::int[])
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         runes = EXCLUDED.runes,
         price_rub = EXCLUDED.price_rub,
         bonus_runes = EXCLUDED.bonus_runes,
         is_popular = EXCLUDED.is_popular,
         sort_order = EXCLUDED.sort_order`,
      [ids, names, runes, prices, bonuses, popular, orders]
    );
    await logAdminAction(auth.sub, "update_settings", "rune_packages", "rune_packages", {
      count: packages.length,
    });
  }

  const { rows: updatedPackages } = await query(
    "SELECT * FROM rune_packages ORDER BY sort_order ASC"
  );

  return NextResponse.json({
    ok: true,
    settings: updatedSettings,
    packages: updatedPackages,
  });
}
