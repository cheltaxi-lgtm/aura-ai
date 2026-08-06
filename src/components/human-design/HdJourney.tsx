"use client";

export type HdJourneyStepState = "done" | "current" | "locked";

export interface HdJourneyStep {
  id: string;
  label: string;
  hint?: string;
  state: HdJourneyStepState;
}

/**
 * Premium journey stepper for HD flows:
 * shows where the client is (Карта → Опора → Разбор → Диалог) and
 * anchors a single primary action at each stage.
 */
export default function HdJourney({ steps }: { steps: HdJourneyStep[] }) {
  return (
    <ol className="hd-journey" aria-label="Этапы работы с картой">
      {steps.map((step, i) => (
        <li
          key={step.id}
          className={`hd-journey__step is-${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="hd-journey__marker" aria-hidden="true">
            {step.state === "done" ? "✓" : i + 1}
          </span>
          <span className="hd-journey__text">
            <span className="hd-journey__label">{step.label}</span>
            {step.hint && <span className="hd-journey__hint">{step.hint}</span>}
          </span>
          {i < steps.length - 1 && <span className="hd-journey__link" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
