"use client";

import type { ReactNode } from "react";
import FlowStepper, { type FlowStep } from "@/components/FlowStepper";

type Props = {
  step: FlowStep;
  title?: string;
  completed?: FlowStep[];
  children: ReactNode;
};

export default function SessionFlowLayout({ step, title, completed, children }: Props) {
  return (
    <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-8 md:py-12">
      <FlowStepper current={step} completed={completed} />
      {title ? <h1 className="sr-only">{title}</h1> : null}
      {children}
    </main>
  );
}
