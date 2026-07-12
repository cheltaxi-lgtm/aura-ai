import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";
import { getCharacterById } from "@/lib/characters";
import { masterPortraitSrc, masterTagline } from "@/data/master-avatars";

const PORTRAIT_OG_SIZE = { width: 400, height: 520 };
const DEFAULT_OG_SIZE = { width: 1200, height: 630 };

/** Resolve best available raster/SVG asset for social previews. */
export function resolveMasterOgImageAbsoluteUrl(slug: string): {
  url: string;
  width: number;
  height: number;
} {
  const publicDir = path.join(process.cwd(), "public");
  const dedicatedOgPng = path.join(publicDir, "images", "masters", `${slug}-og.png`);
  const dedicatedOgWebp = path.join(publicDir, "images", "masters", `${slug}-og.webp`);
  const portraitWebp = path.join(publicDir, "masters", "avatars", `${slug}.webp`);
  const portraitSvg = path.join(publicDir, "masters", "avatars", `${slug}.svg`);

  if (fs.existsSync(dedicatedOgPng)) {
    return {
      url: `${BRAND_URL}/images/masters/${slug}-og.png`,
      ...DEFAULT_OG_SIZE,
    };
  }
  if (fs.existsSync(dedicatedOgWebp)) {
    return {
      url: `${BRAND_URL}/images/masters/${slug}-og.webp`,
      ...DEFAULT_OG_SIZE,
    };
  }
  if (fs.existsSync(portraitWebp)) {
    return {
      url: `${BRAND_URL}${masterPortraitSrc(slug)}`,
      ...PORTRAIT_OG_SIZE,
    };
  }
  if (fs.existsSync(portraitSvg)) {
    return {
      url: `${BRAND_URL}/masters/avatars/${slug}.svg`,
      ...PORTRAIT_OG_SIZE,
    };
  }
  return {
    url: `${BRAND_URL}/opengraph-image`,
    ...DEFAULT_OG_SIZE,
  };
}

export function getMasterShareDescription(slug: string): string {
  const character = getCharacterById(slug);
  if (!character) {
    return `Персональные эзотерические консультации с мастером ${slug} на платформе ${BRAND_NAME}.`;
  }
  return `${character.name} — ${character.title}. ${character.specialty}. ${masterTagline(character.id, character.title)}. ИИ-наставник Zovus в художественном образе. Онлайн на ${BRAND_NAME}.`;
}

export function buildMasterMetadata(slug: string): Metadata {
  const character = getCharacterById(slug);
  const name = character?.name ?? slug;
  const ogTitle = `ИИ-наставник ${name} | ${BRAND_NAME}`;
  const ogDescription = getMasterShareDescription(slug);
  const pageTitle = character ? `${name} — ${character.title}` : `${slug} — мастер`;
  const pageUrl = `${BRAND_URL}/master/${slug}`;
  const ogImage = resolveMasterOgImageAbsoluteUrl(slug);

  return {
    title: pageTitle,
    description: ogDescription,
    robots: { index: false, follow: true },
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      url: pageUrl,
      siteName: BRAND_NAME,
      title: ogTitle,
      description: ogDescription,
      images: [
        {
          url: ogImage.url,
          width: ogImage.width,
          height: ogImage.height,
          alt: `${name} — ИИ-наставник ${BRAND_NAME}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImage.url],
    },
  };
}

export function getMasterStructuredData(slug: string) {
  const character = getCharacterById(slug);
  if (!character) return null;

  const pageUrl = `${BRAND_URL}/master/${slug}`;
  const imageUrl = resolveMasterOgImageAbsoluteUrl(slug).url;
  const description = getMasterShareDescription(slug);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${BRAND_URL}/#organization`,
        name: BRAND_NAME,
        url: BRAND_URL,
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: `ИИ-консультации — образ «${character.name}»`,
        serviceType: character.title,
        description: `${description} Художественный образ ИИ-наставника, не публичное лицо.`,
        provider: { "@id": `${BRAND_URL}/#organization` },
        areaServed: { "@type": "Country", name: "Россия" },
        url: pageUrl,
        image: imageUrl,
      },
    ],
  };
}
