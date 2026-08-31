import type { MetadataRoute } from "next";
import { getAllTarotCardSeoSlugs } from "@/lib/card-seo";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { getAppUrl } from "@/lib/brand";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { getAllSpreadIntents } from "@/lib/spread-intents";
import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import { getAllSeoArticleSlugs } from "@/lib/seo/articles";
import { getAllSpreadHubSlugs } from "@/lib/seo/hubs";
import { isSearchIndexableIntentSlug } from "@/lib/seo/indexability";
import {
  FORECAST_MONTHS,
  FORECAST_YEARS,
} from "@/lib/seo/seasonal";
import { getAllSeoZodiacSlugs } from "@/lib/seo/zodiac-signs";
import { getAllSuitHubSlugs } from "@/lib/seo/suit-hubs";
import { getAllLenormandCombinationSlugs } from "@/lib/seo/lenormand-combinations";
import { getAllRuneMeaningSlugs } from "@/lib/seo/rune-meanings";
import { HD_PROFILE_SEO, HD_TYPE_SEO } from "@/lib/human-design/seo-content";
import {
  ALL_CHANNEL_SLUGS,
  ALL_GATE_SLUGS,
  CENTER_SEO_SLUGS,
} from "@/lib/human-design/seo-entities";
import { HD_PAIR_SLUGS } from "@/lib/human-design/seo-compatibility";
import {
  isAuraReadingEnabled,
  isHumanDesignEnabled,
  isJointReadingEnabled,
  isNatalChartEnabled,
  isPhotoReadingEnabled,
} from "@/lib/settings";
import { getRitualSettings, isRitualCatalogEnabled } from "@/lib/ritual-settings";
import { isProModuleEnabled } from "@/modules/pro/config";

const ABOUT_PATHS = [
  "/about",
  "/about/methodology",
  "/about/how-readings-work",
  "/about/masters",
  "/about/limitations",
  "/about/privacy-practices",
  "/about/personal-memory",
];

const LENORMAND_PATHS = ["/lenormand", "/lenormand/sochetaniya"];

