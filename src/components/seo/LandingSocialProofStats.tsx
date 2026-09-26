"use client";

import { useEffect, useState } from "react";
import { getLandingSocialProofStats, type LandingSocialProofStat } from "@/lib/landing-social-proof";
import { trackSocialProofView } from "@/lib/seo/metrika";

type LandingSocialProofStatsProps = { variant?: "hero" | "trust"; className?: string };

export default function LandingSocialProofStats({ variant = "trust", className = "" }: LandingSocialProofStatsProps) {
  const [stats, setStats] = useState<LandingSocialProofStat[]>(() => getLandingSocialProofStats());
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats/public");
        if (!res.ok) return;
        const data = await res.json();
        if (active) setStats(getLandingSocialProofStats(data));
      } catch { /* Keep the last confirmed totals or placeholders. */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return <div className={`landing-social-proof landing-social-proof--${variant} ${className}`.trim()} role="group" aria-label="Активность на платформе">
    {stats.map(stat => <div key={stat.key} className={`landing-social-proof__stat landing-social-proof__stat--${variant}`}>
      <span className="landing-social-proof__value">{stat.value}</span>
      <span className="landing-social-proof__label">{stat.label}</span>
    </div>)}
  </div>;
}

export function useLandingSocialProofVisible(track = true) {
  useEffect(() => { if (track) trackSocialProofView(); }, [track]);
}
