import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание онлайн бесплатно — Таро, руны, нумерология",
  description:
    "Гадание онлайн бесплатно: Таро, руны, Ленорман, нумерология и аура по фото. Три карты без регистрации, ответ да/нет и чтение поля по портрету — Zovus.",
  path: "/gadanie",
});

const METHODS = [
  {
    title: "Таро онлайн",
    text: "Классические расклады на связь, решение и будущее — с разбором в чате. Три карты бесплатно на старте.",
    href: "/taro",
    cta: "Открыть расклад Таро",
  },
  {
    title: "Расшифровка по фото",
    text: "Сфотографируйте домашний расклад — распознаем карты и дадим персональную трактовку.",
    href: "/photo-rasklad",
    cta: "Загрузить фото",
  },
  {
    title: "Аура по фото",
    text: "Цвета вашего поля, семь слоёв и чакры по портрету — символическое чтение с мастером.",
    href: "/aura",
    cta: "Узнать свою ауру",
  },
  {
    title: "Гадание на рунах",
    text: "Старший Футарк — прямой, лаконичный ответ с Рагнаром.",
    href: "/runy",
    cta: "Спросить руны",
  },
  {
    title: "Нумерология по дате рождения",
    text: "Числа пути, матрица судьбы, квадрат Пифагора и совместимость с Эвелиной.",
    href: "/numerology",
    cta: "Перейти к числам",
  },
  {
    title: "Матрица судьбы",
    text: "Бесплатный расчёт по дате рождения на 22 арканах — схема сразу на экране.",
    href: "/numerology/destiny-matrix",
    cta: "Рассчитать матрицу",
  },
  {
    title: "Натальная карта",
    text: "Карта рождения, прогноз и совместимость — западная традиция и джйотиш.",
    href: "/natalnaya-karta",
    cta: "Открыть астрологию",
  },
  {
    title: "Ленорман онлайн",
    text: "Короткая фраза из карт — основа и исход без длинных интерпретаций.",
    href: "/lenormand",
    cta: "Открыть Ленорман",
  },
  {
    title: "Карта дня",
    text: "Одна карта на сегодня, 3 карты дня после входа и первый расклад по вопросу — три разных формата.",
    href: "/gadanie/karta-dnya",
    cta: "Разобрать карту дня",
  },
  {
    title: "Гадание на любовь",
    text: "Таро, Ленорман, руны и совместимость матриц — развилка под любовный вопрос.",
    href: "/gadanie/na-lyubov",
    cta: "Выбрать метод",
  },
  {
    title: "Гадание на будущее",
    text: "Таро на перспективу, гороскоп на сегодня и личный год — без обещания дат.",
    href: "/gadanie/na-budushchee",
    cta: "Выбрать формат",
  },
  {
    title: "Что бесплатно",
    text: "Первый расклад без регистрации, ежедневные карты дня, калькуляторы матрицы, натала и числа пути.",
    href: "/gadanie/besplatno",
    cta: "Смотреть бесплатное",
  },
] as const;

const faq = [
  {
    q: "Какое гадание онлайн самое точное?",
    a: "Точность зависит от ясности вопроса, а не от «магичности» метода. Таро — для многослойных ситуаций, руны и Ленорман — для короткого ответа, нумерология — для расчёта по дате и имени.",
  },
  {
    q: "Можно ли гадать онлайн бесплатно?",
    a: "Да. На главной три карты открываются бесплатно до регистрации. После входа классический расклад на три карты доступен раз в сутки. Полные сессии с развёрнутым разбором и продолжением в чате — за руны по тарифу сервиса.",
  },
  {
    q: "Гадание да или нет — какой метод выбрать?",
    a: "Быстрее всего — одна карта Таро или одна руна: см. страницу «Гадание да или нет». Ответ «да», «нет» или «не сейчас» с коротким пояснением.",
  },
  {
    q: "Можно ли расшифровать свой расклад по фото?",
    a: "Да — загрузите снимок на странице «Расшифровка Таро по фото». Сервис распознает карты, вы подтвердите позиции и получите персональный разбор.",
  },
];

export default function GadaniePage() {
  const structuredData = buildForecastStructuredData({
    title: "Гадание онлайн бесплатно",
    description:
      "Гадание онлайн: Таро, руны, нумерология и Ленорман — выбор метода и разбор с ИИ-наставником в чате.",
    path: "/gadanie",
    faq,
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Гадание онлайн", path: "/gadanie" },
      ]}
    >
      <SeoPageTracker goal="gadanie_hub_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание онлайн бесплатно</h1>
      <p className="mt-4 text-white/70">
        Несколько способов в одном пространстве: Таро, фото-расклад, руны, нумерология и Ленорман.
        Выберите метод под вопрос — наставник разберёт ситуацию в чате, а не выдаст общий шаблон.
        Бесплатный старт — три карты на главной без регистрации.
      </p>

      <SeoSection title="Выберите способ">
        <div className="grid gap-3 sm:grid-cols-2">
          {METHODS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
            >
              <p className="font-medium text-white">{m.title}</p>
              <p className="mt-1 text-sm text-white/70">{m.text}</p>
              <p className="mt-2 text-sm text-aura-gold">{m.cta} →</p>
            </Link>
          ))}
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?spread=triplet" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "free" }}>
          Три карты бесплатно
        </SeoTrackedCta>
        <SeoTrackedCta href="/gadanie/karta-dnya" variant="ghost" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "karta-dnya" }}>
          Карта дня
        </SeoTrackedCta>
        <SeoTrackedCta href="/gadanie/da-net" variant="ghost" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "da-net" }}>
          Быстрый ответ да / нет
        </SeoTrackedCta>
        <SeoTrackedCta href="/photo-rasklad" variant="ghost" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "photo" }}>
          Расшифровка по фото
        </SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools excludeHrefs={["/gadanie", "/taro"]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
