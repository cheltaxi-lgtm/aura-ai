import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadataWithOverrides } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import {
  FORECAST_MONTHS,
  getCurrentForecastMonth,
  getCurrentForecastYear,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { SUIT_HUBS } from "@/lib/seo/suit-hubs";
import { AdsSeoH1, AdsSeoJsonLd, AdsSeoRelatedTools } from "@/components/seo/AdsSeoEnhancements";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadataWithOverrides("/taro", {
    title: "Таро онлайн — расклады, значения карт и бесплатное гадание",
    description:
      "Таро онлайн: расклады на отношения, будущее и карьеру, справочник 78 карт, расшифровка по фото. Три карты бесплатно до регистрации — Zovus.",
    path: "/taro",
  });
}

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Таро онлайн", path: "/taro" },
];

const faq = [
  {
    q: "Можно ли гадать на Таро онлайн бесплатно?",
    a: "Да. Первый расклад из трёх карт на главной открывается до регистрации и после входа не перетягивается. Это не карта дня. Карта дня и три карты дня — отдельный ритуал после входа, раз в сутки. Полные расклады — с мастером по тарифу сервиса.",
  },
  {
    q: "Можно ли расшифровать расклад по фото своей колоды?",
    a: "Да — на странице «Расшифровка Таро по фото»: загрузите снимок или отметьте карты вручную и получите персональный разбор.",
  },
  {
    q: "Чем Zovus отличается от видео-раскладов?",
    a: "Вы получаете разбор под свой вопрос и можете уточнять ответ в чате с ИИ-наставником в образе мастера.",
  },
  {
    q: "Нужна ли своя колода?",
    a: "Нет для онлайн-расклада в сервисе. Если колода уже разложена дома — используйте фото-расклад.",
  },
];

export default async function TaroPillarPage() {
  const year = getCurrentForecastYear();
  const month = getCurrentForecastMonth();

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="taro_hub_view" />
      <AdsSeoH1 path="/taro">Таро онлайн: расклады и значения карт</AdsSeoH1>
      <p className="mt-4 text-white/70">
        Готовые вопросы, понятные схемы раскладов и разбор с наставником в чате. Можно изучать
        значения арканов, задать свой вопрос или загрузить фото домашнего расклада на расшифровку.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3 [&>a]:min-w-0 [&>a]:w-full [&>a]:justify-center [&>a]:text-center">
        <SeoTrackedCta href="/?ask=1&spread=1">Попробовать первый расклад</SeoTrackedCta>
        <SeoTrackedCta href="/photo-rasklad" variant="ghost">
          Расшифровка по фото
        </SeoTrackedCta>
        <SeoTrackedCta href="/rasklady" variant="ghost">
          Каталог вопросов
        </SeoTrackedCta>
      </div>

      <SeoSection title="Гадание на картах Таро — как это работает">
        <p>
          Вы выбираете тему — связь, будущее, работа — формулируете вопрос и открываете расклад.
          Наставник связывает выпавшие арканы с вашей ситуацией и отвечает в диалоге.
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
          . Все схемы —{" "}
          <Link href="/rasklad" className="text-aura-gold hover:underline">
            в каталоге раскладов
          </Link>
          .
        </p>
      </SeoSection>

      <SeoSection title="Бесплатный расклад Таро онлайн" id="besplatno">
        <p>
          Три карты на главной — первый персональный расклад до регистрации; после входа те же карты,
          без новой тяги. Это не карта дня. Ежедневные три карты дня — отдельный ритуал. Для глубины —
          полные схемы с мастером. Подробнее — в статье{" "}
          <Link href="/statyi/besplatnyy-rasklad-taro-online" className="text-aura-gold hover:underline">
            «бесплатный расклад Таро онлайн»
          </Link>
          .
        </p>
        <h3 className="mt-4 font-medium text-white">Три карты бесплатно</h3>
        <p>Классика для быстрого ответа: ситуация, динамика и совет.</p>
        <h3 className="mt-4 font-medium text-white">Расшифровка своей колоды по фото</h3>
        <p>
          Уже разложили карты дома —{" "}
          <Link href="/photo-rasklad" className="text-aura-gold hover:underline">
            загрузите фото расклада
          </Link>{" "}
          и получите персональную трактовку с проверкой позиций.
        </p>
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
            <Link href="/gadanie/karta-dnya" className="text-aura-gold hover:underline">
              Карта дня
            </Link>
          </li>
          <li>
            <Link href={`/prognoz/${year}/${month.slug}`} className="text-aura-gold hover:underline">
              Прогноз на {month.name} {year}
            </Link>
          </li>
        </ul>
        <h3 className="mt-4 font-medium text-white">Быстрый ответ на один вопрос</h3>
        <ul className="mt-2 space-y-1">
          <li>
            <Link href="/rasklad/da-net" className="text-aura-gold hover:underline">
              Таро да нет
            </Link>
          </li>
          <li>
            <Link href="/rasklad/odna-karta" className="text-aura-gold hover:underline">
              Таро одна карта
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

      <AdsSeoRelatedTools path="/taro" excludeHrefs={["/taro"]} />
      <AdsSeoJsonLd path="/taro" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildForecastStructuredData({
              title: "Таро онлайн — расклады и гадание на картах",
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
