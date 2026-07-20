import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RITUAL_MASTERS,
  RITUAL_TYPES,
  isRitualAllowedForMaster,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { RITUAL_SEO_CONTENT } from "@/lib/ritual-seo-content";
import { getCharacterById } from "@/lib/characters";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { ensureDb } from "@/lib/db";
import { listPublicRitualOutcomes } from "@/lib/ritual-service";
import RitualOutcomesShowcase from "@/components/ritual/RitualOutcomesShowcase";

const SLUG_TO_TYPE = Object.fromEntries(
  (Object.entries(RITUAL_PAGE_SLUGS) as [RitualType, string][]).map(([type, slug]) => [
    slug,
    type,
  ])
) as Record<string, RitualType>;

export function generateStaticParams() {
  return Object.values(RITUAL_PAGE_SLUGS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const type = SLUG_TO_TYPE[slug];
  if (!type) return { title: "Обряд" };
  const ritual = RITUAL_TYPES[type];
  const seo = RITUAL_SEO_CONTENT[type];
  return buildSeoMetadata({
    title: `Обряд «${ritual.label}» — Zovus`,
    description: seo.whenNeeded.slice(0, 160),
    path: `/obryady/${slug}`,
  });
}

/** Preferred default master for primary CTA; others listed as alternatives. */
const MASTER_FOR_RITUAL: Record<RitualType, RitualMasterKey> = {
  love: "agafya",
  money: "ragnar",
  protection: "agafya",
  luck: "ragnar",
  release: "agafya",
  health: "agafya",
  career: "ragnar",
};

const MASTER_LABELS: Record<RitualMasterKey, string> = {
  ragnar: "Рагнар",
  agafya: "Агафья",
  veronika: "Вероника",
  "shri-raj": "Шри Радж",
  numerolog: "Эвелина",
};

function mastersForRitual(type: RitualType): RitualMasterKey[] {
  const preferred = MASTER_FOR_RITUAL[type];
  const rest = RITUAL_MASTERS.filter(
    (key) => key !== preferred && isRitualAllowedForMaster(key, type)
  );
  return [preferred, ...rest].filter((key) => Boolean(getCharacterById(key)));
}

const FAQ = [
  {
    q: "Нужен ли расклад перед обрядом?",
    a: "Не обязательно, но расклад помогает понять, нужен ли обряд и какой запрос главный.",
  },
  {
    q: "Сколько длится обряд?",
    a: "Мастер составляет персональную инструкцию за несколько минут. Провести обряд вы сможете в рекомендованное лунное время — карточка сохранится в кабинете.",
  },
  {
    q: "Сохраняется ли история?",
    a: "Да, готовый обряд сохраняется в разделе «Обряды» личного кабинета. Это отдельная история от чата с мастером — карточку можно открыть в любой момент.",
  },
  {
    q: "Это только славянские обряды?",
    a: "Нет. У каждого мастера своя традиция: славянская, северная, ведическая, нумерологическая или психологическая. Формат один — персональная инструкция под ваш запрос.",
  },
];

export default async function ObryadyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const type = SLUG_TO_TYPE[slug];
  if (!type) notFound();

  const ritual = RITUAL_TYPES[type];
  const seo = RITUAL_SEO_CONTENT[type];
  const masters = mastersForRitual(type);
  const primaryMaster = masters[0] ?? MASTER_FOR_RITUAL[type];
  const outcomes = (await ensureDb())
    ? await listPublicRitualOutcomes(4, type).catch(() => [])
    : [];

  return (
    <SeoPageShell backHref="/obryady" backLabel="Все обряды">
      <SeoPageTracker goal="ritual_landing_view" params={{ slug }} />
      <p className="text-2xl">{ritual.emoji}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Обряд «{ritual.label}»</h1>
      <p className="mt-4 text-white/70">{ritual.desc}</p>
      <p className="mt-3 text-sm text-white/50">от {ritual.cost} ᚢ</p>

      <div className="mt-8 space-y-4">
        <SeoTrackedCta
          href={`/master/${primaryMaster}?ritual=${type}`}
          trackGoal="ritual_landing_cta_click"
          trackParams={{ slug, master: primaryMaster }}
        >
          Начать с {MASTER_LABELS[primaryMaster]}
        </SeoTrackedCta>

        {masters.length > 1 ? (
          <div>
            <p className="mb-2 text-sm text-white/50">Или выбрать другого мастера:</p>
            <div className="flex flex-wrap gap-2">
              {masters.slice(1).map((masterId) => (
                <Link
                  key={masterId}
                  href={`/master/${masterId}?ritual=${type}`}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:border-aura-gold/50 hover:text-aura-gold"
                >
                  {MASTER_LABELS[masterId]}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <SeoSection title="Когда нужен этот обряд">
        <p>{seo.whenNeeded}</p>
      </SeoSection>

      <SeoSection title="Как проходит">
        <p>{seo.howItHelps}</p>
      </SeoSection>

      <SeoSection title="Лунное время">
        <p>
          Дата и час обряда подбираются системой по фазе луны и типу запроса — мастер объясняет,
          почему именно это окно. Перед стартом можно свериться с лунным календарём практик.
        </p>
        <p className="mt-3">
          <Link
            href="/statyi/lunnyy-kalendar-i-praktiki"
            className="text-sm text-aura-gold hover:underline"
          >
            Лунный календарь и практики →
          </Link>
        </p>
      </SeoSection>

      <SeoSection title="Какие вопросы задаст мастер">
        <ul className="list-disc space-y-2 pl-5">
          {ritual.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Что вы получите">
        <p>{seo.whatYouGet}</p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {FAQ.map((item) => (
          <div key={item.q}>
            <p className="font-medium text-white">{item.q}</p>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <RitualOutcomesShowcase
        outcomes={outcomes}
        title={`Знаки после обряда «${ritual.label}»`}
      />

      <p className="mt-8">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Сначала сделать расклад
        </Link>
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
    </SeoPageShell>
  );
}
