"use client";

import SiteFooter from "@/components/SiteFooter";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Site footer on the web; marketing variant on home; hidden in app shell. */
export default function AppAwareSiteFooter() {
  const [inShell, setInShell] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdmin = Boolean(pathname?.startsWith("/admin"));

  useEffect(() => {
    setInShell(shouldUseAppShellClient());
    const observer = new MutationObserver(() => {
      setInShell(shouldUseAppShellClient());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-app-shell"],
    });
    return () => observer.disconnect();
  }, []);

  if (inShell || isAdmin) return null;
  return <SiteFooter variant={isHome ? "marketing" : "minimal"} />;
}
