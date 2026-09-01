import type { Metadata } from "next";

import Link from "next/link";
import PalmReadingFlow from "@/components/palm/PalmReadingFlow";
import { PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Гадание по ладони онлайн — хиромантия по фото | ${BRAND_NAME}`,
  description:
    "Гадание по ладони онлайн: снимите ладонь или загрузите фото. Тип руки, линии жизни, ума, сердца и судьбы, холмы. Символическая хиромантия — первый разбор со скидкой 50%.",
  path: "/gadanie-po-ladoni",
});

const FAQ = [
  {
    q: "Как гадать по ладони онлайн?",
    a: "Раскройте ладонь пальцами вверх при ровном свете и снимите её с камеры или загрузите фото. Сервис покажет тип руки и короткий тизер, а мастер даст полный разбор линий и холмов.",
  },
  {
    q: "Это настоящая хиромантия или ИИ?",
    a: "Это символическое чтение рисунка ладони в классической западной хиромантии: четыре типа руки, главные линии и холмы. Мы честно называем метод чтением, а не измерением и не медициной.",
  },
  {
    q: "Что происходит с моим фото?",
    a: "Фото обрабатывается для снимка ладони и не сохраняется на сервере: остаются только тип руки, линии и холмы. Оригинал остаётся на вашем устройстве.",
  },
  {
    q: "Почему повторный снимок тот же?",
    a: "Рисунок ладони стабилен неделями. Один снимок на календарный день: повтор откроет тот же результат, а не новую лотерею линий.",
  },
  {
    q: "Сколько стоит полный разбор?",
    a: `Снимок и короткий тизер — бесплатно. Полный разбор — ${DEFAULT_RUNE_COSTS.PALM_READING} ᚢ, первый разбор со скидкой 50%. Один разбор на день: повтор сегодня откроет тот же текст и не спишет руны снова.`,
  },
];

export default function PalmLandingPage() {
  const cost = DEFAULT_RUNE_COSTS.PALM_READING;
  const label = RUNE_ACTION_LABELS.PALM_READING;

  return (
    <SeoPageShell breadcrumbs={PALM_SEO_CRUMBS}>
      <SeoPageTracker goal="palm_landing_view" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание по ладони онлайн</h1>
      <p className="mt-4 text-white/70">
        Классическая хиромантия читает рисунок руки: тип ладони, линии жизни, ума, сердца и
        судьбы, холмы планет. Снимите ладонь с камеры или загрузите фото — сервис покажет тип
        руки, а мастер разберёт линии, холмы и даст практику на ближайшие дни. Это чтение по
        фото, без медицинских обещаний и без хранения снимка.
      </p>

      <p className="mt-4 text-sm text-white/50">
        {label} · {cost} ᚢ · первый разбор −50%
      </p>

      <section className="mt-8 sm:mt-10">
        <PalmReadingFlow />
      </section>

      <SeoSection title="Карта ладони: линии, холмы, типы" id="karta-ladoni">
        <ul className="mt-3 space-y-2 text-white/70">
          <li>
            <Link href="/gadanie-po-ladoni/linii" className="text-aura-gold hover:underline">
              Главные линии
            </Link>
            {" — "}жизни, ума, сердца и судьбы.
          </li>
          <li>
            <Link href="/gadanie-po-ladoni/kholmy" className="text-aura-gold hover:underline">
              Холмы ладони
            </Link>
            {" — "}Венера, Юпитер, Сатурн, Аполлон, Меркурий, Марс, Луна.
          </li>
          <li>
            <Link href="/gadanie-po-ladoni/tipy-ruk" className="text-aura-gold hover:underline">
              Типы рук
            </Link>
            {" — "}земля, воздух, огонь и вода.
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <dl className="mt-4 space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-medium text-white">{item.q}</dt>
              <dd className="mt-1 text-white/65">{item.a}</dd>
            </div>
          ))}
        </dl>
      </SeoSection>

      <SeoRelatedTools excludeHrefs={["/gadanie-po-ladoni"]} />
    </SeoPageShell>
  );
}
