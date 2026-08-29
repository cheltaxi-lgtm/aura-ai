"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyLandingSocialProofLiveOffsets,
  getLandingSocialProofStats,
  landingSocialProofLiveIntervalRange,
  mergeLandingSocialProofWithPublicStats,
  type LandingSocialProofStat,
} from "@/lib/landing-social-proof";
import { trackSocialProofView } from "@/lib/seo/metrika";

type LandingSocialProofStatsProps = {
  variant?: "hero" | "trust";
  className?: string;
};

const ONLINE_TICK_MS = 10_000;
const PUBLIC_STATS_MS = 300_000;
const SESSION_SPREAD_CAP = 5;
const SESSION_USER_CAP = 3;
const BUMP_STAGGER_MS = 28_000;

function nextLiveDelayMs(key: "total" | "users"): number {
  const { min, max } = landingSocialProofLiveIntervalRange(key);
  return min + Math.floor(Math.random() * (max - min + 1));
}

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
  const liveOffsetsRef = useRef({ users: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    let spreadTimer = 0;
    let userTimer = 0;
    let lastBumpAt = 0;

    const apply = () => {
      const next = applyLandingSocialProofLiveOffsets(
        mergeLandingSocialProofWithPublicStats(
          getLandingSocialProofStats(),
          publicFloorRef.current.sessions,
          publicFloorRef.current.users
        ),
        liveOffsetsRef.current
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

    const scheduleBump = (key: "total" | "users") => {
      const cap = key === "total" ? SESSION_SPREAD_CAP : SESSION_USER_CAP;
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        const now = Date.now();
        if (liveOffsetsRef.current[key] < cap && now - lastBumpAt >= BUMP_STAGGER_MS) {
          liveOffsetsRef.current[key] += 1;
          lastBumpAt = now;
          apply();
        }
        if (liveOffsetsRef.current[key] < cap) scheduleBump(key);
      }, nextLiveDelayMs(key));
      if (key === "total") spreadTimer = timer;
      else userTimer = timer;
    };

    apply();
    void fetchPublic();
    scheduleBump("total");
    scheduleBump("users");
    const tick = window.setInterval(apply, ONLINE_TICK_MS);
    const publicTimer = window.setInterval(() => {
      void fetchPublic();
    }, PUBLIC_STATS_MS);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(publicTimer);
      window.clearTimeout(spreadTimer);
      window.clearTimeout(userTimer);
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
