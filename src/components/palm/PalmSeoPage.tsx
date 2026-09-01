import type { ReactNode } from "react";
import Link from "next/link";

import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import type { PalmSeoEntry, PalmSeoRelated } from "@/lib/seo/palm-content";

export function PalmSeoPage({
  page,
  path,
  goal,
  breadcrumbs,
  kicker,
  extraRelated,
  children,
}: {
  page: PalmSeoEntry;
  path: string;
  goal: string;
  breadcrumbs: BreadcrumbItem[];
  kicker: string;
  extraRelated?: PalmSeoRelated[];
  children?: ReactNode;
}) {
  const structuredData = buildForecastStructuredData({
    title: page.h1,
    description: page.metaDescription,
    path,
    faq: page.faq,
  });
  const related = extraRelated
    ? [...extraRelated, ...page.related].filter(
        (item, i, arr) => arr.findIndex((x) => x.href === item.href) === i
      )
    : page.related;

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal={goal} funnelProduct="palm" funnelSource={goal} />

      <p className="text-sm text-aura-gold/80">{kicker}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{page.h1}</h1>
      <p className="mt-4 text-white/70">{page.intro}</p>

      <div className="mt-6">
        <SeoTrackedCta
          href="/gadanie-po-ladoni"
          trackGoal="palm_seo_cta"
          trackParams={{ from: path }}
        >
          Снять ладонь
        </SeoTrackedCta>
      </div>

      {page.sections.map((section) => (
        <SeoSection key={section.heading} title={section.heading}>
          <p className="mt-3 text-white/70">{section.body}</p>
        </SeoSection>
      ))}

      {children}

      {page.faq.length > 0 && (
        <SeoSection title="Частые вопросы">
          <dl className="mt-4 space-y-4">
            {page.faq.map((item) => (
              <div key={item.q}>
                <dt className="font-medium text-white">{item.q}</dt>
                <dd className="mt-1 text-white/65">{item.a}</dd>
              </div>
            ))}
          </dl>
        </SeoSection>
      )}

      {related.length > 0 && (
        <SeoSection title="Смотрите также">
          <ul className="mt-3 space-y-2">
            {related.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-aura-gold hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      )}
    </SeoPageShell>
  );
}
