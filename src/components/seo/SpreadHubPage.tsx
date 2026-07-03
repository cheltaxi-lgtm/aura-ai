import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSpreadIntentsByCategory,
  getSpreadIntentBySlug,
} from "@/lib/spread-intents";
import type { SpreadHubConfig } from "@/lib/seo/hubs";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function spreadHubMetadata(hub: SpreadHubConfig) {
  return buildSeoMetadata({
    title: hub.seoTitle,
    description: hub.seoDescription,
    path: `/rasklady/${hub.slug}`,
  });
}

export default function SpreadHubPage({ hub }: { hub: SpreadHubConfig }) {
  const featured = hub.featuredSlugs
    .map((slug) => getSpreadIntentBySlug(slug))
    .filter(Boolean);
  const categoryIntents = getSpreadIntentsByCategory(hub.category);
  const seen = new Set(hub.featuredSlugs);
  const rest = categoryIntents.filter((i) => !seen.has(i.slug)).slice(0, 30);

  if (!hub) notFound();

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Расклады", path: "/rasklady" },
    { name: hub.title, path: `/rasklady/${hub.slug}` },
  ];

  return (
    <SeoPageShell backHref="/rasklady" backLabel="Все расклады">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Тематический раздел</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{hub.h1}</h1>
      <p className="mt-4 text-white/70">{hub.intro}</p>

      <SeoSection title="Популярные вопросы">
        <ul className="grid gap-2 sm:grid-cols-2">
          {featured.map((intent) =>
            intent ? (
              <li key={intent.slug}>
                <Link
                  href={`/rasklady/${intent.slug}`}
                  className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-aura-gold hover:underline"
                >
                  {intent.title}
                </Link>
              </li>
            ) : null
          )}
        </ul>
      </SeoSection>

      {rest.length > 0 ? (
        <SeoSection title="Ещё расклады по теме">
          <ul className="space-y-2">
            {rest.map((intent) => (
              <li key={intent.slug}>
                <Link href={`/rasklady/${intent.slug}`} className="text-white/75 hover:text-aura-gold">
                  {intent.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/rasklady" className="mt-4 inline-block text-sm text-aura-gold hover:underline">
            Полный каталог →
          </Link>
        </SeoSection>
      ) : null}

      <SeoSection title="Частые вопросы">
        {hub.faq.map((item) => (
          <div key={item.q}>
            <p className="font-medium text-white">{item.q}</p>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              buildBreadcrumbJsonLd(breadcrumbs),
              {
                "@type": "FAQPage",
                mainEntity: hub.faq.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
            ],
          }),
        }}
      />
    </SeoPageShell>
  );
}
