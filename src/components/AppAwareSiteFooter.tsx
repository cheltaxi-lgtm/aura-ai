"use client";

import SiteFooter from "@/components/SiteFooter";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { useEffect, useState } from "react";

/** Hides legal/SEO footer inside the native app shell. */
export default function AppAwareSiteFooter() {
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
  return <SiteFooter />;
}
