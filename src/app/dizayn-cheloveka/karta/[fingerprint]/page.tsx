import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isHumanDesignEnabled } from "@/lib/settings";
import { getHdChartByFingerprint } from "@/lib/services/human-design-service";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import HdChartView from "@/components/human-design/HdChartView";
import { TYPE_META } from "@/lib/human-design";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}): Promise<Metadata> {
  const { fingerprint } = await params;
  const chart = await getHdChartByFingerprint(fingerprint);
  if (!chart) return { title: "Дизайн Человека" };
  const typeName = TYPE_META[chart.chart.type].nameRu;
  return {
    title: `Карта Дизайна Человека: ${typeName}, профиль ${chart.chart.profile}`,
    description: `Бодиграф: ${typeName}, авторитет, профиль ${chart.chart.profile}, инкарнационный крест. Рассчитайте свою карту бесплатно.`,
    robots: { index: false, follow: true },
    openGraph: {
      title: `${typeName} · профиль ${chart.chart.profile}`,
      description: "Карта Дизайна Человека на Zovus — рассчитайте свою бесплатно.",
      images: [{ url: `/api/human-design/og?f=${fingerprint}`, width: 1200, height: 630 }],
    },
  };
}

export default async function HdSharedChartPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  if (!(await isHumanDesignEnabled())) notFound();
  const { fingerprint } = await params;
  const chart = await getHdChartByFingerprint(fingerprint);
  if (!chart) notFound();

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <SeoPageTracker goal="hd_shared_view" params={{}} />
      <p className="text-sm text-aura-gold/80">Дизайн Человека · Карта по ссылке</p>
      <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
        {TYPE_META[chart.chart.type].nameRu} · профиль {chart.chart.profile}
      </h1>
      <p className="mt-3 text-sm text-white/55">
        Публичная ссылка показывает бодиграф без даты и места рождения.
      </p>

      <div className="mt-8">
        <HdChartView
          payload={{
            id: chart.id,
            fingerprint: chart.fingerprint,
            timeUnknown: chart.timeUnknown,
            chart: chart.chart,
          }}
        />
      </div>

      <div className="mt-10 text-center">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: "shared" }}
        >
          Рассчитать свою карту бесплатно
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
