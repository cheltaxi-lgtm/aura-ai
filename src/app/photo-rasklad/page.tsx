import type { Metadata } from "next";

import Link from "next/link";

import { PHOTO_READING_GUIDE_STEPS } from "@/lib/photo-reading-guide";

import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";

import { BRAND_NAME } from "@/lib/brand";

import { buildPhotoMarkUrl, buildPhotoReadingUrl } from "@/lib/spread-intents/router";

import { buildSeoMetadata } from "@/lib/seo/metadata";

import SeoTrackedCta from "@/components/seo/SeoTrackedCta";

import SeoPageTracker from "@/components/seo/SeoPageTracker";

import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";



export const metadata: Metadata = buildSeoMetadata({

  title: `Фото-расклад Таро онлайн — распознавание и расшифровка | ${BRAND_NAME}`,

  description:

    "Сфотографируйте домашний расклад или отметьте карты вручную — Zovus распознает символы, перерисует колоду и даст персональную трактовку с мастером.",

  path: "/photo-rasklad",

});



const FAQ = [

  {

    q: "Нужна ли колода Zovus?",

    a: "Нет — подойдёт ваша физическая колода Rider-Waite, Марсель, Ленорман или приложение.",

  },

  {

    q: "Как фотографировать?",

    a: "Камера строго сверху, все карты в кадре, без бликов и размытия.",

  },

  {

    q: "Что если карты не распознались?",

    a: "Вы можете собрать расклад вручную — отметить карты и позиции перед расшифровкой.",

  },

  {

    q: "Сколько стоит?",

    a: `Полный цикл «распознавание + подтверждение + расшифровка» — ${DEFAULT_RUNE_COSTS.VISION_ANALYSIS} ᚢ. Первый фото-расклад со скидкой 50%.`,

  },

];



export default function PhotoRaskladPage() {

  const cost = DEFAULT_RUNE_COSTS.VISION_ANALYSIS;

  const label = RUNE_ACTION_LABELS.VISION_ANALYSIS;



  return (

    <SeoPageShell>

      <SeoPageTracker goal="photo_landing_view" />

      <p className="text-sm text-aura-gold/80">Фото-расклад</p>

      <h1 className="mt-2 font-display text-3xl font-bold">Фото-расклад Таро онлайн</h1>

      <p className="mt-4 text-white/70">

        Разложите карты дома, сфотографируйте расклад или отметьте символы вручную — сервис

        перерисует их в колоду, вы проверите результат и получите разбор с возможностью продолжить

        в чате.

      </p>



      <p className="mt-4 text-sm text-white/50">

        {label} · {cost} ᚢ · первая расшифровка −50%

      </p>



      <div className="mt-8 flex flex-wrap gap-3">

        <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click">

          Загрузить фото расклада

        </SeoTrackedCta>

        <SeoTrackedCta href={buildPhotoMarkUrl()} variant="ghost" trackGoal="photo_landing_cta_click">

          Отметить карты вручную

        </SeoTrackedCta>

      </div>



      <SeoSection title="До и после">

        <div className="grid gap-4 sm:grid-cols-2">

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">

            <p className="font-medium text-white">До</p>

            <p className="mt-2 text-sm text-white/60">

              Физический расклад на столе или скриншот из приложения — как вы привыкли гадать.

            </p>

          </div>

          <div className="rounded-xl border border-aura-gold/20 bg-aura-gold/5 p-4">

            <p className="font-medium text-aura-gold">После</p>

            <p className="mt-2 text-sm text-white/70">

              Цифровая колода Zovus, проверка позиций, расшифровка мастера и сохранение в кабинете.

            </p>

          </div>

        </div>

      </SeoSection>



      <SeoSection title="Как это работает">

        <ol className="space-y-4">

          {PHOTO_READING_GUIDE_STEPS.map((step, i) => (

            <li key={step.title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">

              <p className="font-medium text-white">

                {i + 1}. {step.title}

              </p>

              <p className="mt-1 text-sm">{step.text}</p>

            </li>

          ))}

        </ol>

      </SeoSection>



      <SeoSection title="Преимущества">

        <ul className="list-disc space-y-2 pl-5">

          <li>Работает с вашей реальной колодой</li>

          <li>Ручная правка, если распознавание ошиблось</li>

          <li>Учитывает перевёрнутые карты</li>

          <li>Стриминг расшифровки — текст появляется по мере чтения</li>

          <li>Озвучка и продолжение в чате с мастером</li>

        </ul>

      </SeoSection>



      <SeoSection title="Частые вопросы">

        {FAQ.map((item) => (

          <p key={item.q}>

            <strong className="text-white">{item.q}</strong> {item.a}

          </p>

        ))}

      </SeoSection>



      <SeoRelatedTools
        links={[
          { href: "/natalnaya-karta", label: "Натальная карта" },
          { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
          { href: "/taro", label: "Таро онлайн" },
          { href: "/rasklady", label: "Каталог раскладов" },
        ]}
      />

      <div className="mt-10">

        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">

          ← Каталог раскладов

        </Link>

      </div>

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

      <script

        type="application/ld+json"

        dangerouslySetInnerHTML={{

          __html: JSON.stringify({

            "@context": "https://schema.org",

            "@type": "HowTo",

            name: "Фото-расклад Таро в Zovus",

            step: PHOTO_READING_GUIDE_STEPS.map((step, index) => ({

              "@type": "HowToStep",

              position: index + 1,

              name: step.title,

              text: step.text,

            })),

          }),

        }}

      />

    </SeoPageShell>

  );

}

