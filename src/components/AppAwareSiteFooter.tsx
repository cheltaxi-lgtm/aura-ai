"use client";

import SiteFooter from "@/components/SiteFooter";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { useEffect, useState } from "react";

/** Legal/SEO footer on the web; compact version footer inside the native app shell. */
export default function AppAwareSiteFooter() {
  const [inShell, setInShell] = useState(false);

  useEffect(() => {
    setInShell(shouldUseAppShellClient());
    const observer = new MutationObserver(() => {
      setInShell(shouldUseAppShellClient());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-shell"] });
    return () => observer.disconnect();
  }, []);

  if (inShell) return null;
  return <SiteFooter />;
}
