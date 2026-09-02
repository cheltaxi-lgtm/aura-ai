import type { Metadata } from "next";

import Link from "next/link";
import PalmReadingFlow from "@/components/palm/PalmReadingFlow";
import { PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
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
    q: "Можно снять обе ладони?",
    a: "Да. Левая и правая ладони — отдельные снимки. Повтор той же ладони сегодня откроет уже готовый результат, а не новую лотерею линий. Старый снимок можно удалить в списке «Ваши ладони».",
  },
  {
    q: "Сколько стоит полный разбор?",
    a: `Снимок и короткий тизер — бесплатно. Полный разбор — ${DEFAULT_RUNE_COSTS.PALM_READING} ᚢ, первый разбор со скидкой 50%. Каждая ладонь оплачивается отдельно; повтор того же снимка сегодня откроет тот же текст и не спишет руны снова.`,
  },
];

export default function PalmLandingPage() {
  return (
    <SeoPageShell breadcrumbs={PALM_SEO_CRUMBS}>
      <SeoPageTracker goal="palm_landing_view" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание по ладони</h1>
      <p className="mt-3 text-white/70">
        Сфотографируйте открытую ладонь. Zovus определит основные линии, особенности формы
        руки и подготовит персональную интерпретацию.
      </p>

      <section className="mt-6 sm:mt-8">
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
          <li>
            <Link href="/gadanie-po-ladoni/znaki" className="text-aura-gold hover:underline">
              Знаки
            </Link>
            {" — "}звезда, крест, островок, решётка.
          </li>
        </ul>
        <ul className="mt-4 space-y-2 text-white/70">
          <li>
            <Link href="/gadanie-po-ladoni/po-foto" className="text-aura-gold hover:underline">
              Как снять ладонь по фото
            </Link>
          </li>
          <li>
            <Link href="/gadanie-po-ladoni/levaya" className="text-aura-gold hover:underline">
              Левая ладонь
            </Link>
            {" · "}
            <Link href="/gadanie-po-ladoni/pravaya" className="text-aura-gold hover:underline">
              правая ладонь
            </Link>
          </li>
          <li>
            <Link href="/gadanie-po-ladoni/lyubov" className="text-aura-gold hover:underline">
              На любовь
            </Link>
            {" · "}
            <Link href="/gadanie-po-ladoni/sudba" className="text-aura-gold hover:underline">
              на судьбу
            </Link>
            {" · "}
            <Link href="/gadanie-po-ladoni/karera" className="text-aura-gold hover:underline">
              на карьеру
            </Link>
          </li>
          <li>
            <Link href="/gadanie-po-ladoni/kak-chitat" className="text-aura-gold hover:underline">
              Как читать ладонь
            </Link>
            {" · "}
            <Link href="/gadanie-po-ladoni/besplatno" className="text-aura-gold hover:underline">
              что бесплатно
            </Link>
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
