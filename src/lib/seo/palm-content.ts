/**
 * Palm / chiromancy SEO family — unique landings that feed /gadanie-po-ladoni.
 * Lines, mounts and hand types are product truth (palm-constants).
 */
import {
  PALM_HAND_SHAPE_LABELS,
  PALM_HAND_SHAPE_MEANINGS,
  PALM_LINE_NAMES,
  PALM_MOUNT_NAMES,
  type PalmHandShape,
  type PalmLineKey,
  type PalmMountKey,
} from "@/lib/palm-constants";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";

export type PalmSeoFaq = { q: string; a: string };
export type PalmSeoSection = { heading: string; body: string };
export type PalmSeoRelated = { href: string; title: string };

export type PalmSeoEntry = {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: PalmSeoSection[];
  faq: PalmSeoFaq[];
  related: PalmSeoRelated[];
};

export const PALM_SEO_CRUMBS: BreadcrumbItem[] = [
  { name: "Zovus", path: "/" },
  { name: "Гадание", path: "/gadanie" },
  { name: "Гадание по ладони", path: "/gadanie-po-ladoni" },
];

const CTA_RELATED: PalmSeoRelated[] = [
  { href: "/gadanie-po-ladoni", title: "Снять ладонь по фото" },
  { href: "/gadanie-po-ladoni/linii", title: "Главные линии ладони" },
  { href: "/gadanie-po-ladoni/kholmy", title: "Холмы ладони" },
  { href: "/gadanie-po-ladoni/tipy-ruk", title: "Типы рук" },
];

function relatedFor(extra: PalmSeoRelated[]): PalmSeoRelated[] {
  const seen = new Set<string>();
  const out: PalmSeoRelated[] = [];
  for (const item of [...extra, ...CTA_RELATED]) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    out.push(item);
  }
  return out;
}

const LINE_SLUGS: Record<PalmLineKey, string> = {
  life: "zhizni",
  head: "uma",
  heart: "serdca",
  fate: "sudby",
};

const LINE_COPY: Record<PalmLineKey, { intro: string; body: string }> = {
  life: {
    intro:
      "Линия жизни идёт вокруг холма Венеры. В хиромантии она говорит о ритме сил и опоре, а не о сроке лет.",
    body: "Длинная ясная линия — устойчивый ритм. Разрывы и островки читают как паузы и смены темпа. Это символическое чтение, не медицина и не прогноз смерти.",
  },
  head: {
    intro: "Линия ума пересекает ладонь горизонтально и показывает, как человек принимает решения.",
    body: "Прямая линия — ясность и расчёт. Волнистая — гибкость и смена ракурсов. Развилка у конца часто читается как умение видеть несколько выходов.",
  },
  heart: {
    intro: "Линия сердца идёт под пальцами и описывает близость, принятие и тон чувств.",
    body: "Высокая линия — идеал и требовательность. Низкая и длинная — тепло и включённость. Разрывы не «приговор любви», а смена способа быть рядом.",
  },
  fate: {
    intro: "Линия судьбы поднимается к среднему пальцу и говорит о внешних опорах и выбранном пути.",
    body: "Ясная линия — ощущение направления. Прерывистая — смена ролей и опор. Отсутствие линии не «нет судьбы»: путь тогда собирается из решений, а не из внешней колеи.",
  },
};

export const PALM_LINE_SEO: (PalmSeoEntry & { lineKey: PalmLineKey })[] = (
  Object.keys(LINE_SLUGS) as PalmLineKey[]
).map((key) => ({
  lineKey: key,
  slug: LINE_SLUGS[key],
  title: `${PALM_LINE_NAMES[key]} — значение в хиромантии`,
  metaDescription: `${PALM_LINE_NAMES[key]} на ладони: как читать длину, разрывы и развилки. Символическое гадание по фото в Zovus.`,
  h1: PALM_LINE_NAMES[key],
  intro: LINE_COPY[key].intro,
  sections: [
    { heading: "Как читать", body: LINE_COPY[key].body },
    {
      heading: "Как снять ладонь",
      body: "Раскройте ладонь пальцами вверх при ровном свете. Сервис считывает рисунок и не хранит фото — остаются только линии и холмы.",
    },
  ],
  faq: [
    {
      q: `Что значит ${PALM_LINE_NAMES[key].toLowerCase()}?`,
      a: LINE_COPY[key].intro,
    },
    {
      q: "Это медицинский диагноз?",
      a: "Нет. Это символическое чтение рисунка ладони, не диагностика и не срок жизни.",
    },
  ],
  related: relatedFor([{ href: `/gadanie-po-ladoni/linii/${LINE_SLUGS[key]}`, title: PALM_LINE_NAMES[key] }]),
}));

