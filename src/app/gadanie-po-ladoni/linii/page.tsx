import type { Metadata } from "next";
import Link from "next/link";

import { PALM_LINE_SEO, PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Линии на ладони — жизнь, ум, сердце, судьба | ${BRAND_NAME}`,
  description:
    "Главные линии ладони в хиромантии: жизни, ума, сердца и судьбы. Как читать длину, разрывы и развилки — и снять ладонь по фото.",
  path: "/gadanie-po-ladoni/linii",
});

export default function PalmLinesHubPage() {
  return (
    <SeoPageShell
      breadcrumbs={[...PALM_SEO_CRUMBS, { name: "Линии", path: "/gadanie-po-ladoni/linii" }]}
    >
      <SeoPageTracker goal="palm_lines_hub" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Главные линии ладони</h1>
      <p className="mt-4 text-white/70">
        Четыре линии, которые читает мастер: жизни, ума, сердца и судьбы. Каждая страница —
        отдельное значение, без копий и «дверных» текстов.
      </p>
      <div className="mt-6">
        <SeoTrackedCta
          href="/gadanie-po-ladoni"
          trackGoal="palm_seo_cta"
          trackParams={{ from: "/gadanie-po-ladoni/linii" }}
        >
          Снять ладонь
        </SeoTrackedCta>
      </div>
      <SeoSection title="Линии">
        <ul className="mt-3 space-y-2">
          {PALM_LINE_SEO.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/gadanie-po-ladoni/linii/${item.slug}`}
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
