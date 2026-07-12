"use client";

import { useEffect, useRef, useState } from "react";
import { GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";

type LandingStickyCtaProps = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
};

const SCROLL_SHOW_Y = 420;
const MOBILE_MQ = "(max-width: 768px)";
const VISIBILITY_DEBOUNCE_MS = 140;

const INLINE_CTA_SELECTORS = [
  `#${GUEST_SPREAD_SECTION_ID}`,
  ".aura-landing-hero__actions",
  ".aura-landing-section--final",
] as const;

export default function LandingStickyCta({ label, onClick, hidden }: LandingStickyCtaProps) {
  const [visible, setVisible] = useState(false);
  const obscuredRef = useRef(new Set<Element>());
  const scrolledEnoughRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (hidden) {
      setVisible(false);
      return;
    }

    const mobileQuery = window.matchMedia(MOBILE_MQ);

    const applyVisibility = () => {
      const next =
        mobileQuery.matches && scrolledEnoughRef.current && obscuredRef.current.size === 0;
      setVisible((prev) => (prev === next ? prev : next));
    };

    const scheduleApply = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        applyVisibility();
      }, VISIBILITY_DEBOUNCE_MS);
    };

    const syncScroll = () => {
      scrolledEnoughRef.current = window.scrollY > SCROLL_SHOW_Y;
      scheduleApply();
    };

    const onMobileChange = () => {
      if (!mobileQuery.matches) {
        setVisible(false);
        return;
      }
      scheduleApply();
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

    scrolledEnoughRef.current = window.scrollY > SCROLL_SHOW_Y;
    applyVisibility();

    window.addEventListener("scroll", syncScroll, { passive: true });
    mobileQuery.addEventListener("change", onMobileChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", syncScroll);
      mobileQuery.removeEventListener("change", onMobileChange);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [hidden]);

  if (hidden) return null;

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
