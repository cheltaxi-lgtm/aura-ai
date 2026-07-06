import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllSuitHubSlugs,
  getCardLinksForSuit,
  getSuitHubBySlug,
} from "@/lib/seo/suit-hubs";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return getAllSuitHubSlugs().map((suit) => ({ suit }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suit: string }>;
}): Promise<Metadata> {
  const { suit } = await params;
  const hub = getSuitHubBySlug(suit);
  if (!hub) return { title: "Масть Таро" };
  return buildSeoMetadata({
    title: hub.seoTitle,
    description: hub.seoDescription,
    path: `/cards/masti/${hub.slug}`,
  });
}

export default async function SuitHubPage({
  params,
}: {
  params: Promise<{ suit: string }>;
}) {
  const { suit } = await params;
  const hub = getSuitHubBySlug(suit);
  if (!hub) notFound();

  const cards = getCardLinksForSuit(hub.suit);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Карты Таро", path: "/cards" },
    { name: hub.titleRu, path: `/cards/masti/${hub.slug}` },
  ];

  return (
    <SeoPageShell backHref="/cards" backLabel="Все карты">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">{hub.element}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{hub.h1}</h1>
      <p className="mt-4 text-white/70">{hub.intro}</p>

      <SeoSection title={`Что означает масть ${hub.titleGenitive}`}>
        <p>
          В раскладе несколько карт {hub.titleGenitive} усиливают тему масти. Одна карта уточняет
          деталь — смотрите позицию и соседние арканы.
        </p>
      </SeoSection>

      <SeoSection title={`Все карты ${hub.titleGenitive} — значения`}>
        <div className="grid gap-2 sm:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.slug}
              href={`/cards/${card.slug}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-aura-gold/30"
            >
              <span className="text-white">{card.name}</span>
              <span className="mt-1 block text-sm text-white/50">{card.meaning}</span>
            </Link>
          ))}
        </div>
      </SeoSection>

      <SeoSection title={`${hub.titleRu} в раскладах на отношения`}>
        <p>
          Масть {hub.titleGenitive} часто выпадает в вопросах о чувствах и близости.{" "}
          <Link href="/rasklady/lyubov" className="text-aura-gold hover:underline">
            Расклады на любовь
          </Link>{" "}
          помогут связать карты с вашей историей.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {hub.faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildForecastStructuredData({
              title: hub.seoTitle,
              description: hub.seoDescription,
              path: `/cards/masti/${hub.slug}`,
              faq: hub.faq,
            })
          ),
        }}
      />
    </SeoPageShell>
  );
}
