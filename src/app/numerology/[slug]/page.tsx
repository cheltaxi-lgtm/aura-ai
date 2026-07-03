import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCharacterById } from "@/lib/characters";
import { PRICING } from "@/lib/config/pricing";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import type { NumerologToolId } from "@/lib/numerology/tools";

const TOPICS = {
  "pythagoras-square": {
    title: "Квадрат Пифагора",
    description: "Структурный разбор характера и потенциала по дате рождения.",
    intro:
      "Квадрат Пифагора показывает сильные и слабые стороны личности через числа в дате рождения — без шаблонов, с учётом вашего контекста.",
  },
  compatibility: {
    title: "Совместимость по числам",
    description: "Числовой анализ пары — сильные стороны и точки роста.",
    intro:
      "Эвелина сравнивает числа двух людей и показывает, где пара усиливает друг друга, а где нужна осознанность.",
  },
  "favorable-dates": {
    title: "Благоприятные даты",
    description: "Когда лучше начинать важные дела и принимать решения.",
    intro:
      "Персональный календарь возможностей — для сделок, переездов, важных разговоров и новых начинаний.",
  },
} as const;

const NUMEROLOGY_TOPIC_TOOLS: Record<TopicSlug, NumerologToolId> = {
  "pythagoras-square": "pythagoras",
  compatibility: "compatibility",
  "favorable-dates": "favorable_dates",
};

type TopicSlug = keyof typeof TOPICS;

export function generateStaticParams() {
  return Object.keys(TOPICS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = TOPICS[slug as TopicSlug];
  if (!topic) return { title: "Нумерология" };
  return buildSeoMetadata({
    title: `${topic.title} — нумерология Zovus`,
    description: topic.description,
    path: `/numerology/${slug}`,
  });
}

export default async function NumerologyTopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = TOPICS[slug as TopicSlug];
  if (!topic) notFound();

  const evelina = getCharacterById("numerolog");
  const sessionCost = PRICING.NUMEROLOGY_SESSION;
  const numerologTool = NUMEROLOGY_TOPIC_TOOLS[slug as TopicSlug];
  const startHref = `/?numerolog=1&tool=${encodeURIComponent(numerologTool)}`;

  return (
    <SeoPageShell backHref="/numerology" backLabel="Нумерология">
      <SeoPageTracker goal="numerology_cta_click" params={{ topic: slug }} />
      <p className="text-sm text-aura-gold/80">Нумерология · {topic.title}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{topic.title}</h1>
      <p className="mt-4 text-white/70">{topic.intro}</p>
      <p className="mt-3 text-sm text-white/50">
        С {evelina?.name ?? "Эвелиной"} · от {sessionCost} ᚢ
      </p>

      <div className="mt-8">
        <SeoTrackedCta
          href={startHref}
          trackGoal="numerology_cta_click"
          trackParams={{ topic: slug }}
        >
          Начать с Эвелиной
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как проходит">
        <p>Вы выбираете расчёт и вводите дату рождения (и при необходимости имя).</p>
        <p>Эвелина даёт персональную расшифровку с возможностью продолжить в чате.</p>
        <p>Результат сохраняется в истории сеансов.</p>
      </SeoSection>

      <p className="mt-10">
        <Link href="/numerology" className="text-sm text-aura-gold hover:underline">
          ← Все направления нумерологии
        </Link>
      </p>
    </SeoPageShell>
  );
}
