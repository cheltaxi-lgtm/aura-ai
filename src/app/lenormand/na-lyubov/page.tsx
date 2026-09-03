import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Ленорман на любовь — расклад онлайн | Zovus",
  description:
    "Гадание Ленорман на любовь: линия из пяти карт про чувства, свидание и «что дальше». Короче Таро, конкретнее по сюжету — Zovus.",
  path: "/lenormand/na-lyubov",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Ленорман", path: "/lenormand" },
  { name: "На любовь", path: "/lenormand/na-lyubov" },
];

const faq = [
  {
    q: "Когда Ленорман на любовь точнее Таро?",
    a: "Когда нужен сюжет «что происходит и чем кончится ближайший шаг», а не глубокий разбор архетипов. Ленорман короче говорит о встрече, письме, ревности, третьем человеке.",
  },
  {
    q: "Какой расклад выбрать?",
    a: "Линия из пяти карт — универсальный вход. Для свидания есть отдельный вопрос в каталоге. Если нужен портрет пары на годы — лучше матрица совместимости или натал, не Ленорман.",
  },
  {
    q: "Можно ли гадать Ленорман бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро. Ленорман открывается как схема в каталоге; полный разбор линии — в сессии с мастером.",
  },
];

export default function LenormandNaLyubovPage() {
  const structuredData = buildForecastStructuredData({
    title: "Ленорман на любовь",
    description: "Расклады Ленорман на любовь, чувства и свидание — линия из пяти карт.",
    path: "/lenormand/na-lyubov",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="lenormand_love_view" />
      <p className="text-sm text-aura-gold/80">Ленорман · Любовь</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Ленорман на любовь</h1>
      <p className="mt-4 text-white/70">
        Ленорман отвечает на любовный вопрос короткими сценами: сердце, письмо, кольцо, лиса, медведь.
        Это не поэзия арканов, а сюжет «кто что делает и куда движется связь». Если вопрос про характер
        союза на годы — рядом есть матрица и натал.
      </p>

      <SeoSection title="С чего начать">
        <div className="grid gap-3">
          <Link
            href="/rasklad/lenormand-liniya"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Линия из 5 карт</p>
            <p className="mt-1 text-sm text-white/70">
              Основа, развитие, ядро, исход и ключ — универсальный любовный вход.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Открыть линию →</p>
          </Link>
          <Link
            href="/rasklady/lenormand-svidanie"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Ленорман на свидание</p>
            <p className="mt-1 text-sm text-white/70">
              Короткий вопрос про встречу, тон разговора и чем вечер может закончиться.
            </p>
            <p className="mt-2 text-sm text-aura-gold">К вопросу →</p>
          </Link>
          <Link
            href="/rasklady/lyubov"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Расклады Таро на любовь</p>
            <p className="mt-1 text-sm text-white/70">
              Если нужна глубина чувств и динамики, а не только ближайший сюжет.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Каталог любви →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/rasklad/lenormand-liniya" trackGoal="lenormand_love_cta_click">
          Разложить Ленорман на любовь
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как формулировать вопрос">
        <p>
          Лучше «что происходит между нами на этой неделе» или «чем обернётся свидание», чем «любит ли
          он меня навсегда». Ленорман хорошо держит срок и действие, плохо — абстрактную вечность.
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
        links={[
          { href: "/lenormand", label: "Все расклады Ленорман" },
          { href: "/lenormand/sochetaniya", label: "Сочетания карт" },
          { href: "/runy/na-lyubov", label: "Руны на любовь" },
          { href: "/numerology/matrica-sovmestimosti", label: "Совместимость матриц" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
