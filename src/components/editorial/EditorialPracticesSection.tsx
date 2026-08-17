"use client";

import Link from "next/link";
import EditorialImage from "@/components/editorial/EditorialImage";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  EDITORIAL_ADDITIONAL_FORMAT_IDS,
  EDITORIAL_PRACTICES,
  EDITORIAL_SECTION_IDS,
} from "@/lib/editorial-landing-content";
import { buildRegisterHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";

type EditorialPracticesSectionProps = {
  isLoggedIn: boolean;
  /** Prefer same-page guest triplet over /?ask&spread=1 when landing already mounts GuestTripletDraw. */
  onGuestTarot?: () => void;
  /** Guest landing: additional formats only — not a second catalog of the core four. */
  additionalFormats?: boolean;
};

export default function EditorialPracticesSection({
  isLoggedIn,
  onGuestTarot,
  additionalFormats = false,
}: EditorialPracticesSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const practices = additionalFormats
    ? EDITORIAL_PRACTICES.filter((practice) =>
        (EDITORIAL_ADDITIONAL_FORMAT_IDS as readonly string[]).includes(practice.id)
      )
    : EDITORIAL_PRACTICES;

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
          {additionalFormats ? "Другие форматы Zovus" : "Практики"}
        </h2>
        <p
          className="editorial-section__subtitle salon-reveal__item"
          style={{ ["--salon-i" as string]: 1 }}
        >
          {additionalFormats
            ? "ФотоТаро, нумерология и другие форматы — рядом с основными направлениями."
            : "Выберите формат под задачу — карты, числа или карта рождения."}
        </p>
        <div className="editorial-practices__grid">
          {practices.map((practice, index) => {
            const guestDirect =
              "guestHref" in practice && typeof practice.guestHref === "string"
                ? practice.guestHref
                : null;
            const useInlineGuestTarot =
              !isLoggedIn && practice.id === "tarot" && typeof onGuestTarot === "function";
            const href = isLoggedIn
              ? practice.loggedInHref
              : guestDirect ??
                buildRegisterHref(resolveRegistrationReturnTo(practice.guestReturn));

            const copy = (
              <>
                <EditorialImage src={practice.image} alt="" className="editorial-practice-card__img" />
                <div className="editorial-practice-card__overlay" aria-hidden />
                <div className="editorial-practice-card__copy">
                  <p className="editorial-practice-card__title">{practice.title}</p>
                  <p className="editorial-practice-card__subtitle">{practice.subtitle}</p>
                </div>
              </>
            );

            if (useInlineGuestTarot) {
              return (
                <button
                  key={practice.id}
                  type="button"
                  onClick={onGuestTarot}
                  className="editorial-practice-card salon-reveal__item"
                  style={{ ["--salon-i" as string]: index + 2 }}
                >
                  {copy}
                </button>
              );
            }

            return (
              <Link
                key={practice.id}
                href={href}
                className="editorial-practice-card salon-reveal__item"
                style={{ ["--salon-i" as string]: index + 2 }}
              >
                {copy}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
