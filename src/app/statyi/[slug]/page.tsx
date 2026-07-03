import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllSeoArticleSlugs,
  getSeoArticleBySlug,
} from "@/lib/seo/articles";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { buildSpreadStartUrl } from "@/lib/spread-intents/router";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function generateStaticParams() {
  return getAllSeoArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getSeoArticleBySlug(slug);
  if (!article) return { title: "Статья" };
  return buildSeoMetadata({
    title: `${article.title} | Zovus`,
    description: article.description,
    path: `/statyi/${slug}`,
  });
}

export default async function StatyiArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getSeoArticleBySlug(slug);
  if (!article) notFound();

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Статьи", path: "/statyi" },
    { name: article.title, path: `/statyi/${slug}` },
  ];

  const primaryIntent = article.intentSlugs[0]
    ? getSpreadIntentBySlug(article.intentSlugs[0])
    : undefined;

  return (
    <SeoPageShell backHref="/statyi" backLabel="Все статьи">
      <SeoBreadcrumbs items={breadcrumbs} />
      <article>
        <h1 className="font-display text-3xl font-bold">{article.title}</h1>
        <p className="mt-4 text-white/70">{article.intro}</p>

        {article.sections.map((section) => (
          <SeoSection key={section.heading} title={section.heading}>
            <p>{section.body}</p>
          </SeoSection>
        ))}

        <SeoSection title="Расклады по теме">
          <ul className="space-y-2">
            {article.intentSlugs.map((intentSlug) => {
              const intent = getSpreadIntentBySlug(intentSlug);
              if (!intent) return null;
              return (
                <li key={intentSlug}>
                  <Link
                    href={`/rasklady/${intentSlug}`}
                    className="text-aura-gold hover:underline"
                  >
                    {intent.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SeoSection>

        {primaryIntent ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <SeoTrackedCta href={buildSpreadStartUrl(primaryIntent)}>
              Расклад: {primaryIntent.title}
            </SeoTrackedCta>
            <SeoTrackedCta href={`/rasklady/${primaryIntent.slug}`} variant="ghost">
              Подробнее о раскладе
            </SeoTrackedCta>
          </div>
        ) : null}
      </article>
    </SeoPageShell>
  );
}
