import { openRouterAppHeaders } from "@/lib/brand";
import { openRouterFetch } from "@/lib/openrouter-fetch";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 10_000;

/** USD per single token, as OpenRouter reports it in the catalog. */
export type ModelUsdPerToken = { input: number; output: number };

type PricingCache = {
  fetchedAt: number;
  byModel: Map<string, ModelUsdPerToken>;
};

/** Last successful catalog snapshot. Kept past TTL as a stale fallback. */
let cache: PricingCache | null = null;
let inFlight: Promise<PricingCache | null> | null = null;

function cacheTtlMs(): number {
  const raw = Number(process.env.OPENROUTER_PRICING_TTL_MS);
  if (Number.isFinite(raw) && raw >= 60_000) return Math.floor(raw);
  return 6 * 60 * 60 * 1000;
}

/**
 * ₽ per $1. The retired static table was calibrated at ~25, which understated
 * real spend roughly threefold; override via env when the rate moves.
 */
export function usdToRubRate(): number {
  const raw = Number(process.env.OPENROUTER_USD_RUB);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 90;
}

type CatalogRow = {
  id?: string;
  pricing?: { prompt?: string; completion?: string };
};

function parseCatalog(payload: unknown): Map<string, ModelUsdPerToken> {
  const rows = (payload as { data?: CatalogRow[] })?.data;
  const byModel = new Map<string, ModelUsdPerToken>();
  if (!Array.isArray(rows)) return byModel;
  for (const row of rows) {
    const id = row?.id?.trim();
    if (!id) continue;
    const input = Number.parseFloat(row.pricing?.prompt ?? "");
    const output = Number.parseFloat(row.pricing?.completion ?? "");
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
    // Free models report "0" — valid, keep them.
    if (input < 0 || output < 0) continue;
    byModel.set(id.toLowerCase(), { input, output });
  }
  return byModel;
}

async function fetchCatalog(): Promise<PricingCache | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    const response = await openRouterFetch(MODELS_URL, {
      method: "GET",
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...openRouterAppHeaders(),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[openrouter-pricing] catalog HTTP ${response.status}`);
      return null;
    }
    const byModel = parseCatalog(await response.json());
    if (!byModel.size) {
      console.warn("[openrouter-pricing] catalog returned no priced models");
      return null;
    }
    return { fetchedAt: Date.now(), byModel };
  } catch (error) {
    console.warn(
      "[openrouter-pricing] catalog fetch failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCatalog(): Promise<PricingCache | null> {
  if (cache && Date.now() - cache.fetchedAt < cacheTtlMs()) return cache;
  if (!inFlight) {
    inFlight = fetchCatalog().finally(() => {
      inFlight = null;
    });
  }
  const fresh = await inFlight;
  if (fresh) cache = fresh;
  // Stale snapshot beats no pricing at all when OpenRouter is unreachable.
  return cache;
}

/** Live USD/token rates for a model, or null when the catalog is unavailable. */
export async function getModelUsdPerToken(
  modelId: string
): Promise<ModelUsdPerToken | null> {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;
  const catalog = await loadCatalog();
  if (!catalog) return null;
  const direct = catalog.byModel.get(id);
  if (direct) return direct;
  // Routing suffixes (":nitro", ":floor", ":free") are not separate catalog rows.
  const base = id.split(":")[0]!;
  return catalog.byModel.get(base) ?? null;
}
