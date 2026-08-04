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
  { href: "/dizayn-cheloveka", label: "Дизайн Человека" },
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
  { href: "/prognoz", label: "Прогнозы" },
  { href: "/statyi", label: "Статьи" },
  { href: "/faq", label: "FAQ" },
  { href: "/telegram", label: "Telegram-бот" },
] as const;

type RelatedLink = { href: string; label: string };

type SeoRelatedToolsProps = {
  title?: string;
  links?: RelatedLink[];
  /** Drop default links that match these hrefs (current page). */
  excludeHrefs?: string[];
};

/** Crawlable “related tools” block for SEO hubs. */
export default function SeoRelatedTools({
  title = "Также на Zovus",
  links = [...DEFAULT_LINKS],
  excludeHrefs = [],
}: SeoRelatedToolsProps) {
  const exclude = new Set(excludeHrefs);
  const items = links.filter((item) => !exclude.has(item.href));
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
