import type { Metadata } from "next";
import Link from "next/link";

import { PALM_MOUNT_SEO, PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Холмы ладони — Венера, Юпитер, Сатурн и другие | ${BRAND_NAME}`,
  description:
    "Холмы ладони в хиромантии: Венера, Юпитер, Сатурн, Аполлон, Меркурий, Марс и Луна. Как читать выраженность и снять ладонь по фото.",
  path: "/gadanie-po-ladoni/kholmy",
});

export default function PalmMountsHubPage() {
  return (
    <SeoPageShell
      breadcrumbs={[...PALM_SEO_CRUMBS, { name: "Холмы", path: "/gadanie-po-ladoni/kholmy" }]}
    >
      <SeoPageTracker goal="palm_mounts_hub" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Холмы ладони</h1>
      <p className="mt-4 text-white/70">
        Семь холмов — качества характера. Выраженный холм усиливает тон, слабый не «минус», а
        тихий регистр.
      </p>
      <div className="mt-6">
        <SeoTrackedCta
          href="/gadanie-po-ladoni"
          trackGoal="palm_seo_cta"
          trackParams={{ from: "/gadanie-po-ladoni/kholmy" }}
        >
          Снять ладонь
        </SeoTrackedCta>
      </div>
      <SeoSection title="Холмы">
        <ul className="mt-3 space-y-2">
          {PALM_MOUNT_SEO.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/gadanie-po-ladoni/kholmy/${item.slug}`}
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
