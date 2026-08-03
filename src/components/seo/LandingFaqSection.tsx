"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { LANDING_FAQ_ITEMS } from "@/lib/landing-offer";
import RuneIcon from "@/components/RuneIcon";

const RUNE = "\u16A2";

function FaqAnswer({ answer }: { answer: string }) {
  if (!answer.includes(RUNE)) return <>{answer}</>;
  const parts = answer.split(RUNE);
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

function ChevronIcon() {
  return (
    <svg
      className="landing-faq__chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.2 6.2 L8 10 L11.8 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LandingFaqSection() {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [openIndex, setOpenIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const node = listRef.current;
    if (reduce.matches) {
      setRevealed(true);
      return;
    }
    if (!node || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    // Already in view on first paint (deep-link / restore) — skip delayed reveal CLS.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <section className="landing-faq scroll-mt-24" aria-labelledby="landing-faq-title">
      <h2 id="landing-faq-title" className="landing-faq__title">
        Частые вопросы
      </h2>
      <div
        ref={listRef}
        className={`landing-faq__list${revealed ? " landing-faq__list--revealed" : ""}`}
      >
        {LANDING_FAQ_ITEMS.map(({ question, answer }, index) => {
          const panelId = `${baseId}-panel-${index}`;
          const buttonId = `${baseId}-button-${index}`;
          const isOpen = openIndex === index;
          return (
            <div
              key={question}
              className={`landing-faq__item${isOpen ? " landing-faq__item--open" : ""}`}
              style={{ "--faq-stagger": `${index * 70}ms` } as CSSProperties}
            >
              <h3 className="landing-faq__heading">
                <button
                  type="button"
                  id={buttonId}
                  className="landing-faq__q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                >
                  <span className="landing-faq__q-text">{question}</span>
                  <ChevronIcon />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="landing-faq__panel"
                aria-hidden={!isOpen}
                {...(!isOpen ? ({ inert: true } as object) : {})}
              >
                <div className="landing-faq__panel-inner">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
