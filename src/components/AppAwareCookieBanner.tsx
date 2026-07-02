"use client";

import CookieBanner from "@/components/CookieBanner";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { useEffect, useState } from "react";

export default function AppAwareCookieBanner() {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    setHide(shouldUseAppShellClient());
    const observer = new MutationObserver(() => {
      setHide(shouldUseAppShellClient());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-shell"] });
    return () => observer.disconnect();
  }, []);

  if (hide) return null;
  return <CookieBanner />;
}
