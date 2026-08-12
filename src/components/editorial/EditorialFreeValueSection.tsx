"use client";

import { useScrollReveal } from "@/hooks/useScrollReveal";
import { EDITORIAL_FREE_VALUE } from "@/lib/editorial-landing-content";

export default function EditorialFreeValueSection() {
  const { ref, className } = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`editorial-section scroll-mt-24 ${className}`}
      aria-labelledby="editorial-free-value-title"
    >
      <div className="editorial-landing__inner max-w-3xl">
        <h2
          id="editorial-free-value-title"
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          {EDITORIAL_FREE_VALUE.title}
        </h2>
        <ul className="mt-6 space-y-5">
          {EDITORIAL_FREE_VALUE.items.map((item, index) => (
            <li
              key={item.title}
              className="salon-reveal__item border-b border-white/10 pb-4 last:border-0"
              style={{ ["--salon-i" as string]: index + 1 }}
            >
              <p className="font-display text-base text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/65">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
