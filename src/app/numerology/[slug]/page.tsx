import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCharacterById } from "@/lib/characters";
import { PRICING } from "@/lib/config/pricing";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import DestinyMatrixPreview from "@/components/numerolog/DestinyMatrixPreview";
import type { NumerologToolId } from "@/lib/numerology/tools";

const TOPICS = {
  "pythagoras-square": {
    title: "Квадрат Пифагора",
    description: "Структурный разбор характера и потенциала по дате рождения.",
    intro:
      "Квадрат Пифагора показывает сильные и слабые стороны личности через числа в дате рождения — без шаблонов, с учётом вашего контекста.",
  },
  compatibility: {
    title: "Совместимость по дате рождения",
    description: "Нумерологический расчёт совместимости пары по датам рождения обоих партнёров.",
    intro:
      "Совместимость по дате рождения — числовой анализ пары: Эвелина сравнивает числа судьбы двух людей и показывает, где пара усиливает друг друга, а где нужна осознанность.",
  },
  "name-compatibility": {
    title: "Совместимость имён",
    description: "Совместимость имён и дат рождения — нумерологический разбор пары по именам.",
    intro:
      "Совместимость имён учитывает не только буквы имени, но и дату рождения обоих партнёров — Эвелина считает числовые коды по именам и датам и показывает точки притяжения и трения в паре.",
  },
  "destiny-matrix": {
    title: "Матрица судьбы по дате рождения",
    description:
      "Расчёт матрицы судьбы по дате рождения: ключевые энергии, ресурс, отношения и аркан года. Схема бесплатно — полный разбор с Эвелиной.",
    intro:
      "Дата рождения — и схема на 22 арканах: ключевые энергии и короткие смысловые акценты. Полный разбор и диалог — с нумерологом Эвелиной.",
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
  "name-compatibility": "compatibility",
  "destiny-matrix": "destiny_matrix",
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
    title: `${topic.title} — нумерология`,
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
  const isDestinyMatrix = slug === "destiny-matrix";

  return (
    <SeoPageShell backHref="/numerology" backLabel="Нумерология">
      <SeoPageTracker
        goal={isDestinyMatrix ? "matrix_landing_view" : "numerology_topic_view"}
        params={{ topic: slug }}
      />
      <p className="text-sm text-aura-gold/80">Нумерология · {topic.title}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{topic.title}</h1>
      <p className="mt-4 text-white/70">{topic.intro}</p>
      {isDestinyMatrix ? (
        <ul className="mt-4 space-y-1.5 text-sm text-white/55">
          <li>нужна только дата рождения;</li>
          <li>расчёт за минуту;</li>
          <li>без сложных анкет;</li>
          <li>базовый результат сразу на экране — без регистрации.</li>
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/50">
          С {evelina?.name ?? "Эвелиной"} · от {sessionCost} ᚢ
        </p>
      )}

      {isDestinyMatrix ? (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <SeoTrackedCta
              href="#calculate"
              trackGoal="matrix_preview_start"
              trackParams={{ topic: slug }}
            >
              Рассчитать бесплатно
            </SeoTrackedCta>
            <SeoTrackedCta
              href={startHref}
              variant="ghost"
              trackGoal="numerology_cta_click"
              trackParams={{ topic: slug }}
            >
              Полный разбор с Эвелиной
            </SeoTrackedCta>
          </div>

          <SeoSection title="Что вы узнаете">
            <p>Ядро личности по центральной энергии.</p>
            <p>Ресурсный канал и сценарии в отношениях.</p>
            <p>Родовые линии и аркан текущего года.</p>
            <p>После бесплатной схемы — полный разбор и вопросы Эвелине по вашей матрице.</p>
          </SeoSection>

          <DestinyMatrixPreview />

          <SeoSection title="Как устроен полный разбор">
            <p>Арканы считает фиксированная методика — модель не подменяет цифры.</p>
            <p>
              {sessionCost} ᚢ — разовая оплата за разбор Эвелины с сохранением и{" "}
              {PRICING.MATRIX_INCLUDED_QUESTIONS} вопросами в чате. Схема матрицы остаётся
              бесплатной; повторно за ту же дату платить не нужно.
            </p>
            <p>
              Дальше можно перейти к личному году, совместимости или натальной карте в том же
              пространстве.
            </p>
          </SeoSection>
        </>
      ) : (
        <>
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
        </>
      )}

      <p className="mt-10">
        <Link href="/numerology" className="text-sm text-aura-gold hover:underline">
          ← Все направления нумерологии
        </Link>
      </p>
    </SeoPageShell>
  );
}
