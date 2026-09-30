import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getRuneSettings } from "@/lib/rune-settings";
import { getAllSpreadIntents } from "@/lib/spread-intents";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import { isDailyOnlySpread, isSpreadSessionAllowed } from "@/lib/spreads";
import { resolveSpreadCost } from "@/lib/spreads/spread-pricing";

export const dynamic = "force-dynamic";

type PriceResult = { prices: Record<string, number> } | { error: string };
let cached: { result: PriceResult; status: number; until: number } | null = null;
let inflight: Promise<{ result: PriceResult; status: number }> | null = null;

async function loadPrices(): Promise<{ result: PriceResult; status: number }> {
  if (cached && cached.until > Date.now()) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    if (!(await ensureDb())) return { result: { error: "Pricing unavailable" }, status: 503 };
    await ensureSpreadCatalogSettingsLoaded();
    const settings = await getRuneSettings();
    const prices: Record<string, number> = {};
    for (const intent of getAllSpreadIntents()) {
      if (isDailyOnlySpread(intent.spreadId) || !isSpreadSessionAllowed(intent.spreadId)) continue;
      prices[intent.spreadId] = resolveSpreadCost(intent.spreadId, settings);
    }
    return { result: { prices }, status: 200 };
  })().catch(() => ({ result: { error: "Pricing unavailable" }, status: 503 })).then((value) => {
    cached = { ...value, until: Date.now() + (value.status === 200 ? 5_000 : 2_000) };
    return value;
  }).finally(() => { inflight = null; });
  return inflight;
}

export async function GET() {
  const { result, status } = await loadPrices();
  return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
