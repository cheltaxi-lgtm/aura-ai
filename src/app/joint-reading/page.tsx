import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import JointReadingInvite from "@/components/seo/JointReadingInvite";
import JointReadingArchive from "@/components/joint/JointReadingArchive";

export const metadata: Metadata = buildSeoMetadata({
  title: `Совместный расклад для двоих | ${BRAND_NAME}`,
  description:
    "Совместный расклад для пары, друзей или бизнес-партнёров: каждый проходит свой расклад, затем получает общую интерпретацию. Пригласите второго участника по ссылке.",
  path: "/joint-reading",
});

const STEPS = [
  {
    number: "01",
    title: "Создайте приглашение",
    text: "Выберите тему и глубину. Ссылка появится сразу после создания.",
  },
  {
    number: "02",
    title: "Пройдите каждый свой расклад",
    text: "Вы и второй участник проходите выбранную схему со своих аккаунтов в удобное время.",
  },
  {
    number: "03",
    title: "Откройте общий результат",
    text: "Когда оба закончат, здесь появится общая интерпретация и останется доступной в истории.",
  },
];

const FAQ = [
  {
    question: "Нужно проходить расклад одновременно?",
    answer: "Нет. Сначала создайте приглашение, затем каждый участник проходит свой расклад в удобное время. Ссылка действует 14 дней.",
  },
  {
    question: "За что списываются руны?",
    answer: "Инициатор оплачивает создание приглашения. Затем каждый участник отдельно оплачивает свой расклад; его стоимость зависит от выбранной схемы. Точная цена показана перед подтверждением.",
  },
  {
    question: "Где найти готовый результат?",
    answer: "Ваши приглашения и результаты всегда доступны в истории на этой странице и в кабинете. Общая интерпретация появляется после завершения обоих личных раскладов.",
  },
];

export default function JointReadingPage() {
  return (
    <SeoPageShell wide>
      <section className="joint-hero" aria-labelledby="joint-title">
        <div className="joint-hero__copy">
          <p className="joint-eyebrow">Одна история · два взгляда</p>
          <h1 id="joint-title">Совместный расклад для двоих</h1>
          <p className="joint-hero__lead">
            Каждый получает личный расклад, а затем — общую интерпретацию вашей связи.
            Подходит для пары, дружбы или делового союза.
          </p>
          <div className="joint-hero__facts" aria-label="Как устроена оплата">
            <span>Стоимость приглашения — перед созданием</span>
            <span>Каждый оплачивает свой расклад отдельно</span>
            <span>Ссылка действует 14 дней</span>
          </div>
          <div className="joint-hero__actions">
            <SeoTrackedCta href="#joint-invite" trackGoal="joint_reading_cta_click">Создать приглашение</SeoTrackedCta>
            <SeoTrackedCta href="#joint-history" variant="ghost" trackGoal="joint_reading_cta_click">Моя история</SeoTrackedCta>
          </div>
          <p className="joint-hero__note">Символическое чтение карт, не предсказание гарантированного исхода. 18+.</p>
        </div>
        <div className="joint-hero__art" aria-hidden="true">
          <span className="joint-hero__orbit joint-hero__orbit--one" />
          <span className="joint-hero__orbit joint-hero__orbit--two" />
          <span className="joint-hero__star joint-hero__star--one">✦</span>
          <span className="joint-hero__star joint-hero__star--two">✦</span>
          <span className="joint-hero__art-label">ДВА ПУТИ · ОДИН ВЗГЛЯД</span>
        </div>
      </section>

      <div className="joint-workspace">
        <JointReadingArchive />
        <JointReadingInvite />
      </div>

      <section className="joint-steps" aria-label="Как проходит совместный расклад">
        {STEPS.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <div className="joint-after">
        <section className="joint-faq" aria-labelledby="joint-faq-title">
          <p className="joint-eyebrow">Перед началом</p>
          <h2 id="joint-faq-title">Частые вопросы</h2>
          {FAQ.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
        <section className="joint-related" aria-labelledby="joint-related-title">
          <p className="joint-eyebrow">Ещё на Zovus</p>
          <h2 id="joint-related-title">Другие способы узнать друг друга</h2>
          <Link href="/rasklady/sovmestimost-pary">Обычный расклад на совместимость <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <Link href="/numerology/compatibility">Совместимость по дате <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <Link href="/sovmestimost-znakov-zodiaka">Совместимость знаков <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </section>
      </div>
      <Link href="/rasklady" className="joint-back">← Все расклады</Link>
    </SeoPageShell>
  );
}
