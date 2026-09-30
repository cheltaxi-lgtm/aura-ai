import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import {
  generateSpreadIntentStaticParams,
  getRelatedSpreadIntents,
  getSpreadIntentBySlug,
} from "@/lib/spread-intents";
import { buildSpreadStartUrl } from "@/lib/spread-intents/router";
import { formatSpreadUnitRu } from "@/lib/spread-ritual-copy";
import { getSpread, isDailyOnlySpread } from "@/lib/spreads";
import { getCharacterById } from "@/lib/characters";
import { recommendRitualForIntentSlug, ritualPageSlug } from "@/lib/ritual-recommendations";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import { getArticleForIntent } from "@/lib/seo/articles";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { isSearchIndexableIntentSlug } from "@/lib/seo/indexability";
import { buildIntentFaq, intentFaqJsonLd } from "@/lib/seo/intent-faq";
import { SPREAD_INTENT_CATEGORY_LABELS } from "@/lib/spread-intents/types";
import { getSeoMetaOverride } from "@/lib/seo/seo-meta-overrides";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import SeoTrustBlock from "@/components/seo/SeoTrustBlock";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import SpreadIntentPrice from "@/components/seo/SpreadIntentPrice";

export function generateStaticParams() {
  return generateSpreadIntentStaticParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const intent = getSpreadIntentBySlug(slug);
  if (!intent) return { title: "Расклад", robots: { index: false, follow: false } };
  return buildSeoMetadata({
    title: intent.seoTitle,
    description: intent.seoDescription,
    path: `/rasklady/${slug}`,
    noIndex: !isSearchIndexableIntentSlug(slug),
  });
}

