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
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8 border-b border-[#c9a24a]/25 pb-4">
        <p className="font-display text-xs tracking-[0.2em] text-[#c9a24a]/80">
          ZOVUS PRO
        </p>
        <h1 className="font-display mt-1 text-2xl text-[#ede6da]">
          {title || "Кабинет практика"}
        </h1>
        <nav className="mt-4 flex flex-wrap gap-3 text-sm">
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
                    ? "text-[#e8c77e] underline underline-offset-4"
                    : "text-gray-400 hover:text-[#ede6da]"
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
