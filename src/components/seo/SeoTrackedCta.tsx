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

  // No preventDefault: client-side navigation keeps the JS context alive, so
  // the metrika goal fires reliably — and ctrl/cmd+click, middle-click and
  // "open in new tab" keep working (location.assign broke all of them).
  const handleClick = () => {
    if (trackGoal) trackSeoEvent(trackGoal, trackParams);
  };

  return (
    <Link href={href} className={cls} onClick={handleClick}>
      {children}
    </Link>
  );
}
