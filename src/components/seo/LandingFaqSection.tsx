"use client";

import Link from "next/link";
import { LANDING_FAQ_ITEMS } from "@/lib/landing-offer";
import RuneIcon from "@/components/RuneIcon";

function FaqAnswer({ answer }: { answer: string }) {
  if (!answer.includes("ᚢ")) return <>{answer}</>;
  const parts = answer.split("ᚢ");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 ? (
            <RuneIcon className="inline-block h-[0.95em] w-[0.65em] align-[-0.1em]" />
          ) : null}
        </span>
      ))}
    </>
  );
}

export default function LandingFaqSection() {
  return (
    <section className="landing-faq scroll-mt-24" aria-labelledby="landing-faq-title">
      <div className="editorial-landing__inner">
        <h2 id="landing-faq-title" className="landing-faq__title">
          Частые вопросы
        </h2>
        <div className="landing-faq__list">
          {LANDING_FAQ_ITEMS.map(({ question, answer }, index) => (
            <details key={question} className="landing-faq__item" open={index === 0}>
              <summary className="landing-faq__q">{question}</summary>
              <p className="landing-faq__a">
                <FaqAnswer answer={answer} />
                {question.includes("увидит") ? (
                  <>
                    {" "}
                    <Link href="/privacy" className="landing-faq__link">
                      Политика конфиденциальности
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
