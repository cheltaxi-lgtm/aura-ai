"use client";

import { motion } from "framer-motion";

export type FlowStep = "intro" | "onboarding" | "triplet" | "masters" | "intention" | "chat";

const STEPS: { id: FlowStep; label: string }[] = [
  { id: "intro", label: "Начало" },
  { id: "onboarding", label: "Профиль" },
  { id: "triplet", label: "Карты" },
  { id: "masters", label: "Мастер" },
  { id: "intention", label: "Намерение" },
  { id: "chat", label: "Чат" },
];

interface FlowStepperProps {
  current: FlowStep;
  /** When set, only these steps show as completed; otherwise all steps before `current` are done. */
  completed?: FlowStep[];
}

export default function FlowStepper({ current, completed }: FlowStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  if (current === "intro") return null;

  const visibleSteps = STEPS.slice(1);

  const isStepDone = (stepId: FlowStep, index: number) => {
    if (completed) return completed.includes(stepId);
    return index < currentIndex;
  };

  return (
    <motion.nav
      className="mb-10 md:mb-12"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ol className="mx-auto flex max-w-xl items-start justify-between gap-1">
        {visibleSteps.map((step, i) => {
          const index = i + 1;
          const isActive = step.id === current;
          const isDone = isStepDone(step.id, index);

          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center">
              {i > 0 && (
                <div
                  className={`absolute right-1/2 top-3.5 -z-10 h-px w-full translate-x-[-50%] ${
                    isDone ? "bg-gradient-to-r from-aura-gold/60 to-aura-gold/40" : "bg-white/10"
                  }`}
                  style={{ width: "calc(100% + 0.5rem)", left: "calc(-50% + 0.25rem)" }}
                />
              )}

              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-br from-aura-gold to-aura-gold/70 text-white shadow-[0_0_20px_rgba(201,162,74,0.5)]"
                    : isDone
                      ? "border border-aura-gold/40 bg-aura-gold/10 text-aura-gold"
                      : "border border-white/10 bg-black/50 text-gray-600"
                }`}
              >
                {isDone ? "✓" : index}
              </span>

              <span
                className={`mt-2 text-center text-xs font-medium uppercase tracking-wider ${
                  isActive ? "text-aura-gold" : isDone ? "text-gray-500" : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );
}
