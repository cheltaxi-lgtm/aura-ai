import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_PROFILE_SEO, hdProfileSeoBySlug } from "@/lib/human-design/seo-content";

export function generateStaticParams() {
  return HD_PROFILE_SEO.map((p) => ({ profile: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profile: string }>;
}): Promise<Metadata> {
  const { profile } = await params;
  const seo = hdProfileSeoBySlug(profile);
  if (!seo) return { title: "Дизайн Человека" };
  return buildSeoMetadata({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/profili/${seo.slug}`,
  });
}

const PROFILE_FAQ = (profile: string) => [
  {
    q: `Как узнать, что у меня профиль ${profile}?`,
    a: "Профиль рассчитывается по линиям Солнца/Земли Личности и Дизайна. Введите дату, время и место рождения в бесплатном калькуляторе — профиль показывается вместе с типом и авторитетом.",
  },
  {
    q: "Профиль может измениться в течение жизни?",
    a: "Нет, профиль задан моментом рождения. Меняется его проживание: линии 3 и 6 проходят выраженные жизненные этапы, и зрелое проживание профиля заметно отличается от юношеского.",
  },
] as const;

export default async function HdProfilePage({
  params,
}: {
  params: Promise<{ profile: string }>;
}) {
  const { profile } = await params;
  const seo = hdProfileSeoBySlug(profile);
  if (!seo) notFound();

  const faq = PROFILE_FAQ(seo.profile);
  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/profili/${seo.slug}`,
    faq: faq.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_profile_view" params={{ profile: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Профили</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{seo.title}</h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: `profile_${seo.slug}` }}
        >
          Узнать свой профиль бесплатно
        </SeoTrackedCta>
      </div>

      <SeoSection title={`Линии профиля ${seo.profile}`}>
        <p>{seo.lines}</p>
      </SeoSection>

      <SeoSection title="Профиль в жизни, работе и отношениях">
        <p>{seo.inLife}</p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <dl className="space-y-4">
          {faq.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-white/90">{item.q}</dt>
              <dd className="mt-1 text-white/70">{item.a}</dd>
            </div>
          ))}
        </dl>
      </SeoSection>

      <SeoSection title="Другие профили">
        <ul className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
          {HD_PROFILE_SEO.filter((p) => p.slug !== seo.slug).map((p) => (
            <li key={p.slug}>
              <Link
                href={`/dizayn-cheloveka/profili/${p.slug}`}
                className="text-aura-gold underline-offset-4 transition hover:underline"
              >
                {p.profile}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>
    </SeoPageShell>
  );
}
