import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllTarotCardSeoSlugs, getTarotCardBySeoSlug } from "@/lib/card-seo";
import {
  getCardContextualMeanings,
  getRelatedIntentSlugsForCard,
} from "@/lib/card-seo-context";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function generateStaticParams() {
  return getAllTarotCardSeoSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = getTarotCardBySeoSlug(slug);
  if (!card) return { title: "Карта Таро" };
  return buildSeoMetadata({
    title: `${card.name} — значение карты Таро | Zovus`,
    description: `Значение карты «${card.name}» в Таро: ${card.meaning}. Узнайте символику и сделайте расклад с мастером.`,
    path: `/cards/${slug}`,
  });
}

const SUIT_LABELS: Record<string, string> = {
  cups: "Кубки",
  wands: "Жезлы",
  swords: "Мечи",
  pentacles: "Пентакли",
};

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = getTarotCardBySeoSlug(slug);
  if (!card) notFound();

  const context = getCardContextualMeanings(card);
  const relatedCombos = getAllCardCombinations()
    .filter((c) => c.cards.includes(card.name))
    .slice(0, 4);
  const relatedIntents = getRelatedIntentSlugsForCard(card.name)
    .map((s) => getSpreadIntentBySlug(s))
    .filter(Boolean);

  const arcanaLabel =
    card.arcana === "major"
      ? "Старший аркан"
      : card.suit
        ? `Младший аркан · ${SUIT_LABELS[card.suit] ?? card.suit}`
        : "Младший аркан";

  return (
    <SeoPageShell backHref="/cards" backLabel="Все карты">
      <SeoPageTracker goal="card_meaning_view" params={{ slug }} />
      <p className="text-sm text-aura-gold/80">{arcanaLabel}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{card.name}</h1>
      <p className="mt-4 text-lg text-white/80">{context.general}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/master/veronika" trackGoal="spread_intent_start">
          Разобрать мой случай с мастером
        </SeoTrackedCta>
        <SeoTrackedCta href="/?spread=triplet" variant="ghost">
          Сделать расклад
        </SeoTrackedCta>
      </div>

      <SeoSection title="В любви и отношениях">
        <p>{context.love}</p>
      </SeoSection>

      <SeoSection title="В финансах и работе">
        <p>{context.money}</p>
      </SeoSection>

      <SeoSection title="В самопознании">
        <p>{context.self}</p>
      </SeoSection>

      {context.reversed ? (
        <SeoSection title="Перевёрнутое значение">
          <p>{context.reversed}</p>
        </SeoSection>
      ) : null}

      {relatedIntents.length > 0 ? (
        <SeoSection title="Подходящие расклады">
          <ul className="space-y-2">
            {relatedIntents.map((intent) =>
              intent ? (
                <li key={intent.slug}>
                  <Link href={`/rasklady/${intent.slug}`} className="text-aura-gold hover:underline">
                    {intent.title}
                  </Link>
                </li>
              ) : null
            )}
          </ul>
        </SeoSection>
      ) : null}

      {relatedCombos.length > 0 ? (
        <SeoSection title="Сочетания с другими картами">
          <ul className="space-y-2">
            {relatedCombos.map((combo) => (
              <li key={combo.slug}>
                <Link
                  href={`/cards/combinations/${combo.slug}`}
                  className="text-aura-gold hover:underline"
                >
                  {combo.title}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Выбрать готовый вопрос для расклада
        </Link>
      </p>
    </SeoPageShell>
  );
}
