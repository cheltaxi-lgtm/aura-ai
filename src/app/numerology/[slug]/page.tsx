import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCharacterById } from "@/lib/characters";
import { PRICING } from "@/lib/config/pricing";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import DestinyMatrixPreview from "@/components/numerolog/DestinyMatrixPreview";
import MatrixCompatibilityPreview from "@/components/numerolog/MatrixCompatibilityPreview";
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
    title: "Полная матрица судьбы по дате рождения",
    description:
      "Полная матрица судьбы онлайн бесплатно: 16 зон на 22 арканах, кармический хвост, комфорт, каналы денег и любви, возраст, узел периода. Живой разбор с Эвелиной и ведение в Telegram.",
    intro:
      "Введите дату рождения — и получите полную схему на 22 арканах: зона комфорта, кармический хвост, каналы, родовые линии, точки возраста и узел периода. Базовый расчёт бесплатно; полный разбор и ведение — с Эвелиной.",
  },
  "matrica-sovmestimosti": {
    title: "Совместимость матриц судьбы",
    description:
      "Бесплатный расчёт совместимости по матрице судьбы двух дат: score методики Zovus, сильные стороны, зоны напряжения, любовь, деньги и комфорт. Полный разбор пары — с Эвелиной.",
    intro:
      "Введите две даты рождения — и получите бесплатный preview совместимости матриц по методике Zovus: общий score, сильные стороны, зоны напряжения, любовь, деньги и комфорт. Полный разбор пары открывается после входа.",
  },
  "detskaya-matritsa": {
    title: "Детская матрица по дате рождения",
    description: "Бережный нумерологический разбор ресурсов ребёнка, обучения и поддержки.",
    intro:
      "Детская матрица помогает увидеть сильные стороны ребёнка, его естественный способ учиться и опоры, которые полезно создавать дома — без ярлыков и предсказаний.",
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
  "matrica-sovmestimosti": "matrix_compatibility",
  "detskaya-matritsa": "child_matrix",
  "favorable-dates": "favorable_dates",
};

const MATRIX_FAQ = [
  {
    q: "Что такое матрица судьбы?",
    a: "Это полная нумерологическая схема по дате рождения на 22 арканах: зона комфорта, кармический хвост, каналы денег и отношений, родовые линии, точки возраста и узел периода. Карта для рефлексии, а не «приговор».",
  },
  {
    q: "Как рассчитать матрицу судьбы по дате рождения?",
    a: "Достаточно указать день, месяц и год. На этой странице схема строится сразу: арканы считает фиксированная методика Zovus, модель не подменяет цифры.",
  },
  {
    q: "Матрица судьбы онлайн бесплатно — что входит?",
    a: "Бесплатно доступна полная схема и короткие смысловые акценты по зонам, включая узел периода. Полный разбор с диалогом, слоем «Небо» и ведением — в сессии с Эвелиной и в Telegram.",
  },
  {
    q: "Чем матрица судьбы отличается от натальной карты?",
    a: "Матрица строится только по дате и говорит языком арканов. Натальная карта использует время и место рождения и астрономические положения планет. Это разные инструменты: их можно сочетать, но не смешивать в один вывод.",
  },
  {
    q: "Нужна ли регистрация для расчёта?",
    a: "Для бесплатной схемы на этой странице — нет. Регистрация нужна, если хотите полный разбор, историю сеансов и продолжение вопросов в чате.",
  },
  {
    q: "Насколько точна матрица судьбы?",
    a: "Арканы считаются по системе 22 энергий Zovus: числа больше 22 сворачиваются сложением цифр, 22 остаётся 22. Это не лицензия «официальной Ладини». Полезность растёт, когда вы соотносите арканы с реальной ситуацией.",
  },
  {
    q: "Можно ли считать матрицу для другого человека?",
    a: "Да, если у вас есть его дата рождения. Бесплатная схема строится по любой дате, а полный разбор можно сохранить на себя, ребёнка, партнёра или другого человека.",
  },
  {
    q: "Что делать после бесплатного расчёта?",
    a: "Сформулируйте 1–2 вопроса к схеме (отношения, деньги, предназначение) и откройте полный разбор с Эвелиной — или перейдите к натальной карте, если нужен астрологический слой.",
  },
] as const;

