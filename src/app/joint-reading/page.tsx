import type { Metadata } from "next";

import Link from "next/link";

import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";

import { BRAND_NAME } from "@/lib/brand";

import { buildSeoMetadata } from "@/lib/seo/metadata";

import SeoTrackedCta from "@/components/seo/SeoTrackedCta";

import JointReadingInvite from "@/components/seo/JointReadingInvite";

import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";



export const metadata: Metadata = buildSeoMetadata({

  title: `Совместный расклад для двоих | ${BRAND_NAME}`,

  description:

    "Совместный расклад для пары, друзей или бизнес-партнёров: мастер смотрит каждого отдельно и связь между вами. Пригласите вторым участником по ссылке.",

  path: "/joint-reading",

});



export default function JointReadingPage() {

  const cost = DEFAULT_RUNE_COSTS.JOINT_READING;

  const label = RUNE_ACTION_LABELS.JOINT_READING;



  return (

    <SeoPageShell>

      <p className="text-sm text-aura-gold/80">Совместный расклад</p>

      <h1 className="mt-2 font-display text-3xl font-bold">Совместный расклад для двоих</h1>

      <p className="mt-4 text-white/70">

        Мастер смотрит не только каждого отдельно, но и связь между вами — подходит для пары, друзей

        или бизнес-партнёров. Отправьте ссылку второму участнику — каждый проходит свой расклад в

        удобное время.

      </p>



      <p className="mt-4 text-sm text-white/50">

        {label} · {cost} ᚢ

      </p>



      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="#joint-invite" trackGoal="joint_reading_cta_click">
          Создать совместный расклад
        </SeoTrackedCta>
        <SeoTrackedCta href="/rasklady/sovmestimost-pary" variant="ghost" trackGoal="joint_reading_cta_click">
          Обычный расклад на совместимость
        </SeoTrackedCta>
      </div>



      <JointReadingInvite />



      <SeoSection title="Когда подходит">

        <p>Для пар, которые хотят понять динамику отношений.</p>

        <p>Для друзей — проверить крепость и глубину дружбы.</p>

        <p>Для бизнес-партнёров — оценить сильные стороны и риски союза.</p>

        <p>После конфликта, паузы или перед важным разговором.</p>

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
            <Link href="/sovmestimost-znakov-zodiaka" className="text-aura-gold hover:underline">
              Совместимость знаков
            </Link>
          </li>
          <li>
            <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
              Совместимость по дате
            </Link>
          </li>
        </ul>
      </SeoSection>



      <p className="mt-10">

        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">

          ← Все расклады

        </Link>

      </p>

    </SeoPageShell>

  );

}

