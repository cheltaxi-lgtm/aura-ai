"use client";

import { useEffect } from "react";
import { trackSeoEvent } from "@/lib/seo/metrika";

export default function SeoPageTracker({
  goal,
  params,
}: {
  goal: string;
  params?: Record<string, string>;
}) {
  useEffect(() => {
    trackSeoEvent(goal, params);
  }, [goal, params]);

  return null;
}
