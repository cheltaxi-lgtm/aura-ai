import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildCardStructuredData } from "@/lib/seo/structured-data";
import type { CardFaqItem } from "@/lib/seo/card-faq";

export type CardMeaningTemplateProps = {
  slug: string;
  name: string;
  arcanaLabel: string;
  keyword: string;
  general: string;
  love: string;
  money: string;
  self: string;
  reversed?: string;
  combinations: { title: string; slug: string }[];
  relatedIntents: { title: string; slug: string }[];
  faq: CardFaqItem[];
  breadcrumbs: BreadcrumbItem[];
  suitHub?: { title: string; slug: string };
};

export default function CardMeaningTemplate({
  slug,
  name,
  arcanaLabel,
  keyword,
  general,
  love,
  money,
  self,
  reversed,
  combinations,
  relatedIntents,
  faq,
  breadcrumbs,
  suitHub,
}: CardMeaningTemplateProps) {
  const structuredData = buildCardStructuredData({
    name,
    slug,
    description: general,
    keyword,
    breadcrumbs,
    faq,
  });

  return (
    <SeoPageShell backHref="/cards" backLabel="Все карты">
      <SeoPageTracker goal="card_meaning_view" params={{ slug }} />
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">{arcanaLabel}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{name}</h1>
      <p className="mt-2 text-sm text-white/50">Ключевое значение: {keyword}</p>
      <p className="mt-4 text-lg text-white/80">{general}</p>

      {suitHub ? (
        <p className="mt-4 text-sm text-white/60">
          Масть:{" "}
          <Link href={`/cards/masti/${suitHub.slug}`} className="text-aura-gold hover:underline">
            {suitHub.title}
          </Link>
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/master/veronika" trackGoal="spread_intent_start">
          Разобрать мой случай с мастером
        </SeoTrackedCta>
        <SeoTrackedCta href="/?spread=triplet" variant="ghost">
          Сделать расклад
        </SeoTrackedCta>
      </div>

      <SeoSection title="В любви и отношениях">
        <p>{love}</p>
      </SeoSection>

      <SeoSection title="В финансах и работе">
        <p>{money}</p>
      </SeoSection>

      <SeoSection title="В самопознании">
        <p>{self}</p>
      </SeoSection>

      {reversed ? (
        <SeoSection title="Перевёрнутое значение">
          <p>{reversed}</p>
        </SeoSection>
      ) : null}

      {relatedIntents.length > 0 ? (
        <SeoSection title="Подходящие расклады">
          <ul className="space-y-2">
            {relatedIntents.map((intent) => (
              <li key={intent.slug}>
                <Link href={`/rasklady/${intent.slug}`} className="text-aura-gold hover:underline">
                  {intent.title}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {combinations.length > 0 ? (
        <SeoSection title="Сочетания с другими картами">
          <ul className="space-y-2">
            {combinations.map((combo) => (
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

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Выбрать готовый вопрос для расклада
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
