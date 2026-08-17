import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { ALL_CHANNEL_SLUGS, channelSeo } from "@/lib/human-design/seo-entities";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "36 каналов Дизайна Человека — значения и динамика",
  description:
    "Справочник 36 каналов Дизайна Человека: потоки между центрами, темы определённости и практический смысл. Найдите каналы своей карты.",
  path: "/dizayn-cheloveka/kanaly",
});

const FAQ = [
  {
    q: "Что такое канал в Дизайне Человека?",
    a: "Канал — устойчивый поток между двумя центрами, когда активированы оба ворота пары. Определённый канал — стабильная сила вашей механики.",
  },
  {
    q: "Чем канал отличается от ворот?",
    a: "Ворота — отдельная тема. Канал появляется, когда активированы оба ворота пары и они соединяют два центра.",
  },
] as const;

export default async function HdChannelsIndexPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "36 каналов Дизайна Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/kanaly",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Каналы", path: "/dizayn-cheloveka/kanaly" },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_channels_index_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Каналы</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Тридцать шесть каналов
      </h1>
      <p className="mt-4 text-white/70">
        Каналы — потоки между центрами. Выберите канал, чтобы прочитать механику и
        жизненную динамику.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {ALL_CHANNEL_SLUGS.map((key) => {
          const seo = channelSeo(key);
          if (!seo) return null;
          return (
            <li key={key}>
              <Link
                href={`/dizayn-cheloveka/kanaly/${key}`}
                className="text-white/70 underline-offset-4 transition hover:text-amber-200 hover:underline"
              >
                {key} · {seo.name}
              </Link>
            </li>
          );
        })}
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
          trackParams={{ from: "channels_index" }}
        >
          Рассчитать карту и увидеть свои каналы
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
