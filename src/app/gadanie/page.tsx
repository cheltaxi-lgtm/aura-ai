import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildArticleStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание онлайн бесплатно: Таро, руны, нумерология | Zovus",
  description:
    "Гадание онлайн на выбор: Таро, руны, нумерология и Ленорман. Короткий ответ да/нет или подробный разбор ситуации с ИИ-наставником в чате.",
  path: "/gadanie",
});

const METHODS = [
  {
    title: "Таро онлайн",
    text: "Классические расклады на связь, решение и будущее — с Вероникой или Мариной.",
    href: "/taro",
    cta: "Открыть расклад Таро",
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
] as const;

const faq = [
  {
    question: "Какое гадание онлайн самое точное?",
    answer:
      "Точность зависит от ясности вопроса, а не от «магичности» метода. Таро — для многослойных ситуаций, руны и Ленорман — для короткого ответа, нумерология — для расчёта по дате и имени.",
  },
  {
    question: "Можно ли гадать онлайн бесплатно?",
    answer:
      "На главной три карты открываются бесплатно до регистрации. После входа классический расклад на три карты доступен раз в сутки. Полные сессии с развёрнутым разбором и продолжением в чате — за руны по тарифу сервиса.",
  },
  {
    question: "Гадание да или нет — какой метод выбрать?",
    answer:
      "Быстрее всего — одна карта Таро или одна руна: см. страницу «Гадание да или нет». Ответ «да», «нет» или «не сейчас» с коротким пояснением.",
  },
];

export default function GadaniePage() {
  const structuredData = buildArticleStructuredData({
    title: "Гадание онлайн",
    description:
      "Гадание онлайн: Таро, руны, нумерология и Ленорман — выбор метода и разбор с ИИ-наставником в чате.",
    path: "/gadanie",
    bodyText: [
      ...METHODS.map((m) => `${m.title}: ${m.text}`),
      ...faq.map((f) => `${f.question} ${f.answer}`),
    ].join(" "),
  });

  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <SeoPageTracker goal="gadanie_hub_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание онлайн</h1>
      <p className="mt-4 text-white/70">
        Несколько способов в одном пространстве: Таро, руны, нумерология и Ленорман. Выберите метод
        под вопрос — ИИ-наставник в образе традиции разберёт ситуацию в чате, а не выдаст общий
        шаблон.
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
        <SeoTrackedCta href="/gadanie/da-net" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "da-net" }}>
          Быстрый ответ да / нет
        </SeoTrackedCta>
        <SeoTrackedCta href="/taro" variant="ghost" trackGoal="gadanie_hub_cta_click" trackParams={{ target: "taro" }}>
          Все расклады Таро
        </SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
