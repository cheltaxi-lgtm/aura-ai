"use client";

import { useEffect } from "react";
import { trackShareLandingView } from "@/lib/share/metrika";

interface Props {
  token: string;
  kind: string;
}

export default function ShareLandingTracker({ token, kind }: Props) {
  useEffect(() => {
    trackShareLandingView(token, kind);
  }, [token, kind]);

  return null;
}
