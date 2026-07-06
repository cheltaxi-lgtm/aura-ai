import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CardMeaningTemplate from "@/components/seo/CardMeaningTemplate";
import { getAllTarotCardSeoSlugs, getTarotCardBySeoSlug } from "@/lib/card-seo";
import {
  getCardContextualMeanings,
  getRelatedIntentSlugsForCard,
} from "@/lib/card-seo-context";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildCardFaq } from "@/lib/seo/card-faq";
import { getSuitHubForCard } from "@/lib/seo/suit-hubs";

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
    description: `Значение карты «${card.name}» в Таро: ${card.meaning}. Толкование в любви, работе, перевёрнутое значение и сочетания — на Zovus.`,
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
  const suitHub = getSuitHubForCard(card);
  const relatedCombos = getAllCardCombinations()
    .filter((c) => c.cards.includes(card.name))
    .slice(0, 4)
    .map((c) => ({ title: c.title, slug: c.slug }));
  const relatedIntents = getRelatedIntentSlugsForCard(card.name)
    .map((s) => getSpreadIntentBySlug(s))
    .filter(Boolean)
    .map((intent) => ({ title: intent!.title, slug: intent!.slug }));

  const arcanaLabel =
    card.arcana === "major"
      ? "Старший аркан"
      : card.suit
        ? `Младший аркан · ${SUIT_LABELS[card.suit] ?? card.suit}`
        : "Младший аркан";

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Карты Таро", path: "/cards" },
    ...(card.arcana === "major"
      ? [{ name: "Старшие арканы", path: "/cards/starshie-arkany" }]
      : suitHub
        ? [{ name: suitHub.titleRu, path: `/cards/masti/${suitHub.slug}` }]
        : []),
    { name: card.name, path: `/cards/${slug}` },
  ];

  const faq = buildCardFaq(card, context.reversed);

  return (
    <CardMeaningTemplate
      slug={slug}
      name={card.name}
      arcanaLabel={arcanaLabel}
      keyword={card.meaning}
      general={context.general}
      love={context.love}
      money={context.money}
      self={context.self}
      reversed={context.reversed}
      combinations={relatedCombos}
      relatedIntents={relatedIntents}
      faq={faq}
      breadcrumbs={breadcrumbs}
      suitHub={suitHub ? { title: suitHub.titleRu, slug: suitHub.slug } : undefined}
    />
  );
}
