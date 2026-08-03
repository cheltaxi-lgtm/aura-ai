import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildArticleStructuredData } from "@/lib/seo/structured-data";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { ELEMENT_PAIRS, bestMatchSignsFor, elementCompatibilityText, elementLabel } from "@/lib/seo/zodiac-compatibility";

export const metadata: Metadata = buildSeoMetadata({
  title: "Совместимость знаков зодиака онлайн | Zovus",
  description:
    "Совместимость знаков зодиака по стихиям: кто с кем лучше сходится, а где нужна работа над отношениями. Плюс персональный разбор пары у мастера онлайн.",
  path: "/sovmestimost-znakov-zodiaka",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Совместимость знаков зодиака", path: "/sovmestimost-znakov-zodiaka" },
];

const faq = [
  {
    question: "Совместимость знаков зодиака показывает точный результат?",
    answer:
      "Нет — это общая тенденция по стихиям (Огонь, Земля, Воздух, Вода), а не индивидуальный прогноз. Знак Солнца не учитывает всю натальную карту, поэтому реальная совместимость пары зависит от гораздо большего числа факторов.",
  },
  {
    question: "Какие знаки зодиака самые совместимые?",
    answer:
      "Знаки одной стихии (например, два огненных — Овен, Лев, Стрелец) обычно легко находят общий язык, а стихии-соседи (Огонь–Воздух, Земля–Вода) хорошо дополняют друг друга. Противоположные стихии (Огонь–Вода, Земля–Воздух) требуют больше осознанности.",
  },
  {
    question: "Что делать, если знаки «несовместимы» по стихиям?",
    answer:
      "Совместимость по стихиям — это стартовая гипотеза, а не приговор. Многие пары с «сложным» сочетанием строят крепкие отношения — важнее конкретная карта рождения, характеры и готовность работать над связью. Для персонального взгляда на пару можно сделать расклад Таро на совместимость или числовой расчёт по датам рождения.",
  },
];

export default function ZodiacCompatibilityPage() {
  const structuredData = buildArticleStructuredData({
    title: "Совместимость знаков зодиака",
    description:
      "Совместимость знаков зодиака по стихиям — кто с кем сходится легко, а где нужна работа над отношениями.",
    path: "/sovmestimost-znakov-zodiaka",
    bodyText: [
      ...ELEMENT_PAIRS.map((p) => elementCompatibilityText(p.a, p.b)),
      ...faq.map((f) => `${f.question} ${f.answer}`),
    ].join(" "),
  });

  return (
    <SeoPageShell backHref="/prognoz" backLabel="Гороскоп">
      <SeoPageTracker goal="zodiac_compat_view" />
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Гороскоп · Совместимость</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Совместимость знаков зодиака</h1>
      <p className="mt-4 text-white/70">
        Совместимость знаков зодиака в классической астрологии начинается со стихий — Огня, Земли,
        Воздуха и Воды. Стихия задаёт темп и стиль отношений: где двум людям легко, а где нужно
        осознанно работать над пониманием друг друга.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?spread=compatibility-12" trackGoal="zodiac_compat_cta_click">
          Разобрать пару с мастером
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/numerology/compatibility"
          variant="ghost"
          trackGoal="zodiac_compat_cta_click"
          trackParams={{ target: "numerology" }}
        >
          Совместимость по дате рождения
        </SeoTrackedCta>
      </div>

      <SeoSection title="Совместимость по стихиям">
        {ELEMENT_PAIRS.map((p) => (
          <div key={`${p.a}-${p.b}`}>
            <h3 className="font-medium text-white">
              {p.a === p.b ? `${elementLabel(p.a)} + ${elementLabel(p.a)}` : `${elementLabel(p.a)} + ${elementLabel(p.b)}`}
            </h3>
            <p className="mt-1">{elementCompatibilityText(p.a, p.b)}</p>
          </div>
        ))}
      </SeoSection>

      <SeoSection title="Лучшие пары по знакам">
        <ul className="space-y-2">
          {SEO_ZODIAC_SIGNS.map((sign) => {
            const matches = bestMatchSignsFor(sign);
            return (
              <li key={sign.slug} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-aura-gold">
                  {sign.emoji} {sign.name}
                </span>{" "}
                — лучше всего сходится с{" "}
                {matches.map((m, i) => (
                  <span key={m.slug}>
                    {i > 0 ? (i === matches.length - 1 ? " и " : ", ") : ""}
                    <Link
                      href={`/prognoz/znak/${m.slug}`}
                      className="text-aura-gold hover:underline"
                    >
                      {m.name.toLowerCase()}
                    </Link>
                  </span>
                ))}
                .
              </li>
            );
          })}
        </ul>
      </SeoSection>

      <SeoSection title="Персональный разбор пары">
        <p>
          Стихии дают общий вектор, но точную картину пары показывает расклад Таро на{" "}
          <Link href="/rasklad/sovmestimost-12" className="text-aura-gold hover:underline">
            совместимость на 12 карт
          </Link>{" "}
          или числовой расчёт{" "}
          <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
            совместимости по дате рождения
          </Link>
          . Оба способа учитывают конкретных людей, а не только знак Солнца.
        </p>
        <p>
          Ежедневный гороскоп по своему знаку можно посмотреть в разделе{" "}
          <Link href="/prognoz" className="text-aura-gold hover:underline">
            прогнозов
          </Link>
          .
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <SeoSection title="Также на Zovus">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <li>
            <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
              Натальная карта
            </Link>
          </li>
          <li>
            <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
              Матрица судьбы
            </Link>
          </li>
          <li>
            <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
              Совместимость по дате рождения
            </Link>
          </li>
          <li>
            <Link href="/joint-reading" className="text-aura-gold hover:underline">
              Совместный расклад
            </Link>
          </li>
        </ul>
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
