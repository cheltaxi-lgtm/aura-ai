"use client";

import { useEffect, useRef, useState } from "react";
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

const TICK_MS = 20_000;
const PUBLIC_STATS_MS = 300_000;

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
  const publicFloorRef = useRef({ sessions: 0, users: 0 });

  useEffect(() => {
    let cancelled = false;

    const apply = () => {
      const next = mergeLandingSocialProofWithPublicStats(
        getLandingSocialProofStats(),
        publicFloorRef.current.sessions,
        publicFloorRef.current.users
      );
      if (!cancelled) setStats(next);
    };

    const fetchPublic = async () => {
      try {
        const res = await fetch("/api/stats/public");
        if (!res.ok) return;
        const data = (await res.json()) as { sessions?: number; users?: number };
        publicFloorRef.current = {
          sessions: typeof data.sessions === "number" ? data.sessions : 0,
          users: typeof data.users === "number" ? data.users : 0,
        };
        apply();
      } catch {
        /* keep synthetic */
      }
    };

    apply();
    void fetchPublic();
    const tick = window.setInterval(apply, TICK_MS);
    const publicTimer = window.setInterval(() => {
      void fetchPublic();
    }, PUBLIC_STATS_MS);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(publicTimer);
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
