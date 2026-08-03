"use client";

import SiteFooter from "@/components/SiteFooter";
import { readAppShellFromDocument } from "@/lib/app-shell";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** App / auth / private surfaces keep the legal-only footer. */
const MINIMAL_FOOTER_PREFIXES = [
  "/admin",
  "/cabinet",
  "/auth",
  "/expert",
  "/session",
  "/tg",
  "/joint-reading/",
  "/share/",
  "/master/",
  "/diary",
  "/runes/success",
  "/maintenance",
] as const;

function useMarketingFooter(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  if (pathname === "/joint-reading") return true;
  return !MINIMAL_FOOTER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

/**
 * Site footer on the web. Marketing hub links on SEO pages (organic equity);
 * minimal legal footer on app/auth shells. Hidden in native app shell.
 */
export default function AppAwareSiteFooter() {
  const [inShell, setInShell] = useState(false);
  const pathname = usePathname();
  const isAdmin = Boolean(pathname?.startsWith("/admin"));
  const marketing = useMarketingFooter(pathname);

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
  return <SiteFooter variant={marketing ? "marketing" : "minimal"} />;
}
