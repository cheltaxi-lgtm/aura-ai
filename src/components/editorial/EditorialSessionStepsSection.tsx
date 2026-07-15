"use client";

import { BookOpen, Layers, Mail, MessageCircle } from "lucide-react";
import { EDITORIAL_SECTION_IDS, EDITORIAL_SESSION_STEPS } from "@/lib/editorial-landing-content";

const STEP_ICONS = {
  question: Mail,
  cards: Layers,
  book: BookOpen,
  chat: MessageCircle,
} as const;

type EditorialSessionStepsSectionProps = Record<string, never>;

export default function EditorialSessionStepsSection(_props: EditorialSessionStepsSectionProps) {
  return (
    <section id={EDITORIAL_SECTION_IDS.session} className="editorial-section scroll-mt-24">
      <div className="editorial-landing__inner">
        <h2 className="editorial-section__title">Как проходит сеанс</h2>
        <div className="editorial-steps__grid">
          {EDITORIAL_SESSION_STEPS.map((step) => {
            const Icon = STEP_ICONS[step.icon];
            return (
              <div key={step.title} className="editorial-step">
                <span className="editorial-step__icon" aria-hidden>
                  <Icon className="h-7 w-7" strokeWidth={1.25} />
                </span>
                <h3 className="editorial-step__title">{step.title}</h3>
                <p className="editorial-step__text">{step.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
