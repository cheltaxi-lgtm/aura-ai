"use client";

import Link from "next/link";
import EditorialImage from "@/components/editorial/EditorialImage";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { EDITORIAL_PRACTICES, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { buildRegisterHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";

type EditorialPracticesSectionProps = {
  isLoggedIn: boolean;
};

export default function EditorialPracticesSection({ isLoggedIn }: EditorialPracticesSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      id={EDITORIAL_SECTION_IDS.practices}
      className={`editorial-section scroll-mt-24 ${className} salon-reveal--stagger`}
    >
      <div className="editorial-landing__inner">
        <h2
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          Практики
        </h2>
        <p
          className="editorial-section__subtitle salon-reveal__item"
          style={{ ["--salon-i" as string]: 1 }}
        >
          Выберите формат под задачу — карты, числа или карта рождения.
        </p>
        <div className="editorial-practices__grid">
          {EDITORIAL_PRACTICES.map((practice, index) => {
            const guestDirect =
              "guestHref" in practice && typeof practice.guestHref === "string"
                ? practice.guestHref
                : null;
            const href = isLoggedIn
              ? practice.loggedInHref
              : guestDirect ??
                buildRegisterHref(resolveRegistrationReturnTo(practice.guestReturn));

            return (
              <Link
                key={practice.id}
                href={href}
                className="editorial-practice-card salon-reveal__item"
                style={{ ["--salon-i" as string]: index + 2 }}
              >
                <EditorialImage src={practice.image} alt="" className="editorial-practice-card__img" />
                <div className="editorial-practice-card__overlay" aria-hidden />
                <div className="editorial-practice-card__copy">
                  <p className="editorial-practice-card__title">{practice.title}</p>
                  <p className="editorial-practice-card__subtitle">{practice.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}