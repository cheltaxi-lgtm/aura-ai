"use client";

import { useEffect, useState } from "react";
import {
  getLandingSocialProofStats,
  mergeLandingSocialProofWithPublicStats,
  type LandingSocialProofStat,
} from "@/lib/landing-social-proof";
import { trackSocialProofView } from "@/lib/seo/metrika";

type LandingSocialProofStatsProps = {
  variant?: "hero" | "trust";
  className?: string;
};

function StatItem({
  stat,
  variant,
}: {
  stat: LandingSocialProofStat;
  variant: "hero" | "trust";
}) {
  return (
    <div className={`landing-social-proof__stat landing-social-proof__stat--${variant}`}>
      <span className="landing-social-proof__value">
        {stat.live ? <span className="landing-social-proof__live" aria-hidden /> : null}
        {stat.value}
      </span>
      <span className="landing-social-proof__label">{stat.label}</span>
    </div>
  );
}

export default function LandingSocialProofStats({
  variant = "trust",
  className = "",
}: LandingSocialProofStatsProps) {
  const [stats, setStats] = useState<LandingSocialProofStat[]>(() => getLandingSocialProofStats());

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const base = getLandingSocialProofStats();
      try {
        const res = await fetch("/api/stats/public");
        if (!res.ok) {
          if (!cancelled) setStats(base);
          return;
        }
        const data = (await res.json()) as { sessions?: number; users?: number };
        const merged = mergeLandingSocialProofWithPublicStats(
          base,
          typeof data.sessions === "number" ? data.sessions : 0,
          typeof data.users === "number" ? data.users : 0
        );
        if (!cancelled) setStats(merged);
      } catch {
        if (!cancelled) setStats(base);
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={`landing-social-proof landing-social-proof--${variant} ${className}`.trim()}
      aria-label="Активность на платформе"
    >
      {stats.map((stat) => (
        <StatItem key={stat.key} stat={stat} variant={variant} />
      ))}
    </div>
  );
}

export function useLandingSocialProofVisible(track = true) {
  useEffect(() => {
    if (!track) return;
    trackSocialProofView();
  }, [track]);
}
