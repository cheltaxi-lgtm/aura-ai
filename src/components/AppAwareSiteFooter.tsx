"use client";

import SiteFooter from "@/components/SiteFooter";
import { readAppShellFromDocument } from "@/lib/app-shell";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Site footer on the web; marketing variant on home; hidden only in the real
 * native/app shell (data-app-shell), not merely because sessionStorage once
 * saw ?app=1 during a prior visit in this tab.
 */
export default function AppAwareSiteFooter() {
  const [inShell, setInShell] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdmin = Boolean(pathname?.startsWith("/admin"));

  useEffect(() => {
    const sync = () => setInShell(readAppShellFromDocument());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-app-shell"],
    });
    return () => observer.disconnect();
  }, []);

  if (inShell || isAdmin) return null;
  return <SiteFooter variant={isHome ? "marketing" : "minimal"} />;
}
