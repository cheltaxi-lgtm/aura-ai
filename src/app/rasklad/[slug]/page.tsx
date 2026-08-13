import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpreadBySeoSlug, SPREAD_REGISTRY } from "@/lib/spreads/registry";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildSpreadStructuredData } from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return Object.values(SPREAD_REGISTRY)
    .filter((s) => s.seoSlug)
    .map((s) => ({ slug: s.seoSlug! }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spread = getSpreadBySeoSlug(slug);
  if (!spread) return { title: "Расклад" };
  return buildSeoMetadata({
    title: spread.seo?.title ?? `${spread.label} — расклад Таро онлайн | Zovus`,
    description: spread.description,
    path: `/rasklad/${slug}`,
  });
}

export default async function SpreadLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spread = getSpreadBySeoSlug(slug);
  if (!spread) notFound();

  const faq = spread.positions.map((p) => ({
    question: `Что означает позиция «${p.label}»?`,
    answer: p.hint ?? `Карта в позиции «${p.label}» раскрывает этот аспект вашего вопроса.`,
  }));

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Схемы раскладов", path: "/rasklad" },
    { name: spread.label, path: `/rasklad/${slug}` },
  ];

  const structuredData = buildSpreadStructuredData({
    title: spread.seo?.title ?? `${spread.label} — расклад Таро онлайн`,
    description: spread.description,
    path: `/rasklad/${slug}`,
    faq,
  });

  return (
    <SeoPageShell backHref="/rasklad" backLabel="Схемы раскладов">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Расклад · {spread.cardCount} карт</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{spread.seo?.h1 ?? spread.label}</h1>
      <p className="mt-4 text-white/70">{spread.seo?.intro ?? spread.description}</p>

      <SeoSection title="Позиции расклада">
        <ol className="space-y-2">
          {spread.positions.map((p, i) => (
            <li key={p.key} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-aura-gold">{i + 1}.</span> {p.label}
              {p.hint ? <span className="block text-sm text-white/50">{p.hint}</span> : null}
            </li>
          ))}
        </ol>
      </SeoSection>

      {spread.seo?.extra ? (
        <SeoSection title={spread.seo.extra.heading}>
          {spread.seo.extra.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </SeoSection>
      ) : null}

      <SeoSection title="Когда использовать схему">
        <p>
          Подходит для конкретного вопроса, когда нужна структура ответа. Для готовых формулировок
          смотрите{" "}
          <Link href="/rasklady" className="text-aura-gold hover:underline">
            каталог раскладов
          </Link>
          .
        </p>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta
          href={spread.id === "daily-extended" ? "/cabinet#расклады-на-сутки" : `/?spread=${spread.id}`}
        >
          {spread.id === "daily-extended" ? "Открыть расширенный день" : "Начать расклад с мастером"}
        </SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
