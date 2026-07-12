import type { Metadata } from "next";
import Link from "next/link";
import { getCharacterById } from "@/lib/characters";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildArticleStructuredData } from "@/lib/seo/structured-data";
import { RUNE_MEANINGS } from "@/lib/seo/rune-meanings";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание на рунах онлайн: значение всех 24 рун | Zovus",
  description:
    "Гадание на рунах онлайн с Рагнаром: значение всех 24 рун старшего Футарка, расклад «да или нет» и разбор вопроса по скандинавской традиции.",
  path: "/runy",
});

const faq = [
  {
    question: "Как работает гадание на рунах онлайн?",
    answer:
      "Вы формулируете вопрос, вытягиваете одну или несколько рун старшего Футарка, а Рагнар трактует их сочетание применительно к вашей ситуации — как это делали скандинавские провидцы.",
  },
  {
    question: "Сколько рун в гадании?",
    answer:
      "Классический набор — 24 руны старшего Футарка. Для быстрого ответа хватает одной руны («да/нет»), для более полной картины берут три и больше.",
  },
  {
    question: "Руны точнее Таро?",
    answer:
      "Не точнее — они просто другой инструмент. Руны дают более лаконичный, прямой ответ (24 символа против 78 карт Таро), поэтому хорошо подходят для конкретных вопросов и «да/нет».",
  },
];

export default function RunesHubPage() {
  const ragnar = getCharacterById("ragnar");
  const structuredData = buildArticleStructuredData({
    title: "Гадание на рунах онлайн",
    description:
      "Гадание на рунах онлайн: значение всех 24 рун старшего Футарка и расклад «да или нет».",
    path: "/runy",
    bodyText: [
      ...RUNE_MEANINGS.map((r) => `${r.name}: ${r.general}`),
      ...faq.map((f) => `${f.question} ${f.answer}`),
    ].join(" "),
  });

  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <SeoPageTracker goal="runes_hub_view" />
      <p className="text-sm text-aura-gold/80">Руны</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание на рунах онлайн</h1>
      <p className="mt-4 text-white/70">
        {ragnar?.name ?? "Рагнар"} читает скандинавские руны старшего Футарка — древний способ
        получить прямой, лаконичный ответ на вопрос о деньгах, отношениях или решении, которое
        нужно принять.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/master/ragnar" trackGoal="runes_hub_cta_click">
          Начать с Рагнаром
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/?spread=runes-yes-no"
          variant="ghost"
          trackGoal="runes_hub_cta_click"
          trackParams={{ target: "yes-no" }}
        >
          Руны да / нет
        </SeoTrackedCta>
      </div>

      <SeoSection title="Значение всех 24 рун">
        <div className="grid gap-2 sm:grid-cols-2">
          {RUNE_MEANINGS.map((rune) => (
            <Link
              key={rune.slug}
              href={`/runy/${rune.slug}`}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-aura-gold/40"
            >
              <span className="font-medium text-white">{rune.name}</span>
              <span className="mt-1 block text-sm text-white/60">{rune.keyword}</span>
            </Link>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="Какой расклад выбрать">
        <p>
          Для быстрого вопроса подойдёт{" "}
          <Link href="/rasklad/runy-da-net" className="text-aura-gold hover:underline">
            «Руны да или нет»
          </Link>{" "}
          — одна руна и прямой ответ. Для более глубокого разбора обсудите ситуацию с Рагнаром в
          чате — он подберёт расклад на несколько рун под ваш вопрос.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.question}>
            <h3 className="font-medium text-white">{item.question}</h3>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
