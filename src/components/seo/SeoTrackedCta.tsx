"use client";

import type { MouseEvent } from "react";
import { trackSeoEvent } from "@/lib/seo/metrika";

export default function SeoTrackedCta({
  href,
  children,
  variant = "gold",
  trackGoal,
  trackParams,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "gold" | "ghost";
  trackGoal?: string;
  trackParams?: Record<string, string>;
}) {
  const cls =
    variant === "gold"
      ? "btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
      : "btn-luxe btn-luxe--md btn-luxe--ghost inline-flex";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (trackGoal) trackSeoEvent(trackGoal, trackParams);
    window.location.assign(href);
  };

  return (
    <a
      href={href}
      className={cls}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
