import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildArticleStructuredData } from "@/lib/seo/structured-data";
import type { RuneMeaning } from "@/lib/seo/rune-meanings";

export default function RuneMeaningTemplate({
  rune,
  breadcrumbs,
  faq,
}: {
  rune: RuneMeaning;
  breadcrumbs: BreadcrumbItem[];
  faq: { question: string; answer: string }[];
}) {
  const structuredData = buildArticleStructuredData({
    title: `${rune.name} — значение руны`,
    description: rune.general,
    path: `/runy/${rune.slug}`,
    bodyText: [rune.general, rune.love, rune.money, ...faq.map((f) => `${f.question} ${f.answer}`)].join(
      " "
    ),
  });

  return (
    <SeoPageShell backHref="/runy" backLabel="Значение рун">
      <SeoPageTracker goal="rune_meaning_view" params={{ slug: rune.slug }} />
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Руна</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{rune.name}</h1>
      <p className="mt-2 text-sm text-white/50">Ключевое значение: {rune.keyword}</p>
      <p className="mt-4 text-lg text-white/80">{rune.general}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/master/ragnar" trackGoal="rune_meaning_cta_click">
          Разобрать мой случай с Рагнаром
        </SeoTrackedCta>
        <SeoTrackedCta href="/?spread=runes-yes-no" variant="ghost" trackGoal="rune_meaning_cta_click">
          Гадание на рунах да / нет
        </SeoTrackedCta>
      </div>

      <SeoSection title="В любви и отношениях">
        <p>{rune.love}</p>
      </SeoSection>

      <SeoSection title="В финансах и делах">
        <p>{rune.money}</p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <p className="mt-10">
        <Link href="/runy" className="text-sm text-aura-gold hover:underline">
          ← Значение всех рун
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
