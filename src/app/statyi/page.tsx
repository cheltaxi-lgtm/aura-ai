import type { Metadata } from "next";
import Link from "next/link";
import { SEO_ARTICLES } from "@/lib/seo/articles";
import { buildSeoMetadataWithOverrides } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import { AdsSeoH1, AdsSeoJsonLd, AdsSeoRelatedTools } from "@/components/seo/AdsSeoEnhancements";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadataWithOverrides("/statyi", {
    title: "Статьи: Таро, матрица судьбы, натал, Ленорман | Zovus",
    description:
      "База знаний Zovus: гайды по Таро, фото-раскладу, матрице судьбы, натальной карте, Ленорман, рунам и нумерологии.",
    path: "/statyi",
  });
}

export default async function StatyiIndexPage() {
  return (
    <SeoPageShell backHref="/rasklady" backLabel="Каталог раскладов">
      <p className="text-sm text-aura-gold/80">База знаний</p>
      <AdsSeoH1 path="/statyi">Статьи о практиках Zovus</AdsSeoH1>
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
      <AdsSeoRelatedTools path="/statyi" excludeHrefs={["/statyi"]} />
      <AdsSeoJsonLd path="/statyi" />
    </SeoPageShell>
  );
}
