import type { Metadata } from "next";
import Link from "next/link";
import { getCharacterById } from "@/lib/characters";
import { PRICING } from "@/lib/config/pricing";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = buildSeoMetadata({
  title: `Нумерология по дате рождения онлайн | ${BRAND_NAME}`,
  description:
    "Нумерология по дате рождения: числа судьбы, совместимость, квадрат Пифагора и благоприятные даты с Эвелиной — в спокойном диалоге.",
  path: "/numerology",
});

const NUMEROLOGY_DIRECTIONS = [
  {
    title: "Три числа судьбы",
    text: "Путь, душа и личность — короткий каркас по дате рождения.",
    action: "Полезно, когда нужна опора «кто я сейчас» без длинной анкеты.",
    href: "/?numerolog=1",
  },
  {
    title: "Квадрат Пифагора",
    text: "Структура характера и потенциала через числа даты.",
    action: "Когда хочется увидеть сильные стороны и пробелы, а не общий гороскоп.",
    href: "/numerology/pythagoras-square",
  },
  {
    title: "Совместимость по дате и имени",
    text: "Числовой взгляд на пару — где усиливает, где трение.",
    action: "Для двоих: даты (и при желании имена) — без драматизации.",
    href: "/numerology/compatibility",
  },
  {
    title: "Матрица судьбы",
    text: "Схема на 22 арканах: предназначение, ресурс, отношения, аркан года.",
    action: "Бесплатный расчёт на отдельной странице — полный разбор с Эвелиной.",
    href: "/numerology/destiny-matrix",
  },
  {
    title: "Благоприятные даты",
    text: "Окна для решений, стартов и важных разговоров.",
    action: "Когда нужен спокойный ориентир по срокам, а не «счастливое число».",
    href: "/numerology/favorable-dates",
  },
] as const;

const faq = [
  {
    q: "Чем нумерология отличается от натальной карты?",
    a: "Нумерология опирается на числа даты и имени. Натальная карта — на положение планет в момент рождения. На Zovus оба инструмента доступны: числа с Эвелиной, карта — на странице /natalnaya-karta.",
  },
  {
    q: "Можно ли рассчитать матрицу судьбы бесплатно?",
    a: "Да. Бесплатный расчёт схемы — на странице /numerology/destiny-matrix. Полный разбор с Эвелиной открывается в сессии по тарифу.",
  },
  {
    q: "С чего начать, если дата рождения есть, а вопрос ещё размытый?",
    a: "Начните с матрицы или трёх чисел судьбы — они дают каркас. Затем уточните тему в чате с Эвелиной или перейдите к натальной карте для планетарного слоя.",
  },
];

export default function NumerologyPage() {
  const evelina = getCharacterById("numerolog");
  const sessionCost = PRICING.NUMEROLOGY_SESSION;
  const structuredData = buildForecastStructuredData({
    title: "Нумерология по дате рождения онлайн",
    description:
      "Нумерология по дате рождения: числа судьбы, матрица, квадрат Пифагора и совместимость с Эвелиной.",
    path: "/numerology",
    faq,
  });

  return (
    <SeoPageShell>
      <SeoPageTracker goal="numerology_hub_view" />
      <SeoBreadcrumbs
        items={[
          { name: "Zovus", path: "/" },
          { name: "Нумерология", path: "/numerology" },
        ]}
      />
      <p className="text-sm text-aura-gold/80">Нумерология</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Нумерология по дате рождения онлайн</h1>
      <p className="mt-4 text-white/70">
        {evelina?.name ?? "Эвелина"} считает числа по вашим данным и разбирает их в диалоге — путь,
        циклы, совместимость и матрица. Не случайный выпад карт: только расчёт и спокойный разбор.
      </p>

      <p className="mt-4 text-sm text-white/50">Полная сессия · от {sessionCost} ᚢ</p>

      <div className="mt-8">
        <SeoTrackedCta href="/?numerolog=1" trackGoal="numerology_cta_click">
          Начать с Эвелиной
        </SeoTrackedCta>
      </div>

      <SeoSection title="Направления">
        <p className="mb-4 text-sm text-white/60">
          Часть расчётов доступна на отдельных страницах; полный диалог — в сеансе с Эвелиной.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMEROLOGY_DIRECTIONS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/70">{item.text}</p>
              <p className="mt-2 text-sm text-white/50">{item.action}</p>
              <p className="mt-2 text-sm text-aura-gold">Открыть →</p>
            </Link>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="Отдельные страницы расчётов">
        <ul className="space-y-2">
          <li>
            <Link href="/numerology/pythagoras-square" className="text-aura-gold hover:underline">
              Квадрат Пифагора
            </Link>
          </li>
          <li>
            <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
              Совместимость по дате рождения
            </Link>
          </li>
          <li>
            <Link href="/numerology/name-compatibility" className="text-aura-gold hover:underline">
              Совместимость имён
            </Link>
          </li>
          <li>
            <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
              Матрица судьбы
            </Link>
          </li>
          <li>
            <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
              Натальная карта
            </Link>
          </li>
          <li>
            <Link href="/numerology/favorable-dates" className="text-aura-gold hover:underline">
              Благоприятные даты
            </Link>
          </li>
          <li>
            <Link href="/sovmestimost-znakov-zodiaka" className="text-aura-gold hover:underline">
              Совместимость знаков зодиака
            </Link>
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools excludeHrefs={["/numerology"]} />

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Расклады Таро
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
