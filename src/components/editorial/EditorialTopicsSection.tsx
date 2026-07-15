"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import { EDITORIAL_TOPICS } from "@/lib/editorial-landing-content";

type EditorialTopicsSectionProps = {
  onTopic: (intentSlug: string) => void;
};

export default function EditorialTopicsSection({ onTopic }: EditorialTopicsSectionProps) {
  return (
    <section className="editorial-section">
      <div className="editorial-landing__inner">
        <h2 className="editorial-section__title">Что сейчас откликается?</h2>
        <div className="editorial-topics__grid">
          {EDITORIAL_TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className="editorial-topic-card"
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
