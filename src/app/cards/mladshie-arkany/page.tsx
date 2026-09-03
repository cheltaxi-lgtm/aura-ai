import type { Metadata } from "next";
import Link from "next/link";
import { cardSeoSlug, getTarotCardsBySuit } from "@/lib/card-seo";
import { SUIT_HUBS } from "@/lib/seo/suit-hubs";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Младшие арканы Таро — 56 карт четырёх мастей | Zovus",
  description:
    "Младшие арканы Таро: Кубки, Жезлы, Мечи и Пентакли. Значения 56 карт по мастям — справочник Zovus, не замена расклада.",
  path: "/cards/mladshie-arkany",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Карты Таро", path: "/cards" },
  { name: "Младшие арканы", path: "/cards/mladshie-arkany" },
];

const faq = [
  {
    q: "Сколько младших арканов в Таро?",
    a: "56 карт: четыре масти по 14 — туз, двойка–десятка, паж, рыцарь, королева, король.",
  },
  {
    q: "Чем младшие отличаются от старших?",
    a: "Старшие — большие уроки и повороты. Младшие — быт, чувства, мысли и ресурсы через стихии мастей.",
  },
  {
    q: "С какой масти начать?",
    a: "С той, что ближе к вопросу: Кубки — чувства, Жезлы — действие, Мечи — решения, Пентакли — деньги и тело.",
  },
];

export default function MinorArcanaHubPage() {
  const structuredData = buildForecastStructuredData({
    title: "Младшие арканы Таро",
    description: "56 младших арканов по четырём мастям — справочник значений.",
    path: "/cards/mladshie-arkany",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="minor_arcana_view" />
      <p className="text-sm text-aura-gold/80">56 карт · четыре масти</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Младшие арканы Таро: 56 карт и четыре масти</h1>
      <p className="mt-4 text-white/70">
        Младшие арканы описывают повседневный слой расклада. Сначала выберите масть, затем карту —
        так проще не смешать «большие уроки» старших с бытовым сюжетом.
      </p>

      {SUIT_HUBS.map((hub) => {
        const cards = getTarotCardsBySuit(hub.suit);
        return (
          <SeoSection key={hub.slug} title={`${hub.titleRu} · ${hub.element}`}>
            <p className="mb-3 text-sm text-white/60">
              <Link href={`/cards/masti/${hub.slug}`} className="text-aura-gold hover:underline">
                Раздел масти {hub.titleRu} →
              </Link>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map((card) => (
                <Link
                  key={card.id}
                  href={`/cards/${cardSeoSlug(card)}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-aura-gold/30"
                >
                  <span className="text-white">{card.name}</span>
                  <span className="mt-1 block text-sm text-white/50">{card.meaning}</span>
                </Link>
              ))}
            </div>
          </SeoSection>
        );
      })}

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools
        links={[
          { href: "/cards/starshie-arkany", label: "Старшие арканы" },
          { href: "/cards", label: "Все 78 карт" },
          { href: "/taro", label: "Таро онлайн" },
          { href: "/rasklady", label: "Каталог раскладов" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
