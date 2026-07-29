import {
  getAllSpreadIntents,
  getFeaturedSpreadIntents,
  getSpreadIntentBySlug,
  getSpreadIntentsByCategory,
} from "@/lib/spread-intents/registry";
import {
  resolveIntentCopy,
  type UserGender,
} from "@/lib/spread-intents/gender-copy";
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
  // Bot thin client always runs Veronika triplet via /api/internal/bot/spread
  // with the intent question (gender-adapted). Full geometry / partner forms stay on site.
  return Boolean(intent.questionTemplate?.trim());
}

function toItem(intent: SpreadIntentDefinition, userGender?: UserGender): BotCatalogItem {
  const spread = getSpread(intent.spreadId);
  const startPath = buildSpreadStartUrl(intent);
  // Same gender adaptation as /rasklady (male → «она», female/null → seed «он»).
  const copy = resolveIntentCopy(intent, userGender);
  const shortBase = intent.shortTitle?.trim();
  const title = shortBase
    ? resolveIntentCopy(
        { ...intent, title: shortBase, intro: shortBase, questionTemplate: shortBase },
        userGender
      ).title
    : copy.title;

  return {
    id: intent.slug,
    title,
    description: (copy.intro || intent.description || "").slice(0, 280),
    category: intent.category,
    categoryLabel: SPREAD_INTENT_CATEGORY_LABELS[intent.category],
    spreadId: intent.spreadId,
    cardCount: spread.cardCount,
    cost: estimateIntentRuneCost(intent.spreadId),
    masterId: resolveIntentMasterId(intent),
    questionTemplate: copy.questionTemplate,
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

export function getBotCatalogFeatured(
  limit = 12,
  userGender?: UserGender
): BotCatalogItem[] {
  const featured = getFeaturedSpreadIntents(limit);
  if (featured.length > 0) return featured.map((i) => toItem(i, userGender));
  return getAllSpreadIntents()
    .slice(0, limit)
    .map((i) => toItem(i, userGender));
}

export function getBotCatalogPage(input: {
  category?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  featured?: boolean;
  userGender?: UserGender;
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
  const userGender = input.userGender;

  let list = featuredOnly
    ? getFeaturedSpreadIntents(200)
    : category
      ? getSpreadIntentsByCategory(category)
      : getAllSpreadIntents();
  if (q) {
    list = list.filter((i) => {
      const copy = resolveIntentCopy(i, userGender);
      return (
        copy.title.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q) ||
        copy.intro.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        copy.questionTemplate.toLowerCase().includes(q) ||
        i.questionTemplate.toLowerCase().includes(q)
      );
    });
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = list
    .slice(safePage * pageSize, safePage * pageSize + pageSize)
    .map((i) => toItem(i, userGender));

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

export function getBotCatalogItem(
  slug: string,
  userGender?: UserGender
): BotCatalogItem | null {
  const intent = getSpreadIntentBySlug(slug.trim());
  return intent ? toItem(intent, userGender) : null;
}

export function getBotCatalogSummary(userGender?: UserGender): {
  total: number;
  categories: BotCatalogCategory[];
  featured: BotCatalogItem[];
  gender: UserGender;
} {
  return {
    total: getAllSpreadIntents().length,
    categories: listBotCatalogCategories(),
    featured: getBotCatalogFeatured(8, userGender),
    gender: userGender ?? null,
  };
}
