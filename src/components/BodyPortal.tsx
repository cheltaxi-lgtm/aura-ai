"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface BodyPortalProps {
  children: ReactNode;
  /** When false, nothing is rendered (avoids empty portal nodes). */
  active?: boolean;
}

/** Renders children into document.body — escapes parent stacking contexts. */
export default function BodyPortal({ children, active = true }: BodyPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active) return null;
  return createPortal(children, document.body);
}
