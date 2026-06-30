"use client";

import Link from "next/link";
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

  return (
    <Link
      href={href}
      className={cls}
      onClick={() => {
        if (trackGoal) trackSeoEvent(trackGoal, trackParams);
      }}
    >
      {children}
    </Link>
  );
}
