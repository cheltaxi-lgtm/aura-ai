import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generateCombinationStaticParams,
  getCardCombinationBySlug,
} from "@/lib/card-combinations/registry";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { buildSpreadStartUrl } from "@/lib/spread-intents/router";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function generateStaticParams() {
  return generateCombinationStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const combo = getCardCombinationBySlug(slug);
  if (!combo) return { title: "Сочетание карт" };
  return buildSeoMetadata({
    title: `${combo.title} — сочетание карт Таро | Zovus`,
    description: combo.general,
    path: `/cards/combinations/${slug}`,
  });
}

export default async function CombinationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const combo = getCardCombinationBySlug(slug);
  if (!combo) notFound();

  const relatedIntents = combo.relatedIntentSlugs
    .map((s) => getSpreadIntentBySlug(s))
    .filter(Boolean);

  return (
    <SeoPageShell backHref="/cards/combinations" backLabel="Все сочетания">
      <SeoPageTracker goal="card_combination_view" params={{ slug }} />
      <p className="text-sm text-aura-gold/80">
        {combo.cards[0]} + {combo.cards[1]}
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold">{combo.title}</h1>
      <p className="mt-4 text-white/70">{combo.general}</p>

      <SeoSection title="В любви">
        <p>{combo.love}</p>
      </SeoSection>

      <SeoSection title="В финансах">
        <p>{combo.money}</p>
      </SeoSection>

      <SeoSection title="Совет">
        <p>{combo.advice}</p>
      </SeoSection>

      {relatedIntents.length > 0 ? (
        <SeoSection title="Подходящие расклады">
          <ul className="space-y-2">
            {relatedIntents.map((intent) =>
              intent ? (
                <li key={intent.slug} className="flex flex-wrap items-center gap-3">
                  <Link href={`/rasklady/${intent.slug}`} className="text-aura-gold hover:underline">
                    {intent.title}
                  </Link>
                  <SeoTrackedCta
                    href={buildSpreadStartUrl(intent)}
                    variant="ghost"
                    trackGoal="spread_intent_start"
                    trackParams={{ slug: intent.slug }}
                  >
                    Разложить
                  </SeoTrackedCta>
                </li>
              ) : null
            )}
          </ul>
        </SeoSection>
      ) : (
        <div className="mt-8">
          <SeoTrackedCta href="/rasklady">Выбрать расклад</SeoTrackedCta>
        </div>
      )}
    </SeoPageShell>
  );
}
