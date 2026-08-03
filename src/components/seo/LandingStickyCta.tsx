"use client";

import { useEffect, useRef, useState } from "react";
import { GUEST_SPREAD_PICKER_ID, GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";

type LandingStickyCtaProps = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
};

const VISIBILITY_DEBOUNCE_MS = 140;

const INLINE_CTA_SELECTORS = [
  `#${GUEST_SPREAD_SECTION_ID}`,
  `#${GUEST_SPREAD_PICKER_ID}`,
  ".aura-landing-hero__actions",
  ".editorial-hero__actions",
  ".aura-landing-section--final",
  "#guest-teaser-auth",
] as const;

export default function LandingStickyCta({ label, onClick, hidden }: LandingStickyCtaProps) {
  const [visible, setVisible] = useState(false);
  const [guestSpreadActive, setGuestSpreadActive] = useState(false);
  const obscuredRef = useRef(new Set<Element>());
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const syncGuest = () => {
      setGuestSpreadActive(document.documentElement.dataset.guestSpreadActive === "1");
    };
    syncGuest();
    const obs = new MutationObserver(syncGuest);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-guest-spread-active"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (hidden || guestSpreadActive) {
      setVisible(false);
      return;
    }

    const applyVisibility = () => {
      // Show when no inline CTA block is in view (hero button may be below fold on desktop).
      const next = obscuredRef.current.size === 0;
      setVisible((prev) => (prev === next ? prev : next));
    };

    const scheduleApply = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        applyVisibility();
      }, VISIBILITY_DEBOUNCE_MS);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obscuredRef.current.add(entry.target);
          } else {
            obscuredRef.current.delete(entry.target);
          }
        }
        scheduleApply();
      },
      {
        root: null,
        rootMargin: "-8% 0px -10% 0px",
        threshold: 0.05,
      }
    );

    const targets = INLINE_CTA_SELECTORS.map((selector) => document.querySelector(selector)).filter(
      (node): node is Element => Boolean(node)
    );
    targets.forEach((target) => observer.observe(target));

    applyVisibility();

    window.addEventListener("scroll", scheduleApply, { passive: true });
    window.addEventListener("resize", scheduleApply);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleApply);
      window.removeEventListener("resize", scheduleApply);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [hidden, guestSpreadActive]);

  if (hidden || guestSpreadActive) return null;

  return (
    <div
      className={`landing-sticky-cta${visible ? " landing-sticky-cta--visible" : ""}`}
      role="region"
      aria-label="Быстрое действие"
      aria-hidden={!visible}
    >
      <button type="button" onClick={onClick} className="landing-sticky-cta__btn btn-luxe btn-luxe--md btn-luxe--gold" tabIndex={visible ? 0 : -1}>
        {label}
      </button>
    </div>
  );
}
