import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Совместный расклад для двоих | ${BRAND_NAME}`,
  description:
    "Совместный расклад для пары: мастер смотрит каждого отдельно и связь между вами.",
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
        Мастер смотрит не только каждого отдельно, но и связь между вами — чувства, препятствия и
        перспективу пары.
      </p>

      <p className="mt-4 text-sm text-white/50">
        {label} · {cost} ᚢ
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta
          href="/?intent=sovmestimost-pary"
          trackGoal="joint_reading_cta_click"
        >
          Расклад на совместимость
        </SeoTrackedCta>
        <SeoTrackedCta href="/?spread=love-7" variant="ghost" trackGoal="joint_reading_cta_click">
          Глубокий расклад на 7 карт
        </SeoTrackedCta>
      </div>

      <SeoSection title="Когда подходит">
        <p>Для пар, которые хотят понять динамику отношений.</p>
        <p>Когда важно увидеть и «я», и «он/она», и «мы».</p>
        <p>После конфликта, паузы или перед важным разговором.</p>
      </SeoSection>

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Все расклады
        </Link>
      </p>
    </SeoPageShell>
  );
}
