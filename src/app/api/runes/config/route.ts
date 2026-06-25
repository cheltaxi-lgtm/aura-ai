import { NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { getRuneSettings, serializeRuneConfig } from "@/lib/rune-settings";
import { getLegacyPrices } from "@/lib/yukassa";

export async function GET() {
  const settings = await getRuneSettings();
  const config = serializeRuneConfig(settings);
  const legacyPrices = await getLegacyPrices();

  let packages: {
    id: string;
    name: string;
    runes: number;
    price_rub: number;
    bonus_runes: number;
    is_popular: boolean;
  }[] = [];

  if (settings.enabled && (await ensureDb())) {
    const { rows } = await query<{
      id: string;
      name: string;
      runes: number;
      price_rub: number;
      bonus_runes: number;
      is_popular: boolean;
    }>("SELECT id, name, runes, price_rub, bonus_runes, is_popular FROM rune_packages ORDER BY sort_order ASC");
    packages = rows;
  }

  return NextResponse.json({
    ...config,
    packages,
    legacyPrices: {
      single: legacyPrices.single,
      subscription: legacyPrices.subscription,
    },
  });
}
