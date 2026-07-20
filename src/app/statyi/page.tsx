import type { Metadata } from "next";
import Link from "next/link";
import { SEO_ARTICLES } from "@/lib/seo/articles";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Статьи: Таро, матрица судьбы, натал, Ленорман | Zovus",
  description:
    "База знаний Zovus: гайды по Таро, фото-раскладу, матрице судьбы, натальной карте, Ленорман, рунам и нумерологии.",
  path: "/statyi",
});

export default function StatyiIndexPage() {
  return (
    <SeoPageShell backHref="/rasklady" backLabel="Каталог раскладов">
      <p className="text-sm text-aura-gold/80">База знаний</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Статьи о практиках Zovus</h1>
      <p className="mt-4 text-white/70">
        Гайды по Таро, фото-раскладу, матрице судьбы, натальной карте, Ленорман, рунам и числам — с
        переходом к расчётам и раскладам в сервисе.
      </p>
      <ul className="mt-8 space-y-4">
        {SEO_ARTICLES.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/statyi/${article.slug}`}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30"
            >
              <p className="font-medium text-white">{article.title}</p>
              <p className="mt-1 text-sm text-white/55">{article.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </SeoPageShell>
  );
}
