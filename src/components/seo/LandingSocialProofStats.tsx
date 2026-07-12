"use client";

import { useEffect, useMemo, useState } from "react";
import { getLandingSocialProofStats, type LandingSocialProofStat } from "@/lib/landing-social-proof";
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
    setStats(getLandingSocialProofStats());
    const interval = window.setInterval(() => {
      setStats(getLandingSocialProofStats());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const items = useMemo(() => stats, [stats]);

  return (
    <div
      className={`landing-social-proof landing-social-proof--${variant} ${className}`.trim()}
      aria-label="Активность на платформе"
    >
      {items.map((stat) => (
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
