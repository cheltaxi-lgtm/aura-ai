import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

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
  return buildSeoMetadata({
    title: `Обряд «${ritual.label}» — Zovus`,
    description: ritual.desc,
    path: `/obryady/${slug}`,
  });
}

const MASTER_FOR_RITUAL: Record<RitualType, string> = {
  love: "agafya",
  money: "ragnar",
  protection: "agafya",
  luck: "ragnar",
  release: "agafya",
};

const FAQ = [
  {
    q: "Нужен ли расклад перед обрядом?",
    a: "Не обязательно, но расклад помогает понять, нужен ли обряд и какой запрос главный.",
  },
  {
    q: "Сколько длится обряд?",
    a: "Мастер сопровождает вас в чате — вы получаете инструкцию и можете задавать вопросы.",
  },
  {
    q: "Сохраняется ли история?",
    a: "Да, обряд сохраняется в личном кабинете вместе с перепиской.",
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
  const masterId = MASTER_FOR_RITUAL[type];

  return (
    <SeoPageShell backHref="/obryady" backLabel="Все обряды">
      <SeoPageTracker goal="ritual_landing_cta_click" params={{ slug }} />
      <p className="text-2xl">{ritual.emoji}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Обряд «{ritual.label}»</h1>
      <p className="mt-4 text-white/70">{ritual.desc}</p>
      <p className="mt-3 text-sm text-white/50">{ritual.cost} ₽</p>

      <div className="mt-8">
        <SeoTrackedCta
          href={`/master/${masterId}`}
          trackGoal="ritual_landing_cta_click"
          trackParams={{ slug }}
        >
          Начать с мастером
        </SeoTrackedCta>
      </div>

      <SeoSection title="Когда нужен этот обряд">
        <p>{ritual.desc}</p>
      </SeoSection>

      <SeoSection title="Как проходит">
        <p>Мастер задаёт уточняющие вопросы о вашей ситуации.</p>
        <p>Формируется персональный обряд с учётом вашего запроса.</p>
        <p>Вы получаете инструкцию и сопровождение в чате.</p>
      </SeoSection>

      <SeoSection title="Какие вопросы задаст мастер">
        <ul className="list-disc space-y-2 pl-5">
          {ritual.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Что вы получите">
        <p>
          Персональный обряд под ваш запрос, сохранённый в истории и возможность отзыва о результате.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {FAQ.map((item) => (
          <div key={item.q}>
            <p className="font-medium text-white">{item.q}</p>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <p className="mt-8">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Сначала сделать расклад
        </Link>
      </p>
    </SeoPageShell>
  );
}
