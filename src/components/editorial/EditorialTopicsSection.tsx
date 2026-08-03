"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { EDITORIAL_TOPICS } from "@/lib/editorial-landing-content";

type EditorialTopicsSectionProps = {
  onTopic: (intentSlug: string) => void;
};

export default function EditorialTopicsSection({ onTopic }: EditorialTopicsSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();

  return (
    <section ref={ref} className={`editorial-section ${className} salon-reveal--stagger`}>
      <div className="editorial-landing__inner">
        <h2
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          Что сейчас откликается?
        </h2>
        <div className="editorial-topics__grid">
          {EDITORIAL_TOPICS.map((topic, index) => (
            <button
              key={topic.id}
              type="button"
              className="editorial-topic-card salon-reveal__item"
              style={{ ["--salon-i" as string]: index + 1 }}
              onClick={() => onTopic(topic.intentSlug)}
            >
              <EditorialImage src={topic.image} alt="" className="editorial-topic-card__img" />
              <div className="editorial-topic-card__overlay" aria-hidden />
              <div className="editorial-topic-card__copy">
                <span className="editorial-topic-card__title">{topic.title}</span>
                <span className="editorial-topic-card__subtitle">{topic.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
