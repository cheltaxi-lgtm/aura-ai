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
  title: `Нумерология по дате рождения онлайн | ${BRAND_NAME}`,
  description:
    "Нумерология по дате рождения: числа судьбы, совместимость по дате рождения, квадрат Пифагора и благоприятные даты с Эвелиной.",
  path: "/numerology",
});

const NUMEROLOGY_DIRECTIONS = [
  {
    title: "Три числа судьбы",
    text: "Полная расшифровка жизненного пути, души и личности.",
    action: "Нажмите «Начать с Эвелиной» и выберите расчёт «Три числа» — нужна только дата рождения.",
  },
  {
    title: "Квадрат Пифагора",
    text: "Структурный разбор характера и потенциала по дате рождения.",
    action: "В том же сеансе выберите «Квадрат Пифагора» и подтвердите дату рождения из профиля.",
  },
  {
    title: "Совместимость по дате рождения и имени",
    text: "Числовой анализ пары — сильные стороны и точки роста.",
    action: "После «Начать с Эвелиной» укажите свои данные и данные партнёра в форме совместимости.",
  },
  {
    title: "Матрица судьбы (22 аркана)",
    text: "Предназначение, таланты, деньги, отношения, род и аркан года — с бесплатным preview.",
    action: "Откройте /numerology/destiny-matrix для бесплатного расчёта или выберите «Матрица судьбы» у Эвелины.",
  },
  {
    title: "Благоприятные даты",
    text: "Когда лучше начинать важные дела и принимать решения.",
    action: "В списке расчётов Эвелины выберите «Благоприятные даты» и период, который вас интересует.",
  },
] as const;

export default function NumerologyPage() {
  const evelina = getCharacterById("numerolog");
  const sessionCost = PRICING.NUMEROLOGY_SESSION;

  return (
    <SeoPageShell>
      <SeoPageTracker goal="numerology_hub_view" />
      <p className="text-sm text-aura-gold/80">Нумерология</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Нумерология по дате рождения онлайн</h1>
      <p className="mt-4 text-white/70">
        {evelina?.name ?? "Эвелина"} рассчитает числа судьбы по дате рождения, совместимость пары,
        квадрат Пифагора и благоприятные даты — с памятью сессии и продолжением в чате.
      </p>

      <p className="mt-4 text-sm text-white/50">Полная сессия · от {sessionCost} ᚢ</p>

      <div className="mt-8">
        <SeoTrackedCta href="/?numerolog=1" trackGoal="numerology_cta_click">
          Начать с Эвелиной
        </SeoTrackedCta>
      </div>

      <SeoSection title="Направления">
        <p className="mb-4 text-sm text-white/60">
          Все расчёты открываются через одну кнопку{" "}
          <span className="text-aura-gold">«Начать с Эвелиной»</span> — дальше вы выбираете
          нужную технику в сеансе.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMEROLOGY_DIRECTIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/70">{item.text}</p>
              <p className="mt-2 text-sm text-white/50">{item.action}</p>
            </div>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="Отдельные страницы расчётов">
        <ul className="space-y-2">
          <li>
            <Link href="/numerology/pythagoras-square" className="text-aura-gold hover:underline">
              Квадрат Пифагора
            </Link>
          </li>
          <li>
            <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
              Совместимость по дате рождения
            </Link>
          </li>
          <li>
            <Link href="/numerology/name-compatibility" className="text-aura-gold hover:underline">
              Совместимость имён
            </Link>
          </li>
          <li>
            <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
              Матрица судьбы
            </Link>
          </li>
          <li>
            <Link href="/numerology/favorable-dates" className="text-aura-gold hover:underline">
              Благоприятные даты
            </Link>
          </li>
          <li>
            <Link href="/sovmestimost-znakov-zodiaka" className="text-aura-gold hover:underline">
              Совместимость знаков зодиака
            </Link>
          </li>
        </ul>
      </SeoSection>

      <p className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Расклады Таро
        </Link>
      </p>
    </SeoPageShell>
  );
}
