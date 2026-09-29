"use client";

import PremiumReadingBody from "@/components/PremiumReadingBody";
import { parseJointPersonalReading, type JointDisplayCard } from "@/lib/joint-reading-display";

export default function JointPersonalReading({
  content,
  cards,
  complete,
}: {
  content: string;
  cards: JointDisplayCard[];
  complete: boolean;
}) {
  const reading = parseJointPersonalReading(content, cards);
  return (
    <div className="joint-personal-reading">
      {!complete ? (
        <p className="joint-personal-reading__scope">
          Это личная часть расклада. Общая интерпретация появится, когда второй участник пройдёт свою часть.
        </p>
      ) : null}
      {reading ? (
        <>
          {reading.opening ? <p className="joint-personal-reading__lead">{reading.opening}</p> : null}
          <div className="joint-personal-reading__cards">
            {reading.cards.map((card, index) => (
              <article key={`${card.name}-${index}`} className="joint-personal-reading__card">
                <div className="joint-personal-reading__card-head">
                  <span className="joint-personal-reading__number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <span className="joint-personal-reading__position">{card.position || `Позиция ${index + 1}`}</span>
                    <h3>{card.name}</h3>
                  </div>
                </div>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
          {reading.closing ? (
            <div className="joint-personal-reading__closing">
              <span className="joint-eyebrow">Что взять с собой</span>
              <p>{reading.closing}</p>
            </div>
          ) : null}
        </>
      ) : (
        <PremiumReadingBody content={content} />
      )}
    </div>
  );
}
