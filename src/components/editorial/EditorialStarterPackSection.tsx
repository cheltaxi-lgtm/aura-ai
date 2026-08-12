"use client";

import Link from "next/link";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";
import { buildLoginHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";
import { EDITORIAL_STARTER_PACK } from "@/lib/editorial-landing-content";

type EditorialStarterPackSectionProps = {
  /** When cards are already drawn — primary CTA continues to full reading auth. */
  onContinueFullReading?: () => void;
  /** Fallback: start first free cards if no spread yet. */
  onOpenFreeSpread?: () => void;
  hasDrawnCards?: boolean;
};

export default function EditorialStarterPackSection({
  onContinueFullReading,
  onOpenFreeSpread,
  hasDrawnCards = false,
}: EditorialStarterPackSectionProps) {
  const loginHref = buildLoginHref(resolveRegistrationReturnTo({ guestSpread: true }));
  const { ref, className } = useScrollReveal<HTMLElement>();
  const primaryAction = hasDrawnCards ? onContinueFullReading ?? onOpenFreeSpread : onOpenFreeSpread;
  const primaryLabel = EDITORIAL_STARTER_PACK.primaryCta;

  return (
    <section
      ref={ref}
      id={GUEST_SPREAD_SECTION_ID}
      className={`editorial-starter-pack scroll-mt-24 ${className}`}
      aria-labelledby="editorial-starter-pack-title"
    >
      <div className="editorial-landing__inner">
        <div className="editorial-starter-pack__card salon-reveal__item" style={{ ["--salon-i" as string]: 0 }}>
          <div className="editorial-starter-pack__glow" aria-hidden />
          <div className="editorial-starter-pack__grid">
            <div className="editorial-starter-pack__visual" aria-hidden>
              <div className="editorial-starter-pack__card-stack">
                <span className="editorial-starter-pack__mini-card editorial-starter-pack__mini-card--a" />
                <span className="editorial-starter-pack__mini-card editorial-starter-pack__mini-card--b" />
                <span className="editorial-starter-pack__mini-card editorial-starter-pack__mini-card--c" />
              </div>
            </div>

            <div className="editorial-starter-pack__copy">
              <p className="editorial-starter-pack__eyebrow">{EDITORIAL_STARTER_PACK.eyebrow}</p>
              <h2 id="editorial-starter-pack-title" className="editorial-starter-pack__title">
                {EDITORIAL_STARTER_PACK.title}
              </h2>
              <p className="editorial-starter-pack__subtitle">{EDITORIAL_STARTER_PACK.subtitle}</p>
              <ul className="editorial-starter-pack__perks">
                {EDITORIAL_STARTER_PACK.benefits.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="editorial-starter-pack__value">{EDITORIAL_STARTER_PACK.secondaryBenefit}</p>
              <ul className="editorial-starter-pack__support">
                <li>{EDITORIAL_STARTER_PACK.spaceBenefit}</li>
                <li>{EDITORIAL_STARTER_PACK.runesBenefit}</li>
                <li>{EDITORIAL_STARTER_PACK.noCardBenefit}</li>
              </ul>
              <div className="editorial-starter-pack__actions">
                {primaryAction ? (
                  <button
                    type="button"
                    className="editorial-btn editorial-btn--gold editorial-starter-pack__cta-primary"
                    onClick={primaryAction}
                  >
                    {primaryLabel}
                  </button>
                ) : null}
                <Link href={loginHref} className="editorial-btn editorial-btn--ghost">
                  {EDITORIAL_STARTER_PACK.secondaryCta}
                </Link>
              </div>
              <p className="editorial-starter-pack__fine">{EDITORIAL_STARTER_PACK.fine}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
