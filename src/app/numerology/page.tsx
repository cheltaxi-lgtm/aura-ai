import type { Metadata } from "next";
import Link from "next/link";
import { getCharacterById } from "@/lib/characters";
import { PRICING } from "@/lib/config/pricing";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Нумерология онлайн — числа судьбы | ${BRAND_NAME}`,
  description:
    "Эвелина поможет увидеть числа судьбы, совместимость, квадрат Пифагора и благоприятные даты.",
  path: "/numerology",
});

const NUMEROLOGY_LINKS = [
  {
    href: "/master/numerolog",
    title: "Три числа судьбы",
    text: "Полная расшифровка жизненного пути, души и личности.",
  },
  {
    href: "/numerology/pythagoras-square",
    title: "Квадрат Пифагора",
    text: "Структурный разбор характера и потенциала по дате рождения.",
  },
  {
    href: "/numerology/compatibility",
    title: "Совместимость",
    text: "Числовой анализ пары — сильные стороны и точки роста.",
  },
  {
    href: "/numerology/favorable-dates",
    title: "Благоприятные даты",
    text: "Когда лучше начинать важные дела и принимать решения.",
  },
] as const;

export default function NumerologyPage() {
  const evelina = getCharacterById("numerolog");
  const sessionCost = PRICING.NUMEROLOGY_SESSION;

  return (
    <SeoPageShell>
      <p className="text-sm text-aura-gold/80">Нумерология</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Нумерология Zovus</h1>
      <p className="mt-4 text-white/70">
        {evelina?.name ?? "Эвелина"} поможет увидеть числа судьбы, совместимость и благоприятные
        даты — с памятью сессии и продолжением в чате.
      </p>

      <p className="mt-4 text-sm text-white/50">Полная сессия · от {sessionCost} ᚢ</p>

      <div className="mt-8">
        <SeoTrackedCta href="/master/numerolog" trackGoal="numerology_cta_click">
          Начать с Эвелиной
        </SeoTrackedCta>
      </div>

      <SeoSection title="Направления">
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMEROLOGY_LINKS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm">{item.text}</p>
            </Link>
          ))}
        </div>
      </SeoSection>

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Расклады Таро
        </Link>
      </p>
    </SeoPageShell>
  );
}
