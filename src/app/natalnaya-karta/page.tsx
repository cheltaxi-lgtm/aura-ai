import type { Metadata } from "next";
import Link from "next/link";
import { getCharacterById } from "@/lib/characters";
import { BRAND_NAME } from "@/lib/brand";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import NatalLandingCtas from "@/components/seo/NatalLandingCtas";
import NatalGuestCalculator from "@/components/natal/NatalGuestCalculator";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

const PATH = "/natalnaya-karta";

export const metadata: Metadata = buildSeoMetadata({
  title: `Натальная карта онлайн — расчёт и расшифровка | ${BRAND_NAME}`,
  description:
    "Натальная карта по дате, времени и месту рождения: западная астрология и джйотиш, прогноз и совместимость. Персональный разбор в Zovus с Гуру Шри Раджем.",
  path: PATH,
});

const WHAT_YOU_GET = [
  {
    title: "Карта рождения",
    text: "Планеты, знаки и дома по точным данным рождения — не общий гороскоп по Солнцу.",
  },
  {
    title: "Две традиции",
    text: "Западный разбор и ведическая астрология (джйотиш) — выбираете фокус под вопрос.",
  },
  {
    title: "Прогноз и совместимость",
    text: "Персональный горизонт событий и синастрия по двум картам — когда нужна динамика, а не только «кто я».",
  },
  {
    title: "Диалог с мастером",
    text: "Расшифровка не обрывается на PDF: можно уточнить карьеру, отношения или период в чате.",
  },
] as const;

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Данные рождения",
    text: "Дата, время (если известно) и место. Чем точнее время, тем надёжнее дома и асцендент.",
  },
  {
    step: "2",
    title: "Карта на этой странице",
    text: "Расчёт бесплатный и до регистрации: колесо и основные акценты появляются сразу.",
  },
  {
    step: "3",
    title: "Полный разбор в кабинете",
    text: "После входа сохраняется эта же карта — дальше трактовка, прогноз и совместимость.",
  },
] as const;

const FAQ = [
  {
    q: "Что такое натальная карта?",
    a: "Это снимок неба в момент вашего рождения: положение Солнца, Луны, планет и домов. По нему смотрят характер, ресурсы, зоны напряжения и темы жизни — глубже, чем по одному знаку зодиака.",
  },
  {
    q: "Чем натальная карта отличается от гороскопа по знаку?",
    a: "Знак Солнца — один слой. Натальная карта учитывает Луну, асцендент, дома и аспекты. Поэтому два «Овна» могут жить совсем по-разному.",
  },
  {
    q: "Нужно ли точное время рождения?",
    a: "Для домов и асцендента — да, желательно. Если время неизвестно, можно строить солнечную карту и разбирать планеты в знаках; это честнее, чем угадывать минуту.",
  },
  {
    q: "Можно ли рассчитать натальную карту онлайн бесплатно?",
    a: "Да — на этой странице можно построить персональную карту до регистрации. Полная трактовка, прогноз и совместимость открываются после входа и списываются по тарифу рун сервиса.",
  },
  {
    q: "Что лучше — западная астрология или джйотиш?",
    a: "Западная традиция удобна для психологии и жизненных сфер. Джйотиш (с Гуру Шри Раджем) сильнее в карме, дашах и периодах. В Zovus доступны оба подхода — можно сравнить акценты.",
  },
  {
    q: "Сколько стоит расшифровка натальной карты?",
    a: `${RUNE_ACTION_LABELS.NATAL_READING} — ${DEFAULT_RUNE_COSTS.NATAL_READING} ᚢ. Персональный прогноз — ${DEFAULT_RUNE_COSTS.FORECAST_REPORT} ᚢ. Списание только после явного запуска отчёта.`,
  },
  {
    q: "Можно ли построить совместимость по двум натальным картам?",
    a: "Да — синастрия по данным обоих партнёров: где усиливает, где трение, какие темы пары в фокусе. Это не «процент любви», а карта взаимных акцентов.",
  },
  {
    q: "Чем натальная карта отличается от матрицы судьбы?",
    a: "Натал опирается на астрономические положения планет. Матрица судьбы — нумерологическая схема по дате на 22 арканах. Это разные языки: их можно сочетать, но не подменять друг другом.",
  },
];

const RELATED = [
  {
    href: "/numerology/destiny-matrix",
    title: "Матрица судьбы",
    text: "Бесплатный расчёт по дате рождения на 22 арканах.",
  },
  {
    href: "/dizayn-cheloveka/rasschitat",
    title: "Дизайн человека",
    text: "Тип, стратегия и бодиграф по тем же данным рождения.",
  },
  {
    href: "/numerology/matrica-sovmestimosti",
    title: "Совместимость матриц",
    text: "Две даты — оценка Zovus, авторская аналитика, не научная метрика.",
  },
  {
    href: "/taro",
    title: "Таро онлайн",
    text: "Расклады и значения карт, если нужен ситуативный срез.",
  },
] as const;