const MOUNT_SLUGS: Record<PalmMountKey, string> = {
  venus: "venery",
  jupiter: "yupitera",
  saturn: "saturna",
  apollo: "apollona",
  mercury: "merkurija",
  mars: "marsa",
  luna: "luny",
};

const MOUNT_COPY: Record<PalmMountKey, string> = {
  venus: "Тепло, тело, потребность в близости и живом контакте.",
  jupiter: "Амбиция, честь, желание занять своё место.",
  saturn: "Ответственность, границы, долгая работа.",
  apollo: "Дар, видимость, радость быть увиденным.",
  mercury: "Речь, сделки, лёгкость обмена.",
  mars: "Защита, конфликт, способность держать удар.",
  luna: "Воображение, путь вглубь, ночная интуиция.",
};

export const PALM_MOUNT_SEO: (PalmSeoEntry & { mountKey: PalmMountKey })[] = (
  Object.keys(MOUNT_SLUGS) as PalmMountKey[]
).map((key) => ({
  mountKey: key,
  slug: MOUNT_SLUGS[key],
  title: `${PALM_MOUNT_NAMES[key]} — значение в хиромантии`,
  metaDescription: `${PALM_MOUNT_NAMES[key]}: ${MOUNT_COPY[key]} Символическое гадание по ладони в Zovus.`,
  h1: PALM_MOUNT_NAMES[key],
  intro: MOUNT_COPY[key],
  sections: [
    {
      heading: "Как проявляется",
      body: `Выраженный ${PALM_MOUNT_NAMES[key].toLowerCase()} усиливает это качество в характере. Слабый холм не «отсутствие», а тихий тон — ресурс берётся из других зон ладони.`,
    },
  ],
  faq: [
    {
      q: `Что означает ${PALM_MOUNT_NAMES[key].toLowerCase()}?`,
      a: MOUNT_COPY[key],
    },
  ],
  related: relatedFor([{ href: `/gadanie-po-ladoni/kholmy/${MOUNT_SLUGS[key]}`, title: PALM_MOUNT_NAMES[key] }]),
}));

const SHAPE_SLUGS: Record<PalmHandShape, string> = {
  earth: "zemlya",
  air: "vozduh",
  fire: "ogon",
  water: "voda",
};

export const PALM_SHAPE_SEO: (PalmSeoEntry & { shapeKey: PalmHandShape })[] = (
  Object.keys(SHAPE_SLUGS) as PalmHandShape[]
).map((key) => ({
  shapeKey: key,
  slug: SHAPE_SLUGS[key],
  title: `Тип руки ${PALM_HAND_SHAPE_LABELS[key]} — хиромантия`,
  metaDescription: `Рука стихии ${PALM_HAND_SHAPE_LABELS[key]}: ${PALM_HAND_SHAPE_MEANINGS[key]}. Гадание по ладони онлайн в Zovus.`,
  h1: `Тип руки — ${PALM_HAND_SHAPE_LABELS[key]}`,
  intro: `В классической хиромантии рука ${PALM_HAND_SHAPE_LABELS[key].toLowerCase()} несёт качество: ${PALM_HAND_SHAPE_MEANINGS[key]}.`,
  sections: [
    {
      heading: "Как узнать тип",
      body: "Смотрят форму ладони и длину пальцев. Снимите ладонь на Zovus — тизер покажет тип руки, полный разбор раскроет линии и холмы.",
    },
  ],
  faq: [
    {
      q: `Что значит рука ${PALM_HAND_SHAPE_LABELS[key].toLowerCase()}?`,
      a: PALM_HAND_SHAPE_MEANINGS[key],
    },
  ],
  related: relatedFor([
    { href: `/gadanie-po-ladoni/tipy-ruk/${SHAPE_SLUGS[key]}`, title: PALM_HAND_SHAPE_LABELS[key] },
  ]),
}));

export function palmLineBySlug(slug: string) {
  return PALM_LINE_SEO.find((item) => item.slug === slug) ?? null;
}
export function palmMountBySlug(slug: string) {
  return PALM_MOUNT_SEO.find((item) => item.slug === slug) ?? null;
}
export function palmShapeBySlug(slug: string) {
  return PALM_SHAPE_SEO.find((item) => item.slug === slug) ?? null;
}

export function getAllPalmSeoPaths(): string[] {
  return [
    "/gadanie-po-ladoni",
    "/gadanie-po-ladoni/linii",
    ...PALM_LINE_SEO.map((item) => `/gadanie-po-ladoni/linii/${item.slug}`),
    "/gadanie-po-ladoni/kholmy",
    ...PALM_MOUNT_SEO.map((item) => `/gadanie-po-ladoni/kholmy/${item.slug}`),
    "/gadanie-po-ladoni/tipy-ruk",
    ...PALM_SHAPE_SEO.map((item) => `/gadanie-po-ladoni/tipy-ruk/${item.slug}`),
  ];
}
