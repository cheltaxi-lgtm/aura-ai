import Link from "next/link";
import { SeoSection } from "@/components/seo/SeoPageShell";

const DEFAULT_LINKS = [
  { href: "/photo-rasklad", label: "Расшифровка по фото" },
  { href: "/gadanie", label: "Гадание онлайн" },
  { href: "/taro", label: "Таро онлайн" },
  { href: "/rasklady", label: "Каталог раскладов" },
  { href: "/runy", label: "Гадание на рунах" },
  { href: "/lenormand", label: "Ленорман" },
  { href: "/natalnaya-karta", label: "Натальная карта" },
  { href: "/dizayn-cheloveka/rasschitat", label: "Дизайн Человека" },
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
  { href: "/numerology/matrica-sovmestimosti", label: "Совместимость матриц" },
  { href: "/obryady", label: "Обряды" },
  { href: "/joint-reading", label: "Совместный расклад" },
  { href: "/prognoz", label: "Прогнозы" },
  { href: "/statyi", label: "Статьи" },
  { href: "/faq", label: "FAQ" },
  { href: "/telegram", label: "Telegram-бот" },
] as const;

type RelatedLink = { href: string; label: string };

type SeoRelatedToolsProps = {
  title?: string;
  links?: RelatedLink[];
  /** Extra crawlable links from ads.seo_override (already whitelist-filtered). */
  extraLinks?: RelatedLink[];
  /** Drop default links that match these hrefs (current page). */
  excludeHrefs?: string[];
};

/** Crawlable “related tools” block for SEO hubs. */
export default function SeoRelatedTools({
  title = "Также на Zovus",
  links = [...DEFAULT_LINKS],
  extraLinks = [],
  excludeHrefs = [],
}: SeoRelatedToolsProps) {
  const exclude = new Set(excludeHrefs);
  const seen = new Set<string>();
  const items: RelatedLink[] = [];
  for (const item of [...links, ...extraLinks]) {
    if (exclude.has(item.href) || seen.has(item.href)) continue;
    seen.add(item.href);
    items.push(item);
  }
  if (items.length === 0) return null;

  return (
    <SeoSection title={title}>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-aura-gold hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </SeoSection>
  );
}