export default function NatalnayaKartaPage() {
  const master = getCharacterById("shri-raj");

  const structuredData = buildForecastStructuredData({
    title: "Натальная карта онлайн — расчёт и расшифровка",
    description:
      "Натальная карта по дате, времени и месту рождения: западная астрология и джйотиш, прогноз и совместимость в Zovus.",
    path: PATH,
    faq: FAQ,
  });

  const bodyBits = [
    ...WHAT_YOU_GET.map((item) => `${item.title}: ${item.text}`),
    ...HOW_IT_WORKS.map((item) => `${item.title}: ${item.text}`),
    ...FAQ.map((item) => `${item.q} ${item.a}`),
  ].join(" ");

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Гадание", path: "/gadanie" },
        { name: "Натальная карта", path: PATH },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...structuredData,
            "@graph": (
              structuredData["@graph"] as Array<Record<string, unknown>>
            ).map((node) =>
              node["@type"] === "Article" ? { ...node, text: bodyBits } : node
            ),
          }),
        }}
      />
      <SeoPageTracker
        goal="natal_landing_view"
        funnelProduct="natal"
        funnelSource="natal_landing"
      />
      <p className="text-sm text-aura-gold/80">Астрология · Натальная карта</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Натальная карта онлайн — расчёт и расшифровка
      </h1>
      <p className="mt-4 text-white/70">
        Постройте карту рождения по дате, времени и месту — с разбором в западной традиции или
        джйотиш. {master?.name ?? "Гуру Шри Радж"} помогает увидеть структуру характера, периоды и
        совместимость без шаблонного «гороскопа на день».
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-white/55">
        <li>нужны дата, время (если известно) и место рождения;</li>
        <li>карта считается автоматически — без ручных таблиц;</li>
        <li>западный разбор и ведическая традиция в одном кабинете;</li>
        <li>полная трактовка, прогноз и синастрия — по запросу.</li>
      </ul>
      <p className="mt-4 text-sm text-white/50">
        {RUNE_ACTION_LABELS.NATAL_READING} · от {DEFAULT_RUNE_COSTS.NATAL_READING} ᚢ
      </p>

      <NatalLandingCtas placement="hero" />

      <NatalGuestCalculator />

      <SeoSection title="Что вы получите">
        <div className="grid gap-3 sm:grid-cols-2">
          {WHAT_YOU_GET.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/70">{item.text}</p>
            </div>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="Как рассчитать натальную карту в Zovus">
        <ol className="space-y-4">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step} className="flex gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-aura-gold/40 text-sm text-aura-gold">
                {item.step}
              </span>
              <div>
                <p className="font-medium text-white">{item.title}</p>
                <p className="mt-1 text-sm text-white/70">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection title="Зачем нужна натальная карта">
        <p>
          Натал отвечает на вопросы «как устроена моя психика и ресурс», «какие темы повторяются»,
          «куда смотреть в этот период». Это не предсказание «что случится во вторник», а карта
          склонностей и окон внимания.
        </p>
        <p>
          Если нужен быстрый числовой срез по дате без времени рождения — начните с{" "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            матрицы судьбы
          </Link>
          . Для типа и стратегии по рождению —{" "}
          <Link href="/dizayn-cheloveka/rasschitat" className="text-aura-gold hover:underline">
            дизайн человека
          </Link>
          . Если вопрос про пару на уровне знаков — загляните в{" "}
          <Link href="/sovmestimost-znakov-zodiaka" className="text-aura-gold hover:underline">
            совместимость зодиака
          </Link>
          , а персональную синастрию лучше строить уже по двум картам.
        </p>
      </SeoSection>

      <SeoSection title="Западная астрология и джйотиш">
        <p>
          В кабинете можно работать в двух языках. Западный разбор удобен для домов, аспектов и
          психологического портрета. Джйотиш добавляет периоды (даши), лунный акцент и кармический
          каркас — с мастером {master?.name ?? "Шри Раджем"}.
        </p>
        <p>
          Не обязательно «выбирать одну истину»: многие смотрят обе традиции и берут то, что лучше
          ложится на жизненный вопрос.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <p className="font-medium text-white">{item.q}</p>
              <p className="mt-1 text-sm text-white/70">{item.a}</p>
            </div>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="Смотрите также">
        <ul className="space-y-2">
          {RELATED.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-aura-gold hover:underline">
                {item.title}
              </Link>
              <span className="text-sm text-white/50"> — {item.text}</span>
            </li>
          ))}
        </ul>
      </SeoSection>

      <NatalLandingCtas placement="footer" />
    </SeoPageShell>
  );
}
