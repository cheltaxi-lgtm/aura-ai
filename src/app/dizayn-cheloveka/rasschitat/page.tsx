import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import HdCalculator from "@/components/human-design/HdCalculator";

export const metadata: Metadata = buildSeoMetadata({
  title: "Рассчитать карту Дизайна Человека бесплатно — бодиграф онлайн",
  description:
    "Бесплатный онлайн-калькулятор Дизайна Человека: введите дату, время и место рождения — получите тип, стратегию, авторитет, профиль, каналы и интерактивный бодиграф. Без регистрации.",
  path: "/dizayn-cheloveka/rasschitat",
});

export default function HumanDesignCalculatePage() {
  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <SeoPageTracker goal="hd_calc_view" params={{}} />
      <p className="text-sm text-aura-gold/80">Дизайн Человека · Калькулятор</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Рассчитать карту Дизайна Человека
      </h1>
      <p className="mt-4 text-white/70">
        Укажите данные рождения — расчёт выполняется по точным эфемеридам с истинным
        лунным узлом и моментом Дизайна ровно за 88° солярной дуги до рождения.
      </p>

      <div className="mt-8">
        <HdCalculator returnTo="/dizayn-cheloveka/rasschitat" />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-white/40">
        Дизайн Человека — система символической интерпретации. Результат не является
        медицинской, юридической или финансовой рекомендацией.
      </p>
    </SeoPageShell>
  );
}
