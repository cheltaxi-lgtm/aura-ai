import {
  getAllSpreadIntents,
  getFeaturedSpreadIntents,
  getSpreadIntentBySlug,
  getSpreadIntentsByCategory,
} from "@/lib/spread-intents/registry";
import {
  buildIntentSeoUrl,
  buildSpreadStartUrl,
  estimateIntentRuneCost,
} from "@/lib/spread-intents/router";
import {
  SPREAD_INTENT_CATEGORY_LABELS,
  type SpreadIntentCategory,
  type SpreadIntentDefinition,
} from "@/lib/spread-intents/types";
import { getSpread } from "@/lib/spreads/registry";
import { resolveIntentMasterId } from "@/lib/spread-intents/resolve-master";

export type BotCatalogItem = {
  id: string;
  title: string;
  description: string;
  category: SpreadIntentCategory;
  categoryLabel: string;
  spreadId: string;
  cardCount: number;
  cost: number;
  masterId: string;
  questionTemplate: string;
  positionsPreview: string[];
  url: string;
  seoUrl: string;
  /** Bot can run this without partner forms (triplet geometry only for now). */
  native: boolean;
  requiresPartnerInfo: boolean;
  isFeatured: boolean;
};

export type BotCatalogCategory = {
  id: SpreadIntentCategory;
  title: string;
  count: number;
};

const CATEGORY_ORDER: SpreadIntentCategory[] = [
  "love",
  "career",
  "money",
  "future",
  "self",
  "choice",
  "family",
  "ritual",
];

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

function withUtm(path: string): string {
  const base = siteBase();
  const url = new URL(path.startsWith("http") ? path : `${base}${path}`);
  url.searchParams.set("utm_source", "telegram");
  url.searchParams.set("utm_medium", "bot");
  url.searchParams.set("utm_campaign", "spread_catalog");
  return url.toString();
}

function isNativeInBot(intent: SpreadIntentDefinition): boolean {
  if (intent.requiresPartnerInfo) return false;
  const spread = getSpread(intent.spreadId);
  // Bot collage/presentation currently supports 1–3 card faces well.
  return spread.cardCount <= 3 && (intent.spreadId === "triplet" || intent.spreadId === "single" || intent.spreadId === "yes-no" || intent.spreadId === "runes-yes-no" || intent.spreadId === "triplet-love");
}

function toItem(intent: SpreadIntentDefinition): BotCatalogItem {
  const spread = getSpread(intent.spreadId);
  const startPath = buildSpreadStartUrl(intent);
  return {
    id: intent.slug,
    title: intent.shortTitle?.trim() || intent.title,
    description: (intent.intro || intent.description || "").slice(0, 280),
    category: intent.category,
    categoryLabel: SPREAD_INTENT_CATEGORY_LABELS[intent.category],
    spreadId: intent.spreadId,
    cardCount: spread.cardCount,
    cost: estimateIntentRuneCost(intent.spreadId),
    masterId: resolveIntentMasterId(intent),
    questionTemplate: intent.questionTemplate,
    positionsPreview: intent.positionsPreview?.slice(0, 8) ?? [],
    url: withUtm(startPath),
    seoUrl: withUtm(buildIntentSeoUrl(intent)),
    native: isNativeInBot(intent),
    requiresPartnerInfo: Boolean(intent.requiresPartnerInfo),
    isFeatured: Boolean(intent.isFeatured),
  };
}

export function listBotCatalogCategories(): BotCatalogCategory[] {
  return CATEGORY_ORDER.map((id) => ({
    id,
    title: SPREAD_INTENT_CATEGORY_LABELS[id],
    count: getSpreadIntentsByCategory(id).length,
  })).filter((c) => c.count > 0);
}

export function getBotCatalogFeatured(limit = 12): BotCatalogItem[] {
  const featured = getFeaturedSpreadIntents(limit);
  if (featured.length > 0) return featured.map(toItem);
  return getAllSpreadIntents().slice(0, limit).map(toItem);
}

export function getBotCatalogPage(input: {
  category?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  featured?: boolean;
}): {
  items: BotCatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  category: SpreadIntentCategory | null;
  featured: boolean;
} {
  const pageSize = Math.min(20, Math.max(4, input.pageSize ?? 8));
  const page = Math.max(0, Math.floor(input.page ?? 0));
  const q = (input.q || "").trim().toLowerCase();
  const catRaw = (input.category || "").trim() as SpreadIntentCategory;
  const category = CATEGORY_ORDER.includes(catRaw) ? catRaw : null;
  const featuredOnly = Boolean(input.featured);

  let list = featuredOnly
    ? getFeaturedSpreadIntents(200)
    : category
      ? getSpreadIntentsByCategory(category)
      : getAllSpreadIntents();
  if (q) {
    list = list.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.questionTemplate.toLowerCase().includes(q)
    );
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = list.slice(safePage * pageSize, safePage * pageSize + pageSize).map(toItem);

  return {
    items: slice,
    page: safePage,
    pageSize,
    total,
    totalPages,
    category,
    featured: featuredOnly,
  };
}

export function getBotCatalogItem(slug: string): BotCatalogItem | null {
  const intent = getSpreadIntentBySlug(slug.trim());
  return intent ? toItem(intent) : null;
}

export function getBotCatalogSummary(): {
  total: number;
  categories: BotCatalogCategory[];
  featured: BotCatalogItem[];
} {
  return {
    total: getAllSpreadIntents().length,
    categories: listBotCatalogCategories(),
    featured: getBotCatalogFeatured(8),
  };
}
