"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin/ads", label: "Обзор", exact: true },
  { href: "/admin/ads/sources", label: "Источники" },
  { href: "/admin/ads/queries", label: "Запросы" },
  { href: "/admin/ads/opportunities", label: "Возможности" },
  { href: "/admin/ads/seo", label: "SEO" },
  { href: "/admin/ads/semantics", label: "Семантика" },
  { href: "/admin/ads/campaign", label: "Кампания" },
  { href: "/admin/ads/economics", label: "Экономика" },
  { href: "/admin/ads/autopilot", label: "Автопилот" },
  { href: "/admin/ads/approvals", label: "Апрувы" },
  { href: "/admin/ads/alerts", label: "Алерты" },
  { href: "/admin/ads/settings", label: "Настройки" },
];

export default function AdsAdminNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href ||
            pathname.startsWith(`${tab.href}/`) ||
            (tab.href === "/admin/ads/autopilot" &&
              (pathname.startsWith("/admin/ads/rules") || pathname.startsWith("/admin/ads/health")));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border border-aura-gold/50 bg-aura-gold/10 text-aura-gold"
                : "border border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
            }`}
          >
            {tab.label}
            {tab.href === "/admin/ads/approvals" && pendingApprovals > 0 ? (
              <span className="ml-1.5 rounded-full bg-aura-gold/20 px-1.5 py-0.5 text-[10px] text-aura-gold">
                {pendingApprovals}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
