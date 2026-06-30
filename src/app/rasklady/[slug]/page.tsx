import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generateSpreadIntentStaticParams,
  getRelatedSpreadIntents,
  getSpreadIntentBySlug,
} from "@/lib/spread-intents";
import {
  buildMasterAskUrl,
  buildSpreadStartUrl,
  estimateIntentRuneCost,
} from "@/lib/spread-intents/router";
import { getSpread } from "@/lib/spreads";
import { getCharacterById } from "@/lib/characters";
import {
  recommendRitualForIntentSlug,
  ritualPageSlug,
} from "@/lib/ritual-recommendations";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function generateStaticParams() {
  return generateSpreadIntentStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const intent = getSpreadIntentBySlug(slug);
  if (!intent) return { title: "Расклад" };
  return buildSeoMetadata({
    title: intent.seoTitle,
    description: intent.seoDescription,
    path: `/rasklady/${slug}`,
  });
}

const FAQ = [
  {
    q: "Можно ли гадать на конкретного человека?",
    a: "Да. Сформулируйте вопрос о человеке — мастер учтёт контекст в расшифровке.",
  },
  {
    q: "Нужна ли дата рождения?",
    a: "Для базового расклада не обязательно. Дата рождения помогает для прогнозов и нумерологии.",
  },
  {
    q: "Сохраняется ли расклад?",
    a: "После регистрации история сеансов и переписка сохраняются в личном кабинете.",
  },
  {
    q: "Можно ли задать уточняющий вопрос?",
    a: "Да. После расшифровки вы продолжаете диалог с мастером в чате — можно уточнять детали.",
  },
  {
    q: "Чем Zovus отличается от обычного онлайн-гадания?",
    a: "У нас живые ИИ-мастера с памятью, чат после расклада, фото-расклады и обряды — не только текст по шаблону.",
  },
];

export default async function SpreadIntentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const intent = getSpreadIntentBySlug(slug);
  if (!intent) notFound();

  const spread = getSpread(intent.spreadId);
  const master = getCharacterById(intent.recommendedMasterId);
  const related = getRelatedSpreadIntents(intent);
  const ritualType = recommendRitualForIntentSlug(slug);
  const ritual = ritualType ? RITUAL_TYPES[ritualType] : null;
  const runeCost = estimateIntentRuneCost(intent.spreadId);

  return (
    <SeoPageShell backHref="/rasklady" backLabel="Все расклады">
      <SeoPageTracker goal="spread_intent_view" params={{ slug }} />
      <p className="text-sm text-aura-gold/80">
        {spread.label} · {spread.cardCount} карт
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold">{intent.h1}</h1>
      <p className="mt-4 text-white/70">{intent.intro}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/50">
        {master ? (
          <span>
            Мастер:{" "}
            <Link href={`/master/${master.id}`} className="text-aura-gold hover:underline">
              {master.name}
            </Link>
          </span>
        ) : null}
        <span>от {runeCost} ᚢ</span>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta
          href={buildSpreadStartUrl(intent)}
          trackGoal="spread_intent_start"
          trackParams={{ slug }}
        >
          Разложить сейчас
        </SeoTrackedCta>
        <SeoTrackedCta href={buildMasterAskUrl(intent)} variant="ghost">
          Спросить у мастера
        </SeoTrackedCta>
      </div>

      <SeoSection title="Когда подходит этот расклад">
        <p>{intent.description}</p>
      </SeoSection>

      <SeoSection title="Что покажут карты">
        <ol className="space-y-2">
          {intent.positionsPreview.map((label, i) => (
            <li key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-aura-gold">{i + 1}.</span> {label}
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection title="Как проходит">
        <p>Выбираете вопрос или формулируете свой.</p>
        <p>Мастер раскладывает карты по выбранной схеме.</p>
        <p>Получаете связную трактовку с учётом позиций и контекста.</p>
        <p>Можете продолжить диалог и уточнить детали в чате.</p>
      </SeoSection>

      {master ? (
        <SeoSection title="Рекомендованный мастер">
          <p>
            <strong className="text-white">{master.name}</strong> — {master.title}.{" "}
            {master.specialty}.
          </p>
          <Link href={`/master/${master.id}`} className="inline-block text-aura-gold hover:underline">
            Профиль мастера →
          </Link>
        </SeoSection>
      ) : null}

      {ritual ? (
        <SeoSection title="Следующий шаг после расклада">
          <SeoPageTracker goal="ritual_recommendation_view" params={{ slug }} />
          <p>
            Если расклад покажет, что нужен не только анализ, но и энергетическое действие, может
            подойти обряд «{ritual.label}».
          </p>
          <Link
            href={`/obryady/${ritualPageSlug(ritualType!)}`}
            className="inline-block text-aura-gold hover:underline"
          >
            Подробнее об обряде →
          </Link>
        </SeoSection>
      ) : null}

      {related.length > 0 ? (
        <SeoSection title="Похожие расклады">
          <ul className="space-y-2">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/rasklady/${item.slug}`} className="text-aura-gold hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      <SeoSection title="Частые вопросы">
        {FAQ.map((item) => (
          <div key={item.q}>
            <p className="font-medium text-white">{item.q}</p>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>
    </SeoPageShell>
  );
}
