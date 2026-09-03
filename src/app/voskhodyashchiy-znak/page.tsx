import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Восходящий знак — асцендент по дате, времени и месту | Zovus",
  description:
    "Что такое восходящий знак (асцендент) и почему его нельзя честно посчитать только по дате. Постройте натальную карту с временем и местом — Zovus.",
  path: "/voskhodyashchiy-znak",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Натальная карта", path: "/natalnaya-karta" },
  { name: "Восходящий знак", path: "/voskhodyashchiy-znak" },
];

const faq = [
  {
    q: "Можно ли узнать асцендент только по дате рождения?",
    a: "Нет. Восходящий знак меняется примерно каждые два часа. Без времени и места это угадывание, а не расчёт.",
  },
  {
    q: "Чем асцендент отличается от знака Солнца?",
    a: "Солнце — ядро характера. Асцендент — как вы входите в мир, первое впечатление и точка отсчёта домов карты.",
  },
  {
    q: "Что делать, если время неизвестно?",
    a: "Постройте солнечную карту без домов или начните с матрицы судьбы по дате. Не подставляйте «полдень» и не называйте это асцендентом.",
  },
];

export default function VoskhodyashchiyZnakPage() {
  const structuredData = buildForecastStructuredData({
    title: "Восходящий знак — асцендент",
    description: "Асцендент считается только по дате, времени и месту рождения.",
    path: "/voskhodyashchiy-znak",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="rising_sign_view" />
      <p className="text-sm text-aura-gold/80">Астрология · Асцендент</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Восходящий знак — асцендент по времени рождения</h1>
      <p className="mt-4 text-white/70">
        Восходящий знак — это не «второй зодиак по дате». Это точка горизонта в момент рождения.
        Чтобы увидеть его честно, нужны дата, время и место. Калькулятор натала на Zovus считает
        именно так — без угадывания минуты.
      </p>

      <SeoSection title="Что нужно для расчёта">
        <ul className="list-disc space-y-2 pl-5 text-white/70">
          <li>Дата рождения</li>
          <li>Время — чем точнее, тем лучше (час уже лучше, чем «утро»)</li>
          <li>Город или координаты</li>
        </ul>
        <p className="mt-3">
          Если времени нет, не обещаем асцендент. Можно смотреть планеты в знаках или открыть{" "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            матрицу по дате
          </Link>
          .
        </p>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/natalnaya-karta" trackGoal="rising_sign_cta_click">
          Построить натальную карту
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/natal-ili-matrica"
          variant="ghost"
          trackGoal="rising_sign_cta_click"
          trackParams={{ target: "compare" }}
        >
          Натал или матрица
        </SeoTrackedCta>
      </div>

      <SeoSection title="Зачем асцендент">
        <p>
          Он задаёт дома: где в карте работа, отношения, ресурсы. Без него гороскоп «на сегодня по
          знаку» остаётся шаблоном на двенадцатую часть неба. Синастрия тоже слабее, если у партнёра
          нет времени.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools
        extraLinks={[
          { href: "/natalnaya-karta/sovmestimost", label: "Синастрия" },
          { href: "/goroskop-na-segodnya", label: "Гороскоп на сегодня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
