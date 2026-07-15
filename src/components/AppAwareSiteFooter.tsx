"use client";

import SiteFooter from "@/components/SiteFooter";
import EditorialSiteFooter from "@/components/editorial/EditorialSiteFooter";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Legal/SEO footer on the web; editorial footer on home; hidden in app shell. */
export default function AppAwareSiteFooter() {
  const [inShell, setInShell] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    setInShell(shouldUseAppShellClient());
    const observer = new MutationObserver(() => {
      setInShell(shouldUseAppShellClient());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-shell"] });
    return () => observer.disconnect();
  }, []);

  if (inShell) return null;
  if (isHome) return <EditorialSiteFooter />;
  return <SiteFooter />;
}
