import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Кармический хвост в матрице судьбы — что это | Zovus",
  description:
    "Кармический хвост в матрице судьбы: три аркана прошлого опыта, а не «приговор». Как читать хвост на схеме Zovus и чем он отличается от числа судьбы.",
  path: "/numerology/karmicheskiy-khvost",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Кармический хвост", path: "/numerology/karmicheskiy-khvost" },
];

const faq = [
  {
    q: "Что такое кармический хвост?",
    a: "В матрице судьбы это три точки нижней линии схемы: повторяющиеся темы прошлого опыта. Это не диагноз и не «долг вселенной», а зона, где легко застрять.",
  },
  {
    q: "Можно ли рассчитать хвост отдельно от матрицы?",
    a: "На Zovus хвост — часть полной схемы по дате. Отдельного «калькулятора хвоста» без матрицы нет: иначе теряется связь с зонами любви и ресурса.",
  },
  {
    q: "Это то же самое, что кармический долг в нумерологии?",
    a: "Нет. Классические долги 13/14/16/19 — про промежуточные суммы даты. Хвост матрицы — три аркана на схеме. Разные языки.",
  },
];

export default function KarmicheskiyKhvostPage() {
  const structuredData = buildForecastStructuredData({
    title: "Кармический хвост в матрице судьбы",
    description: "Что значит кармический хвост на схеме матрицы и как его открыть.",
    path: "/numerology/karmicheskiy-khvost",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="karmic_tail_view" />
      <p className="text-sm text-aura-gold/80">Матрица судьбы · Хвост</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Кармический хвост в матрице судьбы</h1>
      <p className="mt-4 text-white/70">
        Хвост — не приговор и не «расплата». Это три аркана, которые показывают, какие сюжеты
        повторяются, пока их не называют вслух. Смотреть его отдельно от всей матрицы — всё равно
        что читать одну строку договора.
      </p>

      <SeoSection title="Где смотреть">
        <p>
          Откройте{" "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            расчёт матрицы по дате
          </Link>
          : хвост лежит в нижней части схемы (карма → середина → кончик). Полный разбор с Эвелиной
          связывает хвост с зонами любви и денег, а не пугает одной цифрой.
        </p>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="karmic_tail_cta_click">
          Рассчитать матрицу и увидеть хвост
        </SeoTrackedCta>
      </div>

      <SeoSection title="Чего здесь нет">
        <p>
          Нет отдельного «номера хвоста» без схемы и нет обещания снять карму за одну сессию. Если
          нужен только каркас характера —{" "}
          <Link href="/numerology/chislo-sudby" className="text-aura-gold hover:underline">
            число жизненного пути
          </Link>
          .
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
          { href: "/numerology/kanal-deneg", label: "Канал денег в матрице" },
          { href: "/natal-ili-matrica", label: "Натал или матрица" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