function staticPage(path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"] = "weekly") {
  const base = getAppUrl();
  const now = new Date();
  return {
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl();
  const now = new Date();
  // Kill-switch: disabled modules must vanish from the sitemap (crawl budget +
  // noindexed 404s stay consistent with the middleware gate).
  const [hdEnabled, natalEnabled, jointEnabled, photoEnabled, auraEnabled, ritualSettings] =
    await Promise.all([
      isHumanDesignEnabled().catch(() => true),
      isNatalChartEnabled().catch(() => false),
      isJointReadingEnabled().catch(() => true),
      isPhotoReadingEnabled().catch(() => true),
      isAuraReadingEnabled().catch(() => false),
      getRitualSettings().catch(() => null),
    ]);
  const ritualsEnabled = ritualSettings
    ? isRitualCatalogEnabled(ritualSettings)
    : true;
  const proEnabled = isProModuleEnabled();

  const spreadPages: MetadataRoute.Sitemap = Object.values(SPREAD_REGISTRY)
    .filter((s) => s.seoSlug)
    .map((s) => ({
      url: `${base}/rasklad/${s.seoSlug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const intentPages: MetadataRoute.Sitemap = getAllSpreadIntents()
    .filter((intent) => isSearchIndexableIntentSlug(intent.slug))
    .map((intent) => ({
      url: `${base}/rasklady/${intent.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    }));

  const hubPages: MetadataRoute.Sitemap = getAllSpreadHubSlugs().map((slug) => ({
    url: `${base}/rasklady/${slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const ritualPages: MetadataRoute.Sitemap = ritualsEnabled
    ? Object.values(RITUAL_PAGE_SLUGS).map((slug) => ({
        url: `${base}/obryady/${slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.55,
      }))
    : [];

  const cardPages: MetadataRoute.Sitemap = getAllTarotCardSeoSlugs().map((slug) => ({
    url: `${base}/cards/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const combinationPages: MetadataRoute.Sitemap = getAllCardCombinations().map((combo) => ({
    url: `${base}/cards/combinations/${combo.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.45,
  }));

  const suitHubPages: MetadataRoute.Sitemap = getAllSuitHubSlugs().map((slug) => ({
    url: `${base}/cards/masti/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  const articlePages: MetadataRoute.Sitemap = getAllSeoArticleSlugs().map((slug) => ({
    url: `${base}/statyi/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const lenormandCombinationPages: MetadataRoute.Sitemap = getAllLenormandCombinationSlugs().map((slug) => ({
    url: `${base}/lenormand/sochetaniya/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.45,
  }));

  const runeMeaningPages: MetadataRoute.Sitemap = getAllRuneMeaningSlugs().map((slug) => ({
    url: `${base}/runy/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const hdTypePages: MetadataRoute.Sitemap = HD_TYPE_SEO.map((t) => ({
    url: `${base}/dizayn-cheloveka/tipy/${t.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const hdProfilePages: MetadataRoute.Sitemap = HD_PROFILE_SEO.map((p) => ({
    url: `${base}/dizayn-cheloveka/profili/${p.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const hdGatePages: MetadataRoute.Sitemap = ALL_GATE_SLUGS.map((gate) => ({
    url: `${base}/dizayn-cheloveka/vorota/${gate}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  const hdChannelPages: MetadataRoute.Sitemap = ALL_CHANNEL_SLUGS.map((channel) => ({
    url: `${base}/dizayn-cheloveka/kanaly/${channel}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  const hdCenterPages: MetadataRoute.Sitemap = CENTER_SEO_SLUGS.map((center) => ({
    url: `${base}/dizayn-cheloveka/centry/${center}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const hdPairPages: MetadataRoute.Sitemap = HD_PAIR_SLUGS.map((pair) => ({
    url: `${base}/dizayn-cheloveka/sovmestimost/${pair}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.65,
  }));

  const yearPages: MetadataRoute.Sitemap = FORECAST_YEARS.map((year) => ({
    url: `${base}/prognoz/${year}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  const monthPages: MetadataRoute.Sitemap = FORECAST_YEARS.flatMap((year) =>
    FORECAST_MONTHS.map((month) => ({
      url: `${base}/prognoz/${year}/${month.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
  );

  const zodiacPages: MetadataRoute.Sitemap = getAllSeoZodiacSlugs().map((sign) => ({
    url: `${base}/prognoz/znak/${sign}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.65,
  }));

  // Zodiac×month forecasts stay crawlable via hub links, but stay out of sitemap
  // so Yandex crawl budget prefers hubs / commercial intents (~144 thin URLs).
  const zodiacMonthPages: MetadataRoute.Sitemap = [];

  const landingPages: MetadataRoute.Sitemap = [
    staticPage("/taro", 0.95),
    staticPage("/prognoz", 0.85),
    staticPage("/rasklady", 0.85),
    staticPage("/rasklad", 0.7),
    ...(photoEnabled ? [staticPage("/photo-rasklad", 0.7)] : []),
    ...(auraEnabled ? [staticPage("/aura", 0.7)] : []),
    ...(ritualsEnabled ? [staticPage("/obryady", 0.65)] : []),
    ...(jointEnabled ? [staticPage("/joint-reading", 0.6)] : []),
    staticPage("/numerology", 0.75),
    staticPage("/numerology/pythagoras-square", 0.55, "monthly"),
    staticPage("/numerology/compatibility", 0.55, "monthly"),
    staticPage("/numerology/name-compatibility", 0.55, "monthly"),
    staticPage("/numerology/destiny-matrix", 0.85, "weekly"),
    staticPage("/numerology/matrica-sovmestimosti", 0.85, "weekly"),
    ...(natalEnabled ? [staticPage("/natalnaya-karta", 0.9, "weekly")] : []),
    ...(hdEnabled
      ? [
          staticPage("/dizayn-cheloveka", 0.9, "weekly"),
          staticPage("/dizayn-cheloveka/rasschitat", 0.85, "weekly"),
          staticPage("/dizayn-cheloveka/tipy", 0.8, "weekly"),
          staticPage("/dizayn-cheloveka/profili", 0.8, "weekly"),
          staticPage("/dizayn-cheloveka/vorota", 0.75, "monthly"),
          staticPage("/dizayn-cheloveka/kanaly", 0.75, "monthly"),
          staticPage("/dizayn-cheloveka/centry", 0.75, "monthly"),
          staticPage("/dizayn-cheloveka/sovmestimost", 0.85, "weekly"),
          staticPage("/dizayn-cheloveka/sovmestimost/rasschitat", 0.8, "weekly"),
        ]
      : []),
    staticPage("/numerology/favorable-dates", 0.55, "monthly"),
    staticPage("/sovmestimost-znakov-zodiaka", 0.75, "monthly"),
    staticPage("/gadanie", 0.9),
    staticPage("/gadanie/da-net", 0.8),
    staticPage("/runy", 0.75),
    staticPage("/cards", 0.7),
    staticPage("/cards/starshie-arkany", 0.65, "monthly"),
    staticPage("/cards/combinations", 0.5),
    staticPage("/statyi", 0.65),
    staticPage("/faq", 0.5, "monthly"),
    staticPage("/telegram", 0.7, "weekly"),
    staticPage("/partners", 0.4, "monthly"),
    ...(proEnabled ? [staticPage("/zovus-pro", 0.55, "monthly")] : []),
    ...ABOUT_PATHS.map((path) => staticPage(path, 0.45, "monthly")),
    ...LENORMAND_PATHS.map((path) => staticPage(path, 0.5, "monthly")),
  ];

  return [
    staticPage("/", 1),
    staticPage("/privacy", 0.3, "monthly"),
    staticPage("/terms", 0.3, "monthly"),
    staticPage("/offer", 0.3, "monthly"),
    staticPage("/disclaimer", 0.3, "monthly"),
    ...landingPages,
    ...yearPages,
    ...monthPages,
    ...zodiacPages,
    ...zodiacMonthPages,
    ...hubPages,
    ...spreadPages,
    ...intentPages,
    ...ritualPages,
    ...suitHubPages,
    ...cardPages,
    ...combinationPages,
    ...articlePages,
    ...lenormandCombinationPages,
    ...runeMeaningPages,
    ...(hdEnabled
      ? [
          ...hdTypePages,
          ...hdProfilePages,
          ...hdGatePages,
          ...hdChannelPages,
          ...hdCenterPages,
          ...hdPairPages,
        ]
      : []),
  ];
}
