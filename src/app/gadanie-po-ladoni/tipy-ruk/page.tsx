import type { Metadata } from "next";
import Link from "next/link";

import { PALM_SHAPE_SEO, PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Типы рук в хиромантии — земля, воздух, огонь, вода | ${BRAND_NAME}`,
  description:
    "Четыре типа руки в хиромантии: земля, воздух, огонь и вода. Как узнать свой тип по фото ладони.",
  path: "/gadanie-po-ladoni/tipy-ruk",
});

export default function PalmShapesHubPage() {
  return (
    <SeoPageShell
      breadcrumbs={[...PALM_SEO_CRUMBS, { name: "Типы рук", path: "/gadanie-po-ladoni/tipy-ruk" }]}
    >
      <SeoPageTracker goal="palm_shapes_hub" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Типы рук</h1>
      <p className="mt-4 text-white/70">
        Форма ладони и длина пальцев задают стихию руки. Это первый слой чтения — до линий и
        холмов.
      </p>
      <div className="mt-6">
        <SeoTrackedCta
          href="/gadanie-po-ladoni"
          trackGoal="palm_seo_cta"
          trackParams={{ from: "/gadanie-po-ladoni/tipy-ruk" }}
        >
          Снять ладонь
        </SeoTrackedCta>
      </div>
      <SeoSection title="Стихии">
        <ul className="mt-3 space-y-2">
          {PALM_SHAPE_SEO.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/gadanie-po-ladoni/tipy-ruk/${item.slug}`}
                className="text-aura-gold hover:underline"
              >
                {item.h1}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>
    </SeoPageShell>
  );
}
