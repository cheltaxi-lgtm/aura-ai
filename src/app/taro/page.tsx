import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import {
  FORECAST_MONTHS,
  getCurrentForecastMonth,
  getCurrentForecastYear,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { SUIT_HUBS } from "@/lib/seo/suit-hubs";

export const metadata: Metadata = buildSeoMetadata({
  title: "Таро онлайн — расклады и гадание на картах | Zovus",
  description:
    "Таро онлайн бесплатно: расклады на отношения, будущее и карьеру. 78 карт с толкованиями, гадание с ИИ-мастером. Начните прямо сейчас на Zovus.",
  path: "/taro",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Таро онлайн", path: "/taro" },
];

const faq = [
  {
    q: "Можно ли гадать на Таро онлайн бесплатно?",
    a: "Да. Три карты доступны бесплатно каждый день. Полные расклады — с мастером по тарифу сервиса.",
  },
  {
    q: "Чем Zovus отличается от видео-раскладов?",
    a: "Вы получаете персональную трактовку под свой вопрос и можете уточнять ответ в чате с мастером.",
  },
  {
    q: "Нужна ли своя колода?",
    a: "Нет. Карты выпадают в сервисе — вы выбираете вопрос и получаете расшифровку.",
  },
];

export default function TaroPillarPage() {
  const year = getCurrentForecastYear();
  const month = getCurrentForecastMonth();

  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Таро · Zovus</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Таро онлайн: расклады и значения карт</h1>
      <p className="mt-4 text-white/70">
        Гадание на картах Таро в Zovus — это готовые вопросы, проверенные схемы раскладов и живая
        трактовка с мастером. Изучайте символику арканов или сразу задайте свой вопрос.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?spread=triplet">Бесплатный расклад на 3 карты</SeoTrackedCta>
        <SeoTrackedCta href="/rasklady" variant="ghost">
          Каталог вопросов
        </SeoTrackedCta>
      </div>

      <SeoSection title="Гадание на картах Таро — как это работает">
        <p>
          Вы выбираете тему — отношения, будущее, работа — формулируете вопрос и проходите расклад.
          Мастер связывает выпавшие арканы с вашей ситуацией и отвечает в диалоге.
        </p>
        <h3 className="mt-4 font-medium text-white">С чего начать новичку</h3>
        <p>
          Попробуйте{" "}
          <Link href="/rasklad/triplet" className="text-aura-gold hover:underline">
            расклад на три карты
          </Link>{" "}
          или{" "}
          <Link href="/statyi/kak-gadat-na-taro" className="text-aura-gold hover:underline">
            руководство для начинающих
          </Link>
          .
        </p>
      </SeoSection>

      <SeoSection title="Бесплатный расклад Таро онлайн" id="besplatno">
        <p>Три карты каждый день — без регистрации. Для глубины доступны полные схемы с мастером.</p>
        <h3 className="mt-4 font-medium text-white">Три карты бесплатно</h3>
        <p>Классика для быстрого ответа: ситуация, динамика и совет.</p>
        <h3 className="mt-4 font-medium text-white">Когда нужен углублённый расклад</h3>
        <p>Для отношений, года вперёд или сложного выбора — выберите тему в каталоге.</p>
      </SeoSection>

      <SeoSection title="Популярные расклады Таро">
        <h3 className="font-medium text-white">На отношения и любовь</h3>
        <ul className="mt-2 space-y-1">
          <li>
            <Link href="/rasklady/lyubov" className="text-aura-gold hover:underline">
              Расклады на любовь
            </Link>
          </li>
          <li>
            <Link href="/rasklady/chto-on-chuvstvuet" className="text-aura-gold hover:underline">
              Что он чувствует
            </Link>
          </li>
        </ul>
        <h3 className="mt-4 font-medium text-white">На будущее и карту дня</h3>
        <ul className="mt-2 space-y-1">
          <li>
            <Link href="/rasklady/budushchee" className="text-aura-gold hover:underline">
              Расклад на будущее
            </Link>
          </li>
          <li>
            <Link href="/statyi/karta-dnya" className="text-aura-gold hover:underline">
              Карта дня
            </Link>
          </li>
          <li>
            <Link href={`/prognoz/${year}/${month.slug}`} className="text-aura-gold hover:underline">
              Прогноз на {month.name} {year}
            </Link>
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Значения 78 карт колоды Уэйта">
        <p>
          Справочник арканов — старшие и младшие карты с толкованием в любви, финансах и
          самопознании.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          <li>
            <Link href="/cards" className="text-aura-gold hover:underline">
              Все 78 карт
            </Link>
          </li>
          <li>
            <Link href="/cards/starshie-arkany" className="text-aura-gold hover:underline">
              Старшие арканы
            </Link>
          </li>
          {SUIT_HUBS.map((hub) => (
            <li key={hub.slug}>
              <Link href={`/cards/masti/${hub.slug}`} className="text-aura-gold hover:underline">
                {hub.titleRu}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы о Таро">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildForecastStructuredData({
              title: "Таро онлайн — расклады и гадание на картах | Zovus",
              description:
                "Таро онлайн бесплатно: расклады на отношения, будущее и карьеру. 78 карт с толкованиями.",
              path: "/taro",
              faq,
            })
          ),
        }}
      />
    </SeoPageShell>
  );
}
