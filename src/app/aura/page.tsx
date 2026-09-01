import type { Metadata } from "next";

import Link from "next/link";
import AuraReadingFlow from "@/components/aura/AuraReadingFlow";
import { AURA_SEO_CRUMBS } from "@/lib/seo/aura-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Аура по фото онлайн — цвета, слои поля и чакры | ${BRAND_NAME}`,
  description:
    "Узнайте цвет своей ауры по фото или с камеры: доминирующие цвета поля, семь слоёв по Бреннан и состояние чакр. Символическое чтение портрета мастером — первый разбор со скидкой 50%.",
  path: "/aura",
});

const FAQ = [
  {
    q: "Как узнать цвет своей ауры по фото?",
    a: "Загрузите портрет крупным планом или снимите себя с камеры при ровном свете. Сервис считывает цветовое поле вокруг фигуры и показывает доминирующий цвет, а мастер даёт полный разбор: семь слоёв поля, чакры и практику на ближайшие дни.",
  },
  {
    q: "Это настоящая аура-фотография?",
    a: "Нет — это символическое чтение по портрету в традициях теософии (Ледбитер), семи слоёв поля Бреннан и йогических чакр, а не съёмка прибором. Мы честно называем метод чтением, а не измерением.",
  },
  {
    q: "Что происходит с моим фото?",
    a: "Фото обрабатывается для снимка ауры и не сохраняется на сервере: остаются только цвета, состояния слоёв и чакр — без изображения лица. Оригинал остаётся на вашем устройстве.",
  },
  {
    q: "Почему при повторной съёмке цвет тот же?",
    a: "Ядро ауры в традиции стабильно неделями. Один снимок себя на календарный день: повтор откроет тот же результат, а не новую лотерею цвета. На следующий день могут сдвинуться слои и чакры — ядро обычно остаётся.",
  },
  {
    q: "Можно снять ауру другого человека?",
    a: "Да: выберите слот «Я», уже сохранённого человека или «Другой человек» и укажите имя до съёмки. Тот же слот в тот же день вернёт сегодняшний снимок. Новый слот — новое ядро. Если это тот же человек, откройте его в списке: без выбора слота другой кадр даст другой цвет. Фото по-прежнему не храним.",
  },
  {
    q: "Сколько стоит полный разбор?",
    a: `Снимок ауры и короткий тизер — бесплатно на слот. Полный разбор — ${DEFAULT_RUNE_COSTS.AURA_READING} ᚢ за человека, первый разбор аккаунта со скидкой 50%. Один разбор на человека в сутки: повтор сегодня откроет тот же текст и не спишет руны снова.`,
  },
];

export default function AuraLandingPage() {
  const cost = DEFAULT_RUNE_COSTS.AURA_READING;
  const label = RUNE_ACTION_LABELS.AURA_READING;

  return (
    <SeoPageShell breadcrumbs={AURA_SEO_CRUMBS}>
      <SeoPageTracker goal="aura_landing_view" funnelProduct="aura" />
      <p className="text-sm text-aura-gold/80">Аура и энергетика</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Аура по фото онлайн
      </h1>
      <p className="mt-4 text-white/70">
        Каждый человек несёт цветовое поле — в теософской традиции его называют аурой.
        Снимите себя с камеры или загрузите портрет: сервис покажет доминирующие цвета
        вашего поля, а мастер разберёт семь слоёв по Бреннан, состояние чакр и даст
        практику на ближайшие дни. Это чтение по портрету — честное, без «приборов»
        и медицинских обещаний.
      </p>

      <p className="mt-4 text-sm text-white/50">
        {label} · {cost} ᚢ · первый разбор −50%
      </p>

      <section className="aura-flow-host mt-8 sm:mt-10">
        <AuraReadingFlow />
      </section>

      <SeoSection title="Карта поля: цвета, слои, чакры" id="karta-polya">
        <ul className="mt-3 space-y-2 text-white/70">
          <li>
            <Link href="/aura/cveta" className="text-aura-gold hover:underline">
              Значение цветов ауры
            </Link>
            {" — "}золотой, синий, красный, дымчатый и остальные тона ядра.
          </li>
          <li>
            <Link href="/aura/sloi" className="text-aura-gold hover:underline">
              Семь слоёв по Бреннан
            </Link>
            {" — "}от эфирного до каузального.
          </li>
          <li>
            <Link href="/aura/chakry" className="text-aura-gold hover:underline">
              Семь чакр
            </Link>
            {" — "}состояние откроется в полном разборе.
          </li>
          <li>
            <Link href="/aura/kak-uznat-cvet" className="text-aura-gold hover:underline">
              Как узнать цвет ауры
            </Link>
            {" · "}
            <Link href="/aura/chtenie-ili-kirlian" className="text-aura-gold hover:underline">
              чтение или Кирлиан
            </Link>
            {" · "}
            <Link href="/aura/smeshannoe-pole" className="text-aura-gold hover:underline">
              смешанное поле
            </Link>
            {" · "}
            <Link href="/aura/foto-i-chakry" className="text-aura-gold hover:underline">
              фото и чакры
            </Link>
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Что вы получите" id="chto-vhodit">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-white/70">
          <li>Доминирующий и дополнительные цвета вашего поля — с трактовкой по теософской школе цвета.</li>
          <li>Семь слоёв поля по Барбаре Бреннан: от эфирного до каузального — где ресурс, где провал.</li>
          <li>Состояние семи чакр: что открыто, что в балансе, где блок и что с ним делать.</li>
          <li>Практика на ближайшие дни — конкретные шаги под состояние вашего поля.</li>
        </ul>
      </SeoSection>

      <SeoSection title="Как снять ауру правильно" id="kak-snyat">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-white/70">
          <li>Лицо крупным планом, по плечи — как для фото на документы, только расслабленным.</li>
          <li>Ровный дневной свет или мягкая лампа — без жёстких теней и подсветки сзади.</li>
          <li>Без солнцезащитных очков и сильных фильтров — они закрывают поле.</li>
          <li>Спокойное состояние: пара медленных вдохов перед снимком делает поле яснее.</li>
        </ul>
      </SeoSection>

      <SeoSection title="Вопросы об ауре по фото" id="faq">
        <div className="mt-3 space-y-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-medium text-white/85">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-white/60">{item.a}</p>
            </details>
          ))}
        </div>
      </SeoSection>

      <SeoRelatedTools excludeHrefs={["/aura"]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
    </SeoPageShell>
  );
}
