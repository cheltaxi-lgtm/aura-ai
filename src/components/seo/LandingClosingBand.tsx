"use client";

import { useEffect, useRef, useState } from "react";
import LandingFaqSection from "@/components/seo/LandingFaqSection";
import LandingFinalCtaSection from "@/components/seo/LandingFinalCtaSection";

type LandingClosingBandProps = {
  onOpenCards: () => void;
};

/**
 * FAQ + final CTA share one editorial column and a local constellation
 * overlay (same drawing language as SalonBackground; motion scoped here).
 */
export default function LandingClosingBand({ onOpenCards }: LandingClosingBandProps) {
  const bandRef = useRef<HTMLDivElement | null>(null);
  const [skyMotion, setSkyMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const node = bandRef.current;
    let inView = false;
    let visibleDoc = typeof document !== "undefined" ? document.visibilityState === "visible" : true;

    const apply = () => {
      const on = !reduce.matches && inView && visibleDoc;
      setSkyMotion(on);
      if (typeof window !== "undefined") {
        (window as Window & { __zovusClosingSkyMotion?: boolean }).__zovusClosingSkyMotion = on;
      }
    };
    apply();

    let io: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => {
          inView = Boolean(entry?.isIntersecting);
          apply();
        },
        { threshold: 0.12 }
      );
      io.observe(node);
    }

    const onVis = () => {
      visibleDoc = document.visibilityState === "visible";
      apply();
    };
    const onReduce = () => apply();
    document.addEventListener("visibilitychange", onVis);
    reduce.addEventListener("change", onReduce);

    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", onReduce);
    };
  }, []);

  return (
    <div
      ref={bandRef}
      className={`landing-closing-band${skyMotion ? " landing-closing-band--sky-on" : ""}`}
      data-sky-motion={skyMotion ? "on" : "off"}
    >
      <div className="landing-closing-band__sky" aria-hidden="true">
        <div className="landing-closing-band__stars landing-closing-band__stars--far" />
        <div className="landing-closing-band__stars landing-closing-band__stars--mid" />
        <div className="landing-closing-band__stars landing-closing-band__stars--near" />
        <svg
          className="landing-closing-band__lines"
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="rgba(232,199,126,0.28)" strokeWidth="1.2">
            <path d="M80 120 C220 40, 380 200, 520 160 S780 40, 920 120 S1100 220, 1140 180" />
            <path d="M40 520 C180 460, 320 580, 480 540 S760 420, 900 500 S1080 620, 1180 560" />
            <path d="M160 720 C300 640, 420 700, 560 660 S820 580, 980 640" />
          </g>
          <g fill="none" stroke="rgba(201,162,74,0.22)" strokeWidth="1">
            <path d="M200 80 L340 220 L280 360 L460 400" />
            <path d="M720 100 L860 180 L820 320 L980 280 L1040 400" />
            <path d="M100 400 L220 480 L180 600 L340 640" />
            <path d="M640 520 L760 600 L720 700 L880 680" />
          </g>
          <g className="landing-closing-band__dots" fill="rgba(255,245,220,0.55)">
            <circle cx="340" cy="220" r="2.4" />
            <circle cx="280" cy="360" r="2" />
            <circle cx="460" cy="400" r="2.8" />
            <circle cx="860" cy="180" r="2.4" />
            <circle cx="820" cy="320" r="1.8" />
            <circle cx="980" cy="280" r="2.6" />
            <circle cx="220" cy="480" r="2.1" />
            <circle cx="340" cy="640" r="2.3" />
            <circle cx="760" cy="600" r="2" />
            <circle cx="880" cy="680" r="2.5" />
            <circle cx="520" cy="160" r="2.1" />
            <circle cx="900" cy="500" r="2.4" />
          </g>
        </svg>
      </div>

      <div className="editorial-landing__inner landing-closing-band__inner">
        <LandingFaqSection />
        <LandingFinalCtaSection onOpenCards={onOpenCards} />
      </div>
    </div>
  );
}