export default async function SpreadIntentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "karta-dnya") redirect("/gadanie/karta-dnya");
  const intent = getSpreadIntentBySlug(slug);
  if (!intent) notFound();

  const spread = getSpread(intent.spreadId);
  const master = getCharacterById(intent.recommendedMasterId);
  const related = getRelatedSpreadIntents(intent, 6).filter((item) => !isDailyOnlySpread(item.spreadId) && item.slug !== "karta-dnya");
  const ritualType = recommendRitualForIntentSlug(slug);
  const ritual = ritualType ? RITUAL_TYPES[ritualType] : null;
  const article = getArticleForIntent(slug);
  const faq = buildIntentFaq(intent);
  const categoryHub = getCategoryHubPath(intent.category);
  const metaExtra = getSeoMetaOverride(slug);

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Расклады", path: "/rasklady" },
    ...(categoryHub ? [{ name: SPREAD_INTENT_CATEGORY_LABELS[intent.category], path: categoryHub }] : []),
    { name: intent.title, path: `/rasklady/${slug}` },
  ];

  return (
    <SeoPageShell wide breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="spread_intent_view" params={{ slug }} />
      <div className="rasklady-intent">
        <header className="rasklady-intent__hero">
          <div className="rasklady-intent__intro">
            <p className="rasklady-eyebrow"><Sparkles size={14} aria-hidden="true" /> {SPREAD_INTENT_CATEGORY_LABELS[intent.category]} · {formatSpreadUnitRu(spread.cardCount, intent.recommendedMasterId, "nominative")}</p>
            <h1>{intent.h1}</h1>
            <p className="rasklady-intent__lead">{intent.intro}</p>
          </div>
          <div className="rasklady-intent__ticket">
            <span className="rasklady-intent__ticket-label">Ваш расклад</span>
            <div className="rasklady-intent__ticket-art" aria-hidden="true"><span /><span /><span /></div>
            <div className="rasklady-intent__ticket-line"><span>Схема</span><strong>{spread.label}</strong></div>
            <div className="rasklady-intent__ticket-line"><span>Карты</span><strong>{formatSpreadUnitRu(spread.cardCount, intent.recommendedMasterId, "nominative")}</strong></div>
            {master ? <div className="rasklady-intent__ticket-line"><span>Наставник</span><Link href={`/master/${master.id}`}>{master.name}</Link></div> : null}
            <div className="rasklady-intent__ticket-price"><span>Стоимость</span><SpreadIntentPrice spreadId={intent.spreadId} /></div>
            <SeoTrackedCta href={buildSpreadStartUrl(intent)} trackGoal="spread_intent_start" trackParams={{ slug }}>
              Разложить карты <ArrowUpRight size={17} aria-hidden="true" />
            </SeoTrackedCta>
            <p>Итоговую сумму покажем до подтверждения расклада.</p>
          </div>
        </header>

        <div className="rasklady-intent__trust"><SeoTrustBlock /></div>

        <div className="rasklady-intent__body">
          <div>
            <section className="rasklady-intent__section" aria-labelledby="intent-when">
              <p className="rasklady-eyebrow">01 / Ваш вопрос</p>
              <h2 id="intent-when">Когда подходит этот расклад</h2>
              {metaExtra?.whenFits?.length ? (
                <ul className="rasklady-intent__when">{metaExtra.whenFits.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : <p>{intent.description}</p>}
              {metaExtra?.bodyParagraphs?.map((paragraph) => <p key={paragraph.slice(0, 48)}>{paragraph}</p>)}
            </section>

            <section className="rasklady-intent__section" aria-labelledby="intent-positions">
              <p className="rasklady-eyebrow">02 / Схема</p>
              <h2 id="intent-positions">Что покажут карты</h2>
              <ol className="rasklady-intent__positions">
                {intent.positionsPreview.map((label, index) => <li key={`${index}-${label}`}><span>{String(index + 1).padStart(2, "0")}</span>{label}</li>)}
              </ol>
            </section>

            <section className="rasklady-intent__section" aria-labelledby="intent-process">
              <p className="rasklady-eyebrow">03 / Процесс</p>
              <h2 id="intent-process">Как проходит расклад</h2>
              <ol className="rasklady-intent__steps">
                <li><span>01</span><p>Вы выбираете вопрос или формулируете свой.</p></li>
                <li><span>02</span><p>Наставник открывает карты по выбранной схеме.</p></li>
                <li><span>03</span><p>Получаете связную трактовку и можете уточнить детали в чате.</p></li>
              </ol>
              <Link className="rasklady-intent__text-link" href="/about/how-readings-work">Подробнее о процессе <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </section>
          </div>

          <aside className="rasklady-intent__aside" aria-label="Дополнительно о раскладе">
            {master ? (
              <section>
                <p className="rasklady-eyebrow">С вами на связи</p>
                <h2>{master.name}</h2>
                <p>{master.title}. {master.specialty}.</p>
                <Link href={`/master/${master.id}`}>Профиль наставника <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </section>
            ) : null}
            {article ? (
              <section>
                <p className="rasklady-eyebrow">Исследовать тему</p>
                <Link href={`/statyi/${article.slug}`}>{article.title} <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </section>
            ) : null}
            {ritual && ritualType ? (
              <section>
                <p className="rasklady-eyebrow">После расклада</p>
                <SeoPageTracker goal="ritual_recommendation_view" params={{ slug }} />
                <p>Если вам понадобится следующий шаг, можно узнать об обряде «{ritual.label}».</p>
                <SeoTrackedCta href={`/obryady/${ritualPageSlug(ritualType)}`} variant="ghost" trackGoal="ritual_recommendation_click" trackParams={{ slug }}>
                  Подробнее об обряде <ArrowUpRight size={15} aria-hidden="true" />
                </SeoTrackedCta>
              </section>
            ) : null}
          </aside>
        </div>

        {related.length ? (
          <section className="rasklady-intent__related" aria-labelledby="intent-related">
            <p className="rasklady-eyebrow">Продолжить исследование</p>
            <h2 id="intent-related">Похожие вопросы</h2>
            <div>{related.map((item) => <Link key={item.slug} href={`/rasklady/${item.slug}`}>{item.title}<ArrowUpRight size={15} aria-hidden="true" /></Link>)}</div>
          </section>
        ) : null}

        <section className="rasklady-intent__faq" aria-labelledby="intent-faq">
          <p className="rasklady-eyebrow">Перед началом</p>
          <h2 id="intent-faq">Частые вопросы</h2>
          {faq.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(intentFaqJsonLd(faq)) }} />
      </div>
    </SeoPageShell>
  );
}

function getCategoryHubPath(category: string): string | null {
  switch (category) {
    case "love": return "/rasklady/lyubov";
    case "career": return "/rasklady/kariera";
    default: return null;
  }
}