const MATRIX_PAIR_FAQ = [
  {
    q: "Что показывает совместимость матриц судьбы?",
    a: "Две даты сравниваются по ключевым точкам матрицы: комфорт, любовь, деньги, напряжение и годовой фон. Общий score — ориентир методики Zovus, а не «процент любви».",
  },
  {
    q: "Нужна ли регистрация для расчёта пары?",
    a: "Для бесплатного preview — нет. Полный разбор пары с Эвелиной открывается после входа; та же пара дат сохраняется.",
  },
  {
    q: "Чем это отличается от личной матрицы судьбы?",
    a: "Личная матрица — схема одного человека. Совместимость матриц сопоставляет две схемы и показывает, где пара усиливает друг друга, а где нужна осознанность.",
  },
] as const;

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
  const isMatrixPair = slug === "matrica-sovmestimosti";
  const pairCost = PRICING.MATRIX_PAIR_REPORT;

  const matrixStructuredData = isDestinyMatrix
    ? buildForecastStructuredData({
        title: topic.title,
        description: topic.description,
        path: `/numerology/${slug}`,
        faq: MATRIX_FAQ.map((item) => ({ q: item.q, a: item.a })),
      })
    : isMatrixPair
      ? buildForecastStructuredData({
          title: topic.title,
          description: topic.description,
          path: `/numerology/${slug}`,
          faq: MATRIX_PAIR_FAQ.map((item) => ({ q: item.q, a: item.a })),
        })
      : null;

  return (
    <SeoPageShell backHref="/numerology" backLabel="Нумерология">
      {matrixStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(matrixStructuredData) }}
        />
      ) : null}
      <SeoPageTracker
        goal={
          isDestinyMatrix
            ? "matrix_landing_view"
            : isMatrixPair
              ? "matrix_pair_landing_view"
              : "numerology_topic_view"
        }
        params={{ topic: slug }}
        funnelProduct={
          isDestinyMatrix ? "matrix" : isMatrixPair ? "matrix_compatibility" : undefined
        }
        funnelSource={isDestinyMatrix ? "destiny_matrix" : isMatrixPair ? "matrix_pair" : undefined}
      />
      {isDestinyMatrix || isMatrixPair ? (
        <SeoBreadcrumbs
          items={[
            { name: "Zovus", path: "/" },
            { name: "Нумерология", path: "/numerology" },
            { name: topic.title, path: `/numerology/${slug}` },
          ]}
        />
      ) : null}
      <p className="text-sm text-aura-gold/80">Нумерология · {topic.title}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{topic.title}</h1>
      <p className="mt-4 text-white/70">{topic.intro}</p>
      {isDestinyMatrix || isMatrixPair ? (
        <ul className="mt-4 space-y-1.5 text-sm text-white/55">
          {isMatrixPair ? (
            <>
              <li>нужны две даты рождения;</li>
              <li>бесплатный preview по методике Zovus;</li>
              <li>без регистрации для базового результата;</li>
              <li>полный разбор пары — с Эвелиной за {pairCost} ᚢ.</li>
            </>
          ) : (
            <>
              <li>нужна только дата рождения;</li>
              <li>расчёт за минуту;</li>
              <li>без сложных анкет;</li>
              <li>базовый результат сразу на экране — без регистрации.</li>
            </>
          )}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/50">
          С {evelina?.name ?? "Эвелиной"} · от {sessionCost} ᚢ
        </p>
      )}

      {isMatrixPair ? (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <SeoTrackedCta
              href="#calculate"
              trackGoal="matrix_pair_preview_start"
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
              Полный разбор пары
            </SeoTrackedCta>
          </div>
          <SeoSection title="Что показывает совместимость матриц">
            <p>
              Сравниваются ключевые точки двух матриц судьбы: комфорт, любовь, деньги, напряжение и
              годовой фон. Общий score — ориентир методики Zovus, а не универсальный официальный
              показатель «совместимости на всю жизнь».
            </p>
          </SeoSection>
          <MatrixCompatibilityPreview />
          <SeoSection title="Что входит в полный разбор">
            <p>
              {pairCost} ᚢ — разбор пары с Эвелиной: практики по ключам, общий совет и диалог.
              Бесплатный preview не списывает руны и не открывает платный отчёт сам по себе.
            </p>
            <p>
              Можно начать с{" "}
              <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
                личной матрицы
              </Link>
              , а затем сравнить пару. Для астрологического слоя —{" "}
              <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
                натальная карта
              </Link>
              .
            </p>
          </SeoSection>

          <SeoSection title="Частые вопросы">
            <div className="space-y-4">
              {MATRIX_PAIR_FAQ.map((item) => (
                <div key={item.q}>
                  <p className="font-medium text-white">{item.q}</p>
                  <p className="mt-1 text-sm text-white/70">{item.a}</p>
                </div>
              ))}
            </div>
          </SeoSection>

          <SeoRelatedTools
            title="Смотрите также"
            links={[
              { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
              { href: "/natalnaya-karta", label: "Натальная карта" },
              { href: "/dizayn-cheloveka/rasschitat", label: "Дизайн человека" },
            ]}
          />
        </>
      ) : null}

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

          <SeoSection title="Что показывает матрица судьбы">
            <p>
              Центральная энергия — ядро характера и способ принимать решения. Вокруг неё
              раскрываются каналы ресурса, зоны, где энергия утекает, и сценарии в отношениях.
            </p>
            <p>
              Отдельно читаются родовые линии и аркан текущего года: что усиливается в этом цикле и
              куда полезнее направлять внимание, а не «что обязательно случится».
            </p>
            <p>
              Схема на экране — каркас. Смысл появляется, когда вы соотносите арканы со своей
              ситуацией: работа, пара, выбор, внутренний конфликт.
            </p>
          </SeoSection>

          <SeoSection title="Как рассчитать матрицу судьбы онлайн">
            <ol className="list-decimal space-y-2 pl-5 text-white/75">
              <li>Укажите дату рождения в блоке ниже.</li>
              <li>Получите схему на 22 арканах и короткие акценты по точкам.</li>
              <li>
                Если нужен развёрнутый разбор — откройте сессию с{" "}
                {evelina?.name ?? "Эвелиной"}: методика та же, диалог и сохранение — в чате.
              </li>
            </ol>
          </SeoSection>

          <DestinyMatrixPreview />

          <SeoSection title="Что вы узнаете из бесплатной схемы">
            <p>Ядро личности по центральной энергии.</p>
            <p>Ресурсный канал и типичные сценарии в отношениях.</p>
            <p>Родовые линии и аркан текущего года.</p>
            <p>
              После схемы можно углубить разбор вопросами к Эвелине или перейти к{" "}
              <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
                натальной карте
              </Link>
              , если важен астрологический слой.
            </p>
          </SeoSection>

          <SeoSection title="Как устроен полный разбор">
            <p>Арканы считает фиксированная методика — модель не подменяет цифры.</p>
            <p>
              {sessionCost} ᚢ — разовая оплата за разбор Эвелины с сохранением и{" "}
              {PRICING.MATRIX_INCLUDED_QUESTIONS} вопросами в чате. Схема матрицы остаётся
              бесплатной; повторно за ту же дату платить не нужно.
            </p>
            <p>
              Дальше в том же пространстве доступны личный год, совместимость по датам и переход к
              астрологии — без смены «вселенной» сервиса.
            </p>
          </SeoSection>

          <SeoSection title="Матрица судьбы и другие методы">
            <p>
              <Link
                href="/numerology/matrica-sovmestimosti"
                className="text-aura-gold hover:underline"
              >
                Совместимость матриц
              </Link>{" "}
              сравнивает две даты по методике Zovus.{" "}
              <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
                Натальная карта
              </Link>{" "}
              требует время и место рождения и говорит языком планет.{" "}
              <Link href="/dizayn-cheloveka/rasschitat" className="text-aura-gold hover:underline">
                Дизайн человека
              </Link>{" "}
              даёт тип, стратегию и бодиграф.{" "}
              <Link href="/numerology/pythagoras-square" className="text-aura-gold hover:underline">
                Квадрат Пифагора
              </Link>{" "}
              ближе к структуре характера через повторяющиеся числа даты.
            </p>
            <p>
              Выбирайте инструмент под вопрос: быстрый срез по дате — матрица; пара — совместимость
              матриц; глубина характера и периодов — натал; тип и стратегия — дизайн человека.
            </p>
          </SeoSection>

          <SeoSection title="Частые вопросы">
            <div className="space-y-4">
              {MATRIX_FAQ.map((item) => (
                <div key={item.q}>
                  <p className="font-medium text-white">{item.q}</p>
                  <p className="mt-1 text-sm text-white/70">{item.a}</p>
                </div>
              ))}
            </div>
          </SeoSection>

          <div className="mt-10 flex flex-wrap gap-3">
            <SeoTrackedCta
              href="#calculate"
              trackGoal="matrix_preview_start"
              trackParams={{ topic: slug }}
            >
              Рассчитать матрицу бесплатно
            </SeoTrackedCta>
            <SeoTrackedCta
              href="/numerology/matrica-sovmestimosti"
              variant="ghost"
              trackGoal="numerology_cta_click"
              trackParams={{ topic: "matrica-sovmestimosti" }}
            >
              Совместимость матриц
            </SeoTrackedCta>
            <SeoTrackedCta
              href="/natalnaya-karta"
              variant="ghost"
              trackGoal="natal_landing_cta_click"
              trackParams={{ from: "destiny-matrix" }}
            >
              Натальная карта
            </SeoTrackedCta>
          </div>

          <SeoRelatedTools
            title="Смотрите также"
            excludeHrefs={["/numerology/destiny-matrix"]}
            links={[
              { href: "/numerology/matrica-sovmestimosti", label: "Совместимость матриц" },
              { href: "/natalnaya-karta", label: "Натальная карта" },
              { href: "/dizayn-cheloveka/rasschitat", label: "Дизайн человека" },
              { href: "/taro", label: "Таро онлайн" },
            ]}
          />
        </>
      ) : isMatrixPair ? null : (
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
