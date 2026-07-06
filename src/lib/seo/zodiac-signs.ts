export type SeoZodiacSign = {
  slug: string;
  name: string;
  emoji: string;
  element: "fire" | "earth" | "air" | "water";
  elementRu: string;
};

export const SEO_ZODIAC_SIGNS: SeoZodiacSign[] = [
  { slug: "oven", name: "Овен", emoji: "♈", element: "fire", elementRu: "Огонь" },
  { slug: "telec", name: "Телец", emoji: "♉", element: "earth", elementRu: "Земля" },
  { slug: "bliznytsy", name: "Близнецы", emoji: "♊", element: "air", elementRu: "Воздух" },
  { slug: "rak", name: "Рак", emoji: "♋", element: "water", elementRu: "Вода" },
  { slug: "lev", name: "Лев", emoji: "♌", element: "fire", elementRu: "Огонь" },
  { slug: "deva", name: "Дева", emoji: "♍", element: "earth", elementRu: "Земля" },
  { slug: "vesy", name: "Весы", emoji: "♎", element: "air", elementRu: "Воздух" },
  { slug: "skorpion", name: "Скорпион", emoji: "♏", element: "water", elementRu: "Вода" },
  { slug: "strelets", name: "Стрелец", emoji: "♐", element: "fire", elementRu: "Огонь" },
  { slug: "kozerog", name: "Козерог", emoji: "♑", element: "earth", elementRu: "Земля" },
  { slug: "vodoley", name: "Водолей", emoji: "♒", element: "air", elementRu: "Воздух" },
  { slug: "ryby", name: "Рыбы", emoji: "♓", element: "water", elementRu: "Вода" },
];

export function getSeoZodiacBySlug(slug: string): SeoZodiacSign | undefined {
  return SEO_ZODIAC_SIGNS.find((s) => s.slug === slug);
}

export function getAllSeoZodiacSlugs(): string[] {
  return SEO_ZODIAC_SIGNS.map((s) => s.slug);
}
