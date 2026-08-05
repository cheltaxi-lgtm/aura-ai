"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/pro", label: "Обзор" },
  { href: "/pro/clients", label: "Клиенты" },
  { href: "/pro/case/new", label: "Новый кейс" },
  { href: "/pro/inbox", label: "Входящие" },
  { href: "/pro/billing", label: "Биллинг" },
  { href: "/pro/settings", label: "Настройки" },
];

export default function ProShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="pro-shell mx-auto w-full max-w-5xl px-4 py-8">
      <header className="pro-shell__header mb-8 pb-4">
        <p className="pro-shell__eyebrow">Zovus Pro</p>
        <h1 className="pro-shell__title mt-1 text-2xl">
          {title || "Кабинет практика"}
        </h1>
        <nav className="mt-4 flex flex-wrap gap-3 text-sm" aria-label="Разделы Pro">
          {NAV.map((item) => {
            const active =
              item.href === "/pro"
                ? pathname === "/pro"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "pro-shell__nav-link pro-shell__nav-link--active"
                    : "pro-shell__nav-link"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
