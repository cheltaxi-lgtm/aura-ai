"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { trackSeoEvent } from "@/lib/seo/metrika";

export default function SeoTrackedCta({
  href,
  children,
  variant = "gold",
  trackGoal,
  trackParams,
  pendingLabel,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "gold" | "ghost";
  trackGoal?: string;
  trackParams?: Record<string, string>;
  pendingLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const cls =
    variant === "gold"
      ? "btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
      : "btn-luxe btn-luxe--md btn-luxe--ghost inline-flex";

  useEffect(() => {
    if (!pending) return;
    const reset = window.setTimeout(() => {
      pendingRef.current = false;
      setPending(false);
    }, 12_000);
    return () => window.clearTimeout(reset);
  }, [pending]);

  // No preventDefault: client-side navigation keeps the JS context alive, so
  // the metrika goal fires reliably — and ctrl/cmd+click, middle-click and
  // "open in new tab" keep working (location.assign broke all of them).
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pendingRef.current) {
      event.preventDefault();
      return;
    }
    if (trackGoal) trackSeoEvent(trackGoal, trackParams);
    if (
      pendingLabel &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      pendingRef.current = true;
      setPending(true);
    }
  };

  return (
    <Link
      href={href}
      className={`${cls} ${pending ? "pointer-events-none opacity-80" : ""}`}
      onClick={handleClick}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <span role="status" aria-label={pendingLabel} className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-r-transparent" aria-hidden />
          {pendingLabel}
        </span>
      ) : children}
    </Link>
  );
}
