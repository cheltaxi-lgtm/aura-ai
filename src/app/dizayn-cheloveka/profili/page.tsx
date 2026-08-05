import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_PROFILE_SEO } from "@/lib/human-design/seo-content";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "Профили Дизайна Человека — все 12 профилей",
  description:
    "Двенадцать профилей Дизайна Человека: роль, стиль жизни и две линии. Разборы профилей от 1/3 до 6/3 — как читать сознательную и бессознательную линии.",
  path: "/dizayn-cheloveka/profili",
});

const FAQ = [
  {
    q: "Что такое профиль в Дизайне Человека?",
    a: "Профиль — сочетание двух линий (сознательной и бессознательной), описывающее вашу роль и стиль прохождения жизненных этапов.",
  },
  {
    q: "Сколько профилей существует?",
    a: "Двенадцать стандартных профилей: от 1/3 до 6/3. Профиль читается вместе с типом и авторитетом.",
  },
] as const;

export default async function HdProfilesIndexPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "Профили Дизайна Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/profili",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_profiles_index_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Профили</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Двенадцать профилей
      </h1>
      <p className="mt-4 text-white/70">
        Профиль — ваша роль и стиль жизни: две линии из шести, сознательная и
        бессознательная. Выберите профиль, чтобы разобрать линии и жизненные этапы.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {HD_PROFILE_SEO.map((p) => (
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

      <SeoSection title="Частые вопросы">
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <p className="font-medium text-amber-50">{item.q}</p>
              <p className="mt-1 text-white/70">{item.a}</p>
            </div>
          ))}
        </div>
      </SeoSection>

      <div className="mt-10">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: "profiles_index" }}
        >
          Узнать свой профиль
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
